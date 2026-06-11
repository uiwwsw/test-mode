const MOCK_RESULT = Symbol("DOMINOS_TEST_MODE_MOCK_RESULT");
const MOCK_PASS_THROUGH = Symbol("DOMINOS_TEST_MODE_PASS_THROUGH");
const DEFAULT_STORAGE_KEY = "dominos.test.mockRemotePaths";
const DEFAULT_CHANGE_EVENT = "dominos-test-mode:change";
const DEFAULT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const BODYLESS_METHODS = new Set(["DELETE", "GET", "HEAD"]);

export type TestModeLogger = Partial<
  Record<"debug" | "error" | "info" | "warning", (message: string, data?: unknown) => void>
>;

export type MockResult = Readonly<{
  data: unknown;
  headers?: HeadersInit;
  status: number;
  statusText: string;
}>;

export type MockHttpResult = MockResult &
  Readonly<{
    [MOCK_RESULT]: true;
  }>;

export type MockPassThrough = Readonly<{
  [MOCK_PASS_THROUGH]: true;
}>;

export type MockContext<TRequest = unknown> = Readonly<{
  activeKey: string;
  body: TRequest | undefined;
  headers: unknown;
  method: string;
  params: unknown;
  path: string;
  request: TRequest | undefined;
  requestCount: number;
  url: string;
}>;

export type MockHandler<TRequest = unknown, TResponse = unknown> = (
  context: MockContext<TRequest>,
) =>
  | MockHttpResult
  | MockPassThrough
  | Promise<TResponse | MockHttpResult | MockPassThrough>
  | TResponse;

export type PatchHandler<TRequest = unknown, TResponse = unknown> = (
  response: TResponse,
  context: MockContext<TRequest>,
) => Promise<TResponse> | TResponse;

export type RouteMatcher =
  | RegExp
  | string
  | ((context: Pick<MockContext, "headers" | "method" | "params" | "path" | "url">) => boolean);

export type MockDefinition<TRequest = unknown, TResponse = unknown> = Readonly<{
  caseKey?: string;
  description?: string;
  handler: MockHandler<TRequest, TResponse>;
  match?: RouteMatcher;
  method?: readonly string[] | string;
  path: string;
}>;

export type PatchDefinition<TRequest = unknown, TResponse = unknown> = Readonly<{
  caseKey?: string;
  description?: string;
  handler: PatchHandler<TRequest, TResponse>;
  match?: RouteMatcher;
  method?: readonly string[] | string;
  path: string;
}>;

export type TestModeRequest = Readonly<{
  body?: unknown | undefined;
  cookieHeader?: string | null | undefined;
  headers?: unknown | undefined;
  method: string;
  params?: unknown | undefined;
  path: string;
  url?: string | undefined;
}>;

export type TestModePatchRequest = TestModeRequest &
  Readonly<{
    data: unknown;
  }>;

export type CatalogItem = Readonly<{
  active: boolean;
  caseKey?: string;
  description: string;
  key: string;
  mode: "extension" | "mock" | "patch";
  path: string;
}>;

export type TestModeExtensionContext = Readonly<{
  refresh: () => void;
  testMode: TestMode;
}>;

export type TestModeExtension = Readonly<{
  aliases?: readonly string[];
  disable: () => void;
  enable: () => void;
  install?: (context: TestModeExtensionContext) => (() => void) | void;
  isActive: () => boolean;
  key: string;
  label: string;
  subscribe?: (listener: () => void) => () => void;
  toggle?: () => void;
}>;

export type ToggleExtensionOptions = Readonly<{
  aliases?: readonly string[];
  key: string;
  label: string;
  onDisable?: () => void;
  onEnable?: () => void;
  setup?: (context: TestModeExtensionContext) => (() => void) | void;
  storageKey?: string;
}>;

export type TestModeOptions = Readonly<{
  cookieKey?: string;
  definitions?: readonly MockDefinition[];
  enabled?: boolean | (() => boolean);
  eventName?: string;
  logger?: false | TestModeLogger;
  patchDefinitions?: readonly PatchDefinition[];
  storageKey?: string;
}>;

export type TestModeOverlayOptions = Readonly<{
  datasetName?: string;
  document?: Document;
  extensions?: readonly TestModeExtension[];
  globalName?: string;
  installConsole?: boolean;
  namespace?: string;
  watermarkText?: string;
  zIndex?: number;
}>;

export type MockFetchOptions = Readonly<{
  cookieHeader?: string | null;
  mapRequest?: (request: TestModeRequest) => Promise<TestModeRequest> | TestModeRequest;
  originalFetch?: typeof fetch;
  target?: { fetch: typeof fetch };
}>;

export type TestModeConsoleOptions = Readonly<{
  extensions?: readonly TestModeExtension[];
  globalName?: string;
  installExtensions?: boolean;
  namespace?: string;
}>;

type RuntimeDefinition = Readonly<{
  caseKey?: string;
  description?: string;
  handler: MockHandler | PatchHandler;
  key: string;
  match?: RouteMatcher;
  method?: readonly string[];
  mode: "mock" | "patch";
  path: string;
}>;

type ActiveEntry = Readonly<{
  caseKey?: string;
  path: string;
  serialized: string;
}>;

const requestCounts = new Map<string, number>();

const readNodeEnv = () =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.NODE_ENV;

const defaultEnabled = () => readNodeEnv() !== "production";

const parseInputList = (value: readonly string[] | string) =>
  (typeof value === "string" ? value.split(/[;,]/) : [...value])
    .map((item) => item.trim())
    .filter(Boolean);

export const normalizePath = (path: string) => {
  const trimmed = path.trim();

  if (!trimmed) {
    return "";
  }

  try {
    const base =
      typeof window === "undefined"
        ? "https://front.dominos.co.kr"
        : window.location.origin;
    const parsedUrl = URL.canParse(trimmed)
      ? new URL(trimmed)
      : new URL(trimmed, base);

    return parsedUrl.pathname || "/";
  } catch {
    const withoutHash = trimmed.split("#")[0] ?? trimmed;
    const withoutQuery = withoutHash.split("?")[0] ?? withoutHash;

    return withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
  }
};

const createPathCandidates = (path: string) => {
  const normalizedPath = normalizePath(path);

  if (!normalizedPath) {
    return [];
  }

  const withoutApiPrefix = normalizedPath.replace(/^\/api(?=\/)/, "");

  return Array.from(
    new Set([normalizedPath, withoutApiPrefix, `/api${withoutApiPrefix}`]),
  );
};

const serializeEntry = (path: string, caseKey?: string) => {
  const normalizedPath = normalizePath(path);

  return caseKey ? `${normalizedPath}:${encodeURIComponent(caseKey)}` : normalizedPath;
};

const parseEntry = (value: string): ActiveEntry | null => {
  const normalizedValue = normalizePath(value);

  if (!normalizedValue) {
    return null;
  }

  const separatorIndex = normalizedValue.lastIndexOf(":");

  if (separatorIndex <= 0) {
    return {
      path: normalizedValue,
      serialized: normalizedValue,
    };
  }

  const path = normalizedValue.slice(0, separatorIndex);
  const caseKey = decodeURIComponent(
    normalizedValue.slice(separatorIndex + 1).trim(),
  );

  if (!path || !caseKey) {
    return {
      path: normalizedValue,
      serialized: normalizedValue,
    };
  }

  return {
    caseKey,
    path,
    serialized: serializeEntry(path, caseKey),
  };
};

const isSamePath = (left: string, right: string) => {
  const leftCandidates = createPathCandidates(left);
  const rightCandidates = createPathCandidates(right);

  return leftCandidates.some((candidate) => rightCandidates.includes(candidate));
};

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const routePatternToRegExp = (pattern: string) =>
  new RegExp(
    `^${normalizePath(pattern)
      .split("/")
      .map((segment) => {
        if (segment === "*") {
          return ".*";
        }

        if (segment.startsWith(":")) {
          return "[^/]+";
        }

        return escapeRegExp(segment).replace(/\\\*/g, ".*");
      })
      .join("/")}$`,
  );

const doesPathMatch = (pattern: string, path: string) => {
  if (!pattern.includes(":") && !pattern.includes("*")) {
    return isSamePath(pattern, path);
  }

  const matcher = routePatternToRegExp(pattern);

  return createPathCandidates(path).some((candidate) => matcher.test(candidate));
};

const normalizeMethods = (method: readonly string[] | string | undefined) => {
  if (!method) {
    return undefined;
  }

  const methods = (Array.isArray(method) ? method : [method])
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);

  return methods.length > 0 ? methods : undefined;
};

const methodsOverlap = (
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
) => {
  if (!left || !right) {
    return true;
  }

  return left.some((method) => right.includes(method));
};

const parseStoredPaths = (value: string | null | undefined) => {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);

    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
};

const readCookieValue = (cookieHeader: string, name: string) => {
  const rawValue =
    cookieHeader
      .split(";")
      .map((cookie) => cookie.trim())
      .find((cookie) => cookie.startsWith(`${name}=`))
      ?.slice(name.length + 1) ?? "";

  try {
    return decodeURIComponent(rawValue);
  } catch {
    return rawValue;
  }
};

const writeCookie = (
  name: string,
  paths: readonly string[],
  maxAgeSeconds = DEFAULT_COOKIE_MAX_AGE_SECONDS,
) => {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = [
    `${name}=${encodeURIComponent(JSON.stringify(paths))}`,
    "path=/",
    `max-age=${maxAgeSeconds}`,
    "samesite=lax",
  ].join("; ");
};

const isMockHttpResult = (value: unknown): value is MockHttpResult =>
  typeof value === "object" &&
  value !== null &&
  (value as Partial<MockHttpResult>)[MOCK_RESULT] === true;

const isMockPassThrough = (value: unknown): value is MockPassThrough =>
  typeof value === "object" &&
  value !== null &&
  (value as Partial<MockPassThrough>)[MOCK_PASS_THROUGH] === true;

export const httpResult = (result: MockResult): MockHttpResult => ({
  ...result,
  [MOCK_RESULT]: true,
});

export const passThrough = (): MockPassThrough => ({
  [MOCK_PASS_THROUGH]: true,
});

export const defineMock = <TRequest = unknown, TResponse = unknown>(
  path: string,
  handler: MockHandler<TRequest, TResponse>,
  options: Omit<MockDefinition<TRequest, TResponse>, "handler" | "path"> = {},
): MockDefinition<TRequest, TResponse> => ({
  ...options,
  handler,
  path: normalizePath(path),
});

export const definePatch = <TRequest = unknown, TResponse = unknown>(
  path: string,
  handler: PatchHandler<TRequest, TResponse>,
  options: Omit<PatchDefinition<TRequest, TResponse>, "handler" | "path"> = {},
): PatchDefinition<TRequest, TResponse> => ({
  ...options,
  handler,
  path: normalizePath(path),
});

const readExtensionStorage = (storageKey: string) => {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(storageKey) === "true";
};

const writeExtensionStorage = (storageKey: string, active: boolean) => {
  if (typeof window === "undefined") {
    return;
  }

  if (active) {
    window.localStorage.setItem(storageKey, "true");
    return;
  }

  window.localStorage.removeItem(storageKey);
};

export const createToggleExtension = ({
  aliases = [],
  key,
  label,
  onDisable,
  onEnable,
  setup,
  storageKey = `dominos.test.extension.${key}`,
}: ToggleExtensionOptions): TestModeExtension => {
  let activeInMemory = false;
  let sideEffectApplied = false;
  const listeners = new Set<() => void>();
  const isActive = () =>
    typeof window === "undefined"
      ? activeInMemory
      : readExtensionStorage(storageKey);
  const notify = () => {
    for (const listener of listeners) {
      listener();
    }
  };
  const applySideEffect = () => {
    if (sideEffectApplied) {
      return;
    }

    onEnable?.();
    sideEffectApplied = true;
  };
  const releaseSideEffect = () => {
    if (!sideEffectApplied) {
      return;
    }

    onDisable?.();
    sideEffectApplied = false;
  };
  const enable = () => {
    activeInMemory = true;
    writeExtensionStorage(storageKey, true);
    applySideEffect();
    notify();
  };
  const disable = () => {
    activeInMemory = false;
    writeExtensionStorage(storageKey, false);
    releaseSideEffect();
    notify();
  };

  return {
    aliases,
    disable,
    enable,
    install: (context) => {
      const teardown = setup?.(context);

      if (isActive()) {
        applySideEffect();
      }

      return () => {
        releaseSideEffect();
        teardown?.();
      };
    },
    isActive,
    key,
    label,
    subscribe: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    toggle: () => {
      if (isActive()) {
        disable();
        return;
      }

      enable();
    },
  };
};

const normalizeDefinition = (
  definition: MockDefinition | PatchDefinition,
  mode: "mock" | "patch",
): RuntimeDefinition => {
  const method = normalizeMethods(definition.method);
  const normalized: {
    caseKey?: string;
    description?: string;
    handler: MockHandler | PatchHandler;
    key: string;
    match?: RouteMatcher;
    method?: readonly string[];
    mode: "mock" | "patch";
    path: string;
  } = {
    handler: definition.handler,
    key: serializeEntry(definition.path, definition.caseKey),
    mode,
    path: normalizePath(definition.path),
  };

  if (definition.caseKey) {
    normalized.caseKey = definition.caseKey;
  }

  if (definition.description) {
    normalized.description = definition.description;
  }

  if (definition.match) {
    normalized.match = definition.match;
  }

  if (method) {
    normalized.method = method;
  }

  return normalized;
};

export class TestMode {
  readonly cookieKey: string;
  readonly eventName: string;
  readonly storageKey: string;

  private readonly enabled: boolean | (() => boolean);
  private readonly logger: false | TestModeLogger | undefined;
  private definitions: RuntimeDefinition[];
  private memoryPaths: string[] = [];
  private listeners = new Set<(paths: string[]) => void>();

  constructor({
    cookieKey,
    definitions = [],
    enabled = defaultEnabled,
    eventName = DEFAULT_CHANGE_EVENT,
    logger,
    patchDefinitions = [],
    storageKey = DEFAULT_STORAGE_KEY,
  }: TestModeOptions = {}) {
    this.cookieKey = cookieKey ?? storageKey;
    this.enabled = enabled;
    this.eventName = eventName;
    this.logger = logger;
    this.storageKey = storageKey;
    this.definitions = [
      ...definitions.map((definition) => normalizeDefinition(definition, "mock")),
      ...patchDefinitions.map((definition) =>
        normalizeDefinition(definition, "patch"),
      ),
    ];
  }

  isAvailable = () =>
    typeof this.enabled === "function" ? this.enabled() : this.enabled;

  register = (
    definitions: readonly MockDefinition[] = [],
    patchDefinitions: readonly PatchDefinition[] = [],
  ) => {
    this.definitions = [
      ...this.definitions,
      ...definitions.map((definition) => normalizeDefinition(definition, "mock")),
      ...patchDefinitions.map((definition) =>
        normalizeDefinition(definition, "patch"),
      ),
    ];
  };

  active = (cookieHeader?: string | null) => this.read(cookieHeader);

  list = () => {
    const active = this.read();
    const items = this.definitions
      .map((definition) => ({
        active: active.includes(definition.key),
        description: definition.description ?? "No description",
        key: definition.key,
        mode: definition.mode,
        path: definition.path,
        ...(definition.caseKey ? { caseKey: definition.caseKey } : {}),
      }))
      .sort((left, right) => left.key.localeCompare(right.key));

    return {
      active: items.filter((item) => item.active),
      inactive: items.filter((item) => !item.active),
    };
  };

  set = (paths: readonly string[] | string) => {
    const nextPaths: string[] = [];

    for (const input of parseInputList(paths)) {
      const key = this.normalizeActiveInput(input);

      if (!key) {
        continue;
      }

      const existingIndex = nextPaths.findIndex((path) =>
        this.conflicts(path, key),
      );

      if (existingIndex >= 0) {
        nextPaths[existingIndex] = key;
      } else {
        nextPaths.push(key);
      }
    }

    return this.write(nextPaths.sort());
  };

  add = (path: string) => {
    const key = this.normalizeActiveInput(path);

    if (!key) {
      return this.read();
    }

    return this.set([...this.read().filter((item) => !this.conflicts(item, key)), key]);
  };

  remove = (path: string) => {
    const key = this.normalizeActiveInput(path);

    if (!key) {
      return this.read();
    }

    return this.set(this.read().filter((item) => item !== key));
  };

  toggle = (path: string) => {
    const key = this.normalizeActiveInput(path);

    if (!key) {
      return this.read();
    }

    return this.read().includes(key) ? this.remove(key) : this.add(key);
  };

  clear = () => this.write([]);

  subscribe = (listener: (paths: string[]) => void) => {
    this.listeners.add(listener);

    if (typeof window !== "undefined") {
      const handleStorage = (event: StorageEvent) => {
        if (event.key === this.storageKey) {
          listener(this.read());
        }
      };
      const handleCustomEvent = () => listener(this.read());

      window.addEventListener("storage", handleStorage);
      window.addEventListener(this.eventName, handleCustomEvent);

      return () => {
        this.listeners.delete(listener);
        window.removeEventListener("storage", handleStorage);
        window.removeEventListener(this.eventName, handleCustomEvent);
      };
    }

    return () => {
      this.listeners.delete(listener);
    };
  };

  resolve = async ({
    body,
    cookieHeader,
    headers = {},
    method,
    params,
    path,
    url,
  }: TestModeRequest): Promise<MockResult | null> => {
    const definition = this.findActiveDefinition("mock", {
      cookieHeader,
      headers,
      method,
      params,
      path,
      url,
    });

    if (!definition) {
      return null;
    }

    const normalizedMethod = method.toUpperCase();
    const normalizedPath = normalizePath(path);
    const request = BODYLESS_METHODS.has(normalizedMethod) ? params : body;
    const result = await (definition.handler as MockHandler)({
      activeKey: definition.key,
      body: request,
      headers,
      method: normalizedMethod,
      params,
      path: normalizedPath,
      request,
      requestCount: this.nextRequestCount(definition.key),
      url: url ?? normalizedPath,
    });

    if (isMockPassThrough(result)) {
      this.log("info", "Mock pass-through", { method: normalizedMethod, path });
      return null;
    }

    if (isMockHttpResult(result)) {
      return result;
    }

    return {
      data: result,
      status: 200,
      statusText: "OK",
    };
  };

  patch = async ({
    body,
    cookieHeader,
    data,
    headers = {},
    method,
    params,
    path,
    url,
  }: TestModePatchRequest): Promise<unknown | null> => {
    const definition = this.findActiveDefinition("patch", {
      cookieHeader,
      headers,
      method,
      params,
      path,
      url,
    });

    if (!definition) {
      return null;
    }

    const normalizedMethod = method.toUpperCase();
    const normalizedPath = normalizePath(path);
    const request = BODYLESS_METHODS.has(normalizedMethod) ? params : body;

    return await (definition.handler as PatchHandler)(data, {
      activeKey: definition.key,
      body: request,
      headers,
      method: normalizedMethod,
      params,
      path: normalizedPath,
      request,
      requestCount: this.nextRequestCount(definition.key),
      url: url ?? normalizedPath,
    });
  };

  private read = (cookieHeader?: string | null) => {
    if (!this.isAvailable()) {
      return [];
    }

    if (typeof cookieHeader === "string") {
      return this.normalizeActivePaths(
        parseStoredPaths(readCookieValue(cookieHeader, this.cookieKey)),
      );
    }

    if (typeof window === "undefined") {
      return [...this.memoryPaths];
    }

    const cookiePaths =
      typeof document === "undefined"
        ? []
        : parseStoredPaths(readCookieValue(document.cookie, this.cookieKey));

    if (cookiePaths.length > 0) {
      return this.normalizeActivePaths(cookiePaths);
    }

    return this.normalizeActivePaths(
      parseStoredPaths(window.localStorage.getItem(this.storageKey)),
    );
  };

  private write = (paths: readonly string[]) => {
    const normalizedPaths = this.normalizeActivePaths(paths);

    this.memoryPaths = normalizedPaths;

    if (typeof window !== "undefined") {
      window.localStorage.setItem(this.storageKey, JSON.stringify(normalizedPaths));
      writeCookie(this.cookieKey, normalizedPaths);
      window.dispatchEvent(
        new CustomEvent<string[]>(this.eventName, { detail: normalizedPaths }),
      );
    }

    for (const listener of this.listeners) {
      listener(normalizedPaths);
    }

    return normalizedPaths;
  };

  private normalizeActivePaths = (paths: readonly string[]) =>
    Array.from(
      new Set(
        paths
          .map((path) => this.normalizeActiveInput(path))
          .filter((path) => path.length > 0),
      ),
    ).sort();

  private normalizeActiveInput = (input: string) => {
    const trimmed = input.trim();

    if (!trimmed) {
      return "";
    }

    const exact = this.definitions.find((definition) => definition.key === trimmed);

    if (exact) {
      return exact.key;
    }

    const entry = parseEntry(trimmed);

    if (!entry) {
      return "";
    }

    const definition = this.definitions.find(
      (item) =>
        item.caseKey === entry.caseKey &&
        isSamePath(item.path, entry.path),
    );

    return definition?.key ?? "";
  };

  private conflicts = (leftKey: string, rightKey: string) => {
    const left = this.definitions.find((definition) => definition.key === leftKey);
    const right = this.definitions.find((definition) => definition.key === rightKey);

    if (!left || !right) {
      return leftKey === rightKey;
    }

    return isSamePath(left.path, right.path) && methodsOverlap(left.method, right.method);
  };

  private findActiveDefinition = (
    mode: "mock" | "patch",
    request: Omit<TestModeRequest, "body">,
  ) => {
    if (!this.isAvailable()) {
      return null;
    }

    const normalizedMethod = request.method.toUpperCase();
    const normalizedPath = normalizePath(request.path);

    for (const key of this.read(request.cookieHeader)) {
      const definition = this.definitions.find(
        (item) => item.mode === mode && item.key === key,
      );

      if (
        definition &&
        this.methodMatches(definition, normalizedMethod) &&
        this.routeMatches(definition, {
          headers: request.headers ?? {},
          method: normalizedMethod,
          params: request.params,
          path: normalizedPath,
          url: request.url ?? normalizedPath,
        })
      ) {
        return definition;
      }
    }

    return null;
  };

  private methodMatches = (definition: RuntimeDefinition, method: string) =>
    !definition.method || definition.method.includes(method);

  private routeMatches = (
    definition: RuntimeDefinition,
    context: Pick<MockContext, "headers" | "method" | "params" | "path" | "url">,
  ) => {
    const matcher = definition.match ?? definition.path;

    if (typeof matcher === "function") {
      return matcher(context);
    }

    if (matcher instanceof RegExp) {
      matcher.lastIndex = 0;
      return matcher.test(context.path);
    }

    return doesPathMatch(matcher, context.path);
  };

  private nextRequestCount = (key: string) => {
    const nextCount = (requestCounts.get(key) ?? 0) + 1;

    requestCounts.set(key, nextCount);

    return nextCount;
  };

  private log = (
    level: "debug" | "error" | "info" | "warning",
    message: string,
    data?: unknown,
  ) => {
    if (this.logger === false) {
      return;
    }

    this.logger?.[level]?.(message, data);
  };
}

export const createTestMode = (options?: TestModeOptions) =>
  new TestMode(options);

const extensionMatches = (extension: TestModeExtension, input: string) => {
  const trimmed = input.trim();

  return (
    trimmed === extension.key ||
    trimmed === extension.label ||
    (extension.aliases ?? []).includes(trimmed)
  );
};

const findExtension = (
  extensions: readonly TestModeExtension[],
  input: string,
) => extensions.find((extension) => extensionMatches(extension, input)) ?? null;

const activeExtensionLabels = (extensions: readonly TestModeExtension[]) =>
  extensions
    .filter((extension) => extension.isActive())
    .map((extension) => extension.label);

const installExtensions = (
  testMode: TestMode,
  extensions: readonly TestModeExtension[],
  refresh: () => void,
) => {
  const unsubscribes = extensions.map(
    (extension) => extension.subscribe?.(refresh) ?? (() => {}),
  );
  const teardowns = extensions.map(
    (extension) => extension.install?.({ refresh, testMode }) ?? (() => {}),
  );

  return () => {
    for (const teardown of [...teardowns].reverse()) {
      teardown();
    }

    for (const unsubscribe of [...unsubscribes].reverse()) {
      unsubscribe();
    }
  };
};

export const installConsole = (
  testMode: TestMode,
  {
    extensions = [],
    globalName = "test",
    installExtensions: shouldInstallExtensions = true,
    namespace = "__dominosTestMode",
  }: TestModeConsoleOptions = {},
) => {
  if (typeof window === "undefined") {
    return () => {};
  }

  const target = window as unknown as Record<string, unknown>;
  const previousGlobal = Object.getOwnPropertyDescriptor(window, globalName);
  const previousNamespace = Object.getOwnPropertyDescriptor(window, namespace);
  const active = () => [
    ...testMode.active(),
    ...activeExtensionLabels(extensions),
  ];
  const add = (path: string) => {
    const extension = findExtension(extensions, path);

    if (extension) {
      extension.enable();
      return active();
    }

    return testMode.add(path);
  };
  const remove = (path: string) => {
    const extension = findExtension(extensions, path);

    if (extension) {
      extension.disable();
      return active();
    }

    return testMode.remove(path);
  };
  const toggle = (path: string) => {
    const extension = findExtension(extensions, path);

    if (extension) {
      extension.toggle?.();

      if (!extension.toggle) {
        if (extension.isActive()) {
          extension.disable();
        } else {
          extension.enable();
        }
      }

      return active();
    }

    return testMode.toggle(path);
  };
  const set = (paths: readonly string[] | string) => {
    const inputs = parseInputList(paths);
    const mockInputs = inputs.filter((input) => !findExtension(extensions, input));

    for (const extension of extensions) {
      if (inputs.some((input) => extensionMatches(extension, input))) {
        extension.enable();
      } else {
        extension.disable();
      }
    }

    testMode.set(mockInputs);

    return active();
  };
  const clear = () => {
    for (const extension of extensions) {
      extension.disable();
    }

    return testMode.clear();
  };
  const list = () => {
    const catalog = testMode.list();
    const extensionItems: CatalogItem[] = extensions.map((extension) => ({
      active: extension.isActive(),
      description: extension.label,
      key: extension.key,
      mode: "extension",
      path: extension.key,
    }));

    return {
      active: [
        ...catalog.active,
        ...extensionItems.filter((item) => item.active),
      ],
      inactive: [
        ...catalog.inactive,
        ...extensionItems.filter((item) => !item.active),
      ],
    };
  };
  const uninstallExtensions = shouldInstallExtensions
    ? installExtensions(testMode, extensions, () => undefined)
    : () => {};
  const api = Object.assign((path: string) => toggle(path), {
    active,
    add,
    clear,
    isEnabled: () => active().length > 0,
    list,
    remove,
    set,
    toggle,
  });

  target[namespace] = api;
  Object.defineProperty(window, globalName, {
    configurable: true,
    get: () => api,
    set: (value) => {
      if (typeof value === "string") {
        testMode.set(value);
      }
    },
  });

  return () => {
    uninstallExtensions();

    if (previousNamespace) {
      Object.defineProperty(window, namespace, previousNamespace);
    } else {
      delete target[namespace];
    }

    if (previousGlobal) {
      Object.defineProperty(window, globalName, previousGlobal);
    } else {
      delete target[globalName];
    }
  };
};

const setStyles = (element: HTMLElement, styles: Record<string, string>) => {
  for (const [key, value] of Object.entries(styles)) {
    element.style.setProperty(key, value);
  }
};

const createOverlay = (
  documentRef: Document,
  watermarkText: string,
  zIndex: number,
) => {
  const container = documentRef.createElement("div");
  const viewport = documentRef.createElement("div");
  const rail = documentRef.createElement("div");

  container.setAttribute("aria-hidden", "true");
  setStyles(container, {
    inset: "0",
    "pointer-events": "none",
    position: "fixed",
    "user-select": "none",
    "z-index": String(zIndex),
  });
  setStyles(viewport, {
    inset: "0",
    opacity: "0.08",
    overflow: "hidden",
    position: "absolute",
  });
  setStyles(rail, {
    color: "#dc2626",
    display: "flex",
    "flex-wrap": "wrap",
    gap: "32px 48px",
    "justify-content": "center",
    left: "-64px",
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%) rotate(-24deg)",
    width: "140vw",
  });

  for (let index = 0; index < 24; index += 1) {
    const item = documentRef.createElement("span");

    item.textContent = watermarkText;
    setStyles(item, {
      "font-size": "28px",
      "font-weight": "900",
      "letter-spacing": "0",
      "line-height": "1",
      "white-space": "nowrap",
    });
    rail.appendChild(item);
  }

  viewport.appendChild(rail);
  container.appendChild(viewport);

  return container;
};

export const installTestModeOverlay = (
  testMode: TestMode,
  {
    datasetName = "testMode",
    document: documentRef = typeof document === "undefined" ? undefined : document,
    extensions = [],
    globalName = "test",
    installConsole: shouldInstallConsole = true,
    namespace = "__dominosTestMode",
    watermarkText = "TEST MODE",
    zIndex = 2147483647,
  }: TestModeOverlayOptions = {},
) => {
  if (!documentRef) {
    return () => {};
  }

  const overlay = createOverlay(documentRef, watermarkText, zIndex);
  const sync = () => {
    const visible =
      testMode.active().length > 0 ||
      extensions.some((extension) => extension.isActive());

    if (visible) {
      documentRef.documentElement.dataset[datasetName] = "true";

      if (documentRef.body) {
        documentRef.body.dataset[datasetName] = "true";
      }

      if (!overlay.parentElement) {
        (documentRef.body ?? documentRef.documentElement).appendChild(overlay);
      }

      return;
    }

    delete documentRef.documentElement.dataset[datasetName];

    if (documentRef.body) {
      delete documentRef.body.dataset[datasetName];
    }

    overlay.remove();
  };
  const uninstallExtensions = installExtensions(testMode, extensions, sync);
  const unsubscribe = testMode.subscribe(sync);
  const uninstallConsole = shouldInstallConsole
    ? installConsole(testMode, {
        extensions,
        globalName,
        installExtensions: false,
        namespace,
      })
    : () => {};

  sync();

  return () => {
    uninstallConsole();
    unsubscribe();
    uninstallExtensions();
    overlay.remove();
  };
};

const parseBody = async (body: BodyInit | null | undefined) => {
  if (body === null || typeof body === "undefined") {
    return undefined;
  }

  if (typeof body === "string") {
    try {
      return JSON.parse(body) as unknown;
    } catch {
      return body;
    }
  }

  if (body instanceof URLSearchParams) {
    return Object.fromEntries(body.entries());
  }

  return body;
};

const createFetchRequest = async (
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  cookieHeader?: string | null,
): Promise<TestModeRequest> => {
  const request = input instanceof Request ? input : null;
  const base =
    typeof window === "undefined" ? "https://front.dominos.co.kr" : window.location.href;
  const url = new URL(request?.url ?? String(input), base);
  const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
  const headers = new Headers(request?.headers);

  if (init?.headers) {
    for (const [key, value] of new Headers(init.headers).entries()) {
      headers.set(key, value);
    }
  }

  const body =
    BODYLESS_METHODS.has(method)
      ? undefined
      : init?.body
        ? await parseBody(init.body)
        : request
          ? await request.clone().text().then((text) => {
              if (!text.trim()) {
                return undefined;
              }

              try {
                return JSON.parse(text) as unknown;
              } catch {
                return text;
              }
            })
          : undefined;

  return {
    body,
    cookieHeader: cookieHeader ?? headers.get("cookie") ?? headers.get("Cookie"),
    headers,
    method,
    params: Object.fromEntries(url.searchParams.entries()),
    path: url.pathname,
    url: url.toString(),
  };
};

const responseFromMock = (result: MockResult) => {
  const headers = new Headers(result.headers);

  if (typeof result.data === "string") {
    if (!headers.has("content-type")) {
      headers.set("content-type", "text/plain;charset=utf-8");
    }

    return new Response(result.data, {
      headers,
      status: result.status,
      statusText: result.statusText,
    });
  }

  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  return new Response(JSON.stringify(result.data), {
    headers,
    status: result.status,
    statusText: result.statusText,
  });
};

const readResponsePayload = async (response: Response) => {
  const text = await response.clone().text();

  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

export const createMockFetch = (
  testMode: TestMode,
  { cookieHeader, mapRequest, originalFetch = fetch }: MockFetchOptions = {},
): typeof fetch =>
  async (input, init) => {
    const request = mapRequest
      ? await mapRequest(await createFetchRequest(input, init, cookieHeader))
      : await createFetchRequest(input, init, cookieHeader);
    const mock = await testMode.resolve(request);

    if (mock) {
      return responseFromMock(mock);
    }

    const response = await originalFetch(input, init);
    const patched = await testMode.patch({
      ...request,
      data: await readResponsePayload(response),
    });

    if (patched === null) {
      return response;
    }

    return responseFromMock({
      data: patched,
      status: response.status,
      statusText: response.statusText,
    });
  };

export const installMockFetch = (
  testMode: TestMode,
  { target = globalThis, ...options }: MockFetchOptions = {},
) => {
  const originalFetch = target.fetch.bind(target);

  target.fetch = createMockFetch(testMode, {
    ...options,
    originalFetch,
  });

  return () => {
    target.fetch = originalFetch;
  };
};
