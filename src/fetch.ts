import type { MockResult, TestMode, TestModeRequest } from "./index.js";

export type MockFetchOptions = Readonly<{
  cookieHeader?: string | null;
  mapRequest?: (request: TestModeRequest) => Promise<TestModeRequest> | TestModeRequest;
  originalFetch?: typeof fetch;
  target?: { fetch: typeof fetch };
}>;

const BODYLESS_METHODS = new Set(["GET", "HEAD"]);
const BODYLESS_STATUSES = new Set([204, 205, 304]);
const installations = new WeakMap<typeof fetch, { previous: typeof fetch; active: boolean }>();

const parseText = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

const parseBody = async (body: BodyInit | null | undefined) => {
  if (body == null) return undefined;
  if (typeof body === "string") return parseText(body);
  if (body instanceof URLSearchParams) return Object.fromEntries(body.entries());
  return body;
};

const requestMetadata = (
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  cookieHeader?: string | null,
): TestModeRequest => {
  const request = input instanceof Request ? input : undefined;
  const base = typeof document !== "undefined" ? document.baseURI :
    typeof window !== "undefined" ? window.location.href : "https://test-mode.invalid";
  const url = new URL(request?.url ?? String(input), base);
  // RequestInit.headers replaces the Request headers, as native fetch does.
  const headers = new Headers(init?.headers ?? request?.headers);
  return {
    cookieHeader: cookieHeader ?? headers.get("cookie"),
    headers,
    method: (init?.method ?? request?.method ?? "GET").toUpperCase(),
    params: Object.fromEntries(url.searchParams.entries()),
    path: url.pathname,
    url: url.toString(),
  };
};

const readRequestBody = async (
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  method: string,
): Promise<unknown> => {
  if (BODYLESS_METHODS.has(method)) return undefined;
  if (init?.body != null) return parseBody(init.body);
  if (!(input instanceof Request) || input.body === null) return undefined;

  const copy = input.clone();
  const contentType = copy.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) return copy.formData();
  if (contentType.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(await copy.text()));
  }
  return parseText(await copy.text());
};

const isBodyInit = (data: unknown): data is BodyInit =>
  typeof data === "string" ||
  data instanceof Blob ||
  data instanceof FormData ||
  data instanceof URLSearchParams ||
  data instanceof ArrayBuffer ||
  ArrayBuffer.isView(data) ||
  data instanceof ReadableStream;

const responseFromMock = (result: MockResult, method: string) => {
  const headers = new Headers(result.headers);
  let body: BodyInit | null = null;
  if (method !== "HEAD" && !BODYLESS_STATUSES.has(result.status)) {
    if (isBodyInit(result.data)) {
      body = result.data;
    } else if (result.data !== undefined) {
      body = JSON.stringify(result.data);
      if (!headers.has("content-type")) headers.set("content-type", "application/json");
    }
  }
  return new Response(body, { headers, status: result.status, statusText: result.statusText });
};

const readResponsePayload = async (response: Response): Promise<unknown> => {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType && !contentType.includes("json") && !contentType.startsWith("text/") &&
      !contentType.includes("xml") && !contentType.includes("x-www-form-urlencoded")) {
    return response.clone().arrayBuffer();
  }
  const text = await response.clone().text();
  return text.trim() ? parseText(text) : null;
};

const withAbort = <T>(signal: AbortSignal | null | undefined, run: () => Promise<T>): Promise<T> => {
  if (!signal) return run();
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    run().then(
      (value) => { signal.removeEventListener("abort", abort); resolve(value); },
      (error: unknown) => { signal.removeEventListener("abort", abort); reject(error); },
    );
  });
};

const preserveMetadata = (result: Response, source: Response): Response => {
  const clone = result.clone.bind(result);
  Object.defineProperties(result, {
    url: { value: source.url },
    redirected: { value: source.redirected },
    type: { value: source.type },
    clone: { value: () => preserveMetadata(clone(), source) },
  });
  return result;
};

/** Wrap fetch without touching unmatched response bodies (including SSE streams). */
export const createMockFetch = (
  testMode: TestMode,
  { cookieHeader, mapRequest, originalFetch = globalThis.fetch.bind(globalThis) }: MockFetchOptions = {},
): typeof fetch => async (input, init) => {
  if (!testMode.isAvailable()) return originalFetch(input, init);
  const signal = init?.signal === undefined && input instanceof Request ? input.signal : init?.signal;
  return withAbort(signal, async () => {
    let request = requestMetadata(input, init, cookieHeader);
    if (!mapRequest && !testMode.hasMock(request) && !testMode.hasPatch(request)) {
      return originalFetch(input, init);
    }
    request = { ...request, body: await readRequestBody(input, init, request.method) };
    if (mapRequest) request = await mapRequest(request);
    signal?.throwIfAborted();
    const mock = await testMode.resolve(request);
    signal?.throwIfAborted();
    if (mock) return responseFromMock(mock, request.method.toUpperCase());

    const response = await originalFetch(input, init);
    // Opaque and bodyless responses cannot be reconstructed with a payload.
    if (response.status === 0 || request.method.toUpperCase() === "HEAD" ||
        BODYLESS_STATUSES.has(response.status) || !testMode.hasPatch(request)) return response;

    const patched = await testMode.applyPatch({ ...request, data: await readResponsePayload(response) });
    signal?.throwIfAborted();
    if (patched === null) return response;

    const headers = new Headers(response.headers);
    // These describe the upstream bytes, which no longer match the patched body.
    for (const name of ["content-length", "content-encoding", "etag", "content-md5", "digest"]) {
      headers.delete(name);
    }
    const result = responseFromMock({
      data: patched.data, headers, status: response.status, statusText: response.statusText,
    }, request.method.toUpperCase());
    // The Response constructor does not accept transport metadata.
    return preserveMetadata(result, response);
  });
};

/** Cleanup is idempotent and supports nested installations in any teardown order. */
export const installMockFetch = (
  testMode: TestMode,
  { target = globalThis, originalFetch: transport, ...options }: MockFetchOptions = {},
) => {
  const previous = target.fetch;
  const originalFetch = transport ?? previous.bind(target);
  const wrapped = createMockFetch(testMode, { ...options, originalFetch });
  const installation = { previous, active: true };
  const replacement: typeof fetch = (input, init) =>
    installation.active ? wrapped(input, init) : previous.call(target, input, init);
  installations.set(replacement, installation);
  target.fetch = replacement;
  return () => {
    installation.active = false;
    if (target.fetch === replacement) {
      let restore = previous;
      let state = installations.get(restore);
      while (state && !state.active) {
        restore = state.previous;
        state = installations.get(restore);
      }
      target.fetch = restore;
    }
  };
};
