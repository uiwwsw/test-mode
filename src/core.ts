import type {
  TestModeLogger,
  MockResult,
  MockHttpResult,
  MockPassThrough,
  MockContext,
  MockHandler,
  PatchHandler,
  RouteMatcher,
  MockDefinition,
  PatchDefinition,
  RegisteredMockDefinition,
  RegisteredPatchDefinition,
  TestModeRequest,
  TestModePatchRequest,
  FeatureCatalogItem,
  StoryDefinition,
  StoryListOptions,
  StoryListInput,
  StoryCatalogItem,
  TestModeSearchOptions,
  TestModeSearchInput,
  TestModeSearchResult,
  TestModeOptions,
} from "./types.js";
import { MOCK_RESULT, MOCK_PASS_THROUGH } from "./internal/symbols.js";
import { normalizePath, parseInputList } from "./internal/paths.js";
import {
  parseStoredPaths,
  readCookieValue,
  writeCookie,
  readBrowserStorage,
  writeBrowserStorage,
} from "./internal/storage.js";

export { normalizePath } from "./internal/paths.js";
export type * from "./types.js";

const DEFAULT_STORAGE_KEY = "test-mode.entries";
const DEFAULT_CHANGE_EVENT = "test-mode:change";
const BODYLESS_METHODS = new Set(["GET", "HEAD"]);

type RuntimeDefinition = Readonly<{
  caseKey?: string;
  description?: string;
  handler: MockHandler | PatchHandler;
  key: string;
  match?: RouteMatcher;
  method?: readonly string[];
  mode: "mock" | "patch";
  pages: readonly string[];
  path: string;
}>;

type ActiveEntry = Readonly<{
  caseKey?: string;
  path: string;
  serialized: string;
}>;

const readNodeEnv = () =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.NODE_ENV;

const defaultEnabled = () =>
  ["development", "test"].includes(readNodeEnv() ?? "");

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

  return caseKey
    ? `${normalizedPath}:${encodeURIComponent(caseKey)}`
    : normalizedPath;
};

export const entry = serializeEntry;

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
  let caseKey: string;
  try {
    caseKey = decodeURIComponent(
      normalizedValue.slice(separatorIndex + 1).trim(),
    );
  } catch {
    return null;
  }

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

  return leftCandidates.some((candidate) =>
    rightCandidates.includes(candidate),
  );
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

  return createPathCandidates(path).some((candidate) =>
    matcher.test(candidate),
  );
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

export const defineStory = (
  story: Readonly<{
    description: string;
    entries: readonly string[];
    key: string;
    pages?: readonly string[];
    title: string;
  }>,
): StoryDefinition => ({
  description: story.description,
  entries: story.entries
    .map((item) => parseEntry(item)?.serialized ?? "")
    .filter(Boolean),
  key: story.key,
  pages: story.pages?.map(normalizePath).filter(Boolean) ?? [],
  title: story.title,
});

const normalizeDefinition = (
  definition: RegisteredMockDefinition | RegisteredPatchDefinition,
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
    pages: readonly string[];
    path: string;
  } = {
    handler: definition.handler,
    key: serializeEntry(definition.path, definition.caseKey),
    mode,
    pages: definition.pages?.map(normalizePath).filter(Boolean) ?? [],
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

const normalizeStoryQuery = (query: string | undefined) =>
  query?.trim().toLocaleLowerCase() ?? "";

const normalizeStoryListOptions = (input: StoryListInput): StoryListOptions =>
  typeof input === "string" ? { page: input } : input;

const doesPageMatch = (page: string | undefined, pages: readonly string[]) => {
  const normalizedPage = normalizePath(page ?? "");

  if (!normalizedPage) {
    return true;
  }

  return pages.some((candidate) => {
    const normalizedCandidate = normalizePath(candidate);

    return (
      normalizedCandidate === normalizedPage ||
      (normalizedCandidate !== "/" &&
        normalizedPage.startsWith(`${normalizedCandidate}/`))
    );
  });
};

const doesStoryQueryMatch = (query: string, story: StoryCatalogItem) => {
  if (!query) {
    return true;
  }

  return [
    story.description,
    story.key,
    story.title,
    ...story.entries,
    ...story.pages,
  ].some((value) => value.toLocaleLowerCase().includes(query));
};

const normalizeSearchOptions = (
  input: TestModeSearchInput,
): TestModeSearchOptions =>
  typeof input === "string" ? { query: input } : input;

const doesFeatureQueryMatch = (query: string, feature: FeatureCatalogItem) => {
  if (!query) {
    return true;
  }

  return [
    feature.caseKey,
    feature.description,
    feature.key,
    feature.mode,
    feature.path,
    ...feature.pages,
  ]
    .filter((value): value is string => typeof value === "string")
    .some((value) => value.toLocaleLowerCase().includes(query));
};

export class TestMode {
  readonly cookieKey: string;
  readonly eventName: string;
  readonly storageKey: string;

  private readonly enabled: boolean | (() => boolean);
  private readonly logger: false | TestModeLogger | undefined;
  private definitions: RuntimeDefinition[];
  private storiesCatalog: StoryDefinition[];
  private memoryPaths: string[] = [];
  private listeners = new Set<(paths: string[]) => void>();
  private readonly requestCounts = new Map<string, number>();
  private dispatchingChange = false;
  private memoryOnly = false;

  constructor({
    cookieKey,
    definitions = [],
    enabled = defaultEnabled,
    eventName = DEFAULT_CHANGE_EVENT,
    logger,
    patchDefinitions = [],
    stories = [],
    storageKey = DEFAULT_STORAGE_KEY,
  }: TestModeOptions = {}) {
    this.cookieKey = cookieKey ?? storageKey;
    this.enabled = enabled;
    this.eventName = eventName;
    this.logger = logger;
    this.storageKey = storageKey;
    this.definitions = [
      ...definitions.map((definition) =>
        normalizeDefinition(definition, "mock"),
      ),
      ...patchDefinitions.map((definition) =>
        normalizeDefinition(definition, "patch"),
      ),
    ];
    this.storiesCatalog = stories.map(defineStory);
    this.assertStoriesAreValid();
    this.canonicalizeStories();
  }

  isAvailable = () =>
    typeof this.enabled === "function" ? this.enabled() : this.enabled;

  register = (
    definitions: readonly RegisteredMockDefinition[] = [],
    patchDefinitions: readonly RegisteredPatchDefinition[] = [],
    stories: readonly StoryDefinition[] = [],
  ) => {
    const previousDefinitions = this.definitions;
    const previousStories = this.storiesCatalog;
    this.definitions = [
      ...this.definitions,
      ...definitions.map((definition) =>
        normalizeDefinition(definition, "mock"),
      ),
      ...patchDefinitions.map((definition) =>
        normalizeDefinition(definition, "patch"),
      ),
    ];
    this.storiesCatalog = [...this.storiesCatalog, ...stories.map(defineStory)];
    try {
      this.assertStoriesAreValid();
      this.canonicalizeStories();
    } catch (error) {
      this.definitions = previousDefinitions;
      this.storiesCatalog = previousStories;
      throw error;
    }
    this.notify();
  };

  active = (cookieHeader?: string | null) => this.read(cookieHeader);

  isActiveForPage = (page: string, cookieHeader?: string | null) => {
    const activeKeys = new Set(this.read(cookieHeader));
    const activeDefinitions = this.definitions.filter((definition) =>
      activeKeys.has(definition.key),
    );

    return (
      activeDefinitions.some((definition) =>
        this.definitionMatchesPage(definition, page),
      ) ||
      this.storiesCatalog.some((story) => {
        const entries = story.entries.filter((item) =>
          Boolean(this.findDefinitionByInput(item)),
        );

        return (
          entries.length > 0 &&
          entries.every((item) => activeKeys.has(item)) &&
          doesPageMatch(page, this.getStoryPages(story))
        );
      })
    );
  };

  list = () => {
    const active = this.read();
    const items = this.definitions
      .map((definition) => ({
        active: active.includes(definition.key),
        description: definition.description ?? "No description",
        key: definition.key,
        mode: definition.mode,
        pages: definition.pages,
        path: definition.path,
        ...(definition.caseKey ? { caseKey: definition.caseKey } : {}),
      }))
      .sort((left, right) => left.key.localeCompare(right.key));

    return {
      active: items.filter((item) => item.active),
      inactive: items.filter((item) => !item.active),
    };
  };

  features = this.list;

  stories = (input: StoryListInput = {}) => {
    if (!this.isAvailable()) {
      return [];
    }

    const options = normalizeStoryListOptions(input);
    const active = this.read();
    const query = normalizeStoryQuery(options.query);

    return this.storiesCatalog
      .map((story) => {
        const entries = story.entries.filter((item) =>
          Boolean(this.findDefinitionByInput(item)),
        );
        const pages = this.getStoryPages(story);

        return {
          active:
            entries.length > 0 &&
            entries.every((item) => active.includes(item)),
          activeEntries: entries.filter((item) => active.includes(item)),
          description: story.description,
          entries,
          key: story.key,
          pages,
          title: story.title,
          unavailableEntries: story.entries.filter(
            (item) => !this.findDefinitionByInput(item),
          ),
        };
      })
      .filter((story) => !options.storyKey || story.key === options.storyKey)
      .filter((story) => doesPageMatch(options.page, story.pages))
      .filter((story) => doesStoryQueryMatch(query, story))
      .filter(
        (story) =>
          typeof options.active !== "boolean" ||
          story.active === options.active,
      )
      .sort((left, right) => left.title.localeCompare(right.title));
  };

  search = (input: TestModeSearchInput = {}): TestModeSearchResult => {
    const options = normalizeSearchOptions(input);
    const query = normalizeStoryQuery(options.query);
    const featureItems = [...this.list().active, ...this.list().inactive]
      .filter((feature) => doesPageMatch(options.page, feature.pages))
      .filter((feature) => doesFeatureQueryMatch(query, feature))
      .filter(
        (feature) =>
          typeof options.active !== "boolean" ||
          feature.active === options.active,
      );

    return {
      features: featureItems,
      stories: this.stories(options),
    };
  };

  hasStory = (storyKey: string) =>
    this.storiesCatalog.some((story) => story.key === storyKey);

  story = (storyKey: string) => {
    const story = this.findStory(storyKey);

    return story ? this.set(story.entries) : this.read();
  };

  addStory = (storyKey: string) => {
    const story = this.findStory(storyKey);

    return story ? this.set([...this.read(), ...story.entries]) : this.read();
  };

  set = (paths: readonly string[] | string) => {
    const nextPaths: string[] = [];

    for (const input of parseInputList(paths)) {
      const key = this.normalizeActiveInput(input);

      if (!key) {
        continue;
      }

      const compatible = nextPaths.filter((path) => !this.conflicts(path, key));
      nextPaths.splice(0, nextPaths.length, ...compatible, key);
    }

    return this.write(nextPaths.sort());
  };

  add = (path: string) => {
    const key = this.normalizeActiveInput(path);

    if (!key) {
      return this.read();
    }

    return this.set([
      ...this.read().filter((item) => !this.conflicts(item, key)),
      key,
    ]);
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
        if (event.key === this.storageKey || event.key === null) {
          try {
            if (event.storageArea && event.storageArea !== window.localStorage)
              return;
          } catch {
            return;
          }
          this.memoryPaths = this.normalizeActivePaths(
            parseStoredPaths(event.newValue),
          );
          this.memoryOnly = false;
          writeCookie(this.cookieKey, this.memoryPaths);
          listener(this.read());
        }
      };
      const handleCustomEvent = () => {
        if (!this.dispatchingChange) listener(this.read());
      };

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

  hasMock = (request: TestModeRequest) =>
    this.findActiveDefinition("mock", request) !== null;

  hasPatch = (request: TestModeRequest) =>
    this.findActiveDefinition("patch", request) !== null;

  /** Unlike patch(), this distinguishes a JSON null payload from no match. */
  applyPatch = async ({
    body,
    cookieHeader,
    data,
    headers = {},
    method,
    params,
    path,
    url,
  }: TestModePatchRequest): Promise<Readonly<{ data: unknown }> | null> => {
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

    const patched = await (definition.handler as PatchHandler)(data, {
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
    return { data: patched };
  };

  /** Compatibility helper. Use applyPatch() when a handler can return null. */
  patch = async (request: TestModePatchRequest): Promise<unknown | null> => {
    const result = await this.applyPatch(request);
    return result === null ? null : result.data;
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

    if (typeof window === "undefined" || this.memoryOnly) {
      return [...this.memoryPaths];
    }

    const stored = readBrowserStorage(this.storageKey);
    if (typeof stored === "string") {
      return this.normalizeActivePaths(parseStoredPaths(stored));
    }
    try {
      const cookie =
        typeof document === "undefined"
          ? ""
          : readCookieValue(document.cookie, this.cookieKey);
      if (cookie) return this.normalizeActivePaths(parseStoredPaths(cookie));
    } catch {
      // Fall back to the instance state when browser persistence is unavailable.
    }
    return [...this.memoryPaths];
  };

  private write = (paths: readonly string[]) => {
    if (!this.isAvailable()) return [];
    const normalizedPaths = this.normalizeActivePaths(paths);

    this.memoryPaths = normalizedPaths;

    if (typeof window !== "undefined") {
      this.memoryOnly = !writeBrowserStorage(
        this.storageKey,
        JSON.stringify(normalizedPaths),
      );
      writeCookie(this.cookieKey, normalizedPaths);
    }
    this.notify(normalizedPaths);
    return [...normalizedPaths];
  };

  private notify = (paths = this.read()) => {
    if (typeof window !== "undefined") {
      this.dispatchingChange = true;
      try {
        window.dispatchEvent(
          new CustomEvent<string[]>(this.eventName, { detail: [...paths] }),
        );
      } finally {
        this.dispatchingChange = false;
      }
    }
    for (const listener of this.listeners) listener([...paths]);
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

    const exact = this.definitions.find(
      (definition) => definition.key === trimmed,
    );

    if (exact) {
      return exact.key;
    }

    const entry = parseEntry(trimmed);

    if (!entry) {
      return "";
    }

    const definition = this.findDefinitionByEntry(entry);

    return definition?.key ?? "";
  };

  private findDefinitionByInput = (input: string) => {
    const exact = this.definitions.find(
      (definition) => definition.key === input,
    );

    if (exact) {
      return exact;
    }

    const entry = parseEntry(input);

    return entry ? this.findDefinitionByEntry(entry) : null;
  };

  private findDefinitionByEntry = (entry: ActiveEntry) =>
    this.definitions.find(
      (item) =>
        item.caseKey === entry.caseKey && isSamePath(item.path, entry.path),
    );

  private conflicts = (leftKey: string, rightKey: string) => {
    const left = this.definitions.filter(
      (definition) => definition.key === leftKey,
    );
    const right = this.definitions.filter(
      (definition) => definition.key === rightKey,
    );

    if (left.length === 0 || right.length === 0) {
      return leftKey === rightKey;
    }

    return left.some((a) =>
      right.some(
        (b) => isSamePath(a.path, b.path) && methodsOverlap(a.method, b.method),
      ),
    );
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
        (item) =>
          item.mode === mode &&
          item.key === key &&
          this.methodMatches(item, normalizedMethod) &&
          this.routeMatches(item, {
            headers: request.headers ?? {},
            method: normalizedMethod,
            params: request.params,
            path: normalizedPath,
            url: request.url ?? normalizedPath,
          }),
      );

      if (definition) {
        return definition;
      }
    }

    return null;
  };

  private methodMatches = (definition: RuntimeDefinition, method: string) =>
    !definition.method || definition.method.includes(method);

  private routeMatches = (
    definition: RuntimeDefinition,
    context: Pick<
      MockContext,
      "headers" | "method" | "params" | "path" | "url"
    >,
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
    const nextCount = (this.requestCounts.get(key) ?? 0) + 1;

    this.requestCounts.set(key, nextCount);

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

  private findStory = (storyKey: string) =>
    this.storiesCatalog.find((story) => story.key === storyKey) ?? null;

  private definitionMatchesPage = (
    definition: RuntimeDefinition,
    page: string,
  ) => definition.pages.length === 0 || doesPageMatch(page, definition.pages);

  private getStoryPages = (story: StoryDefinition) =>
    Array.from(
      new Set([
        ...story.pages,
        ...story.entries.flatMap(
          (item) => this.findDefinitionByInput(item)?.pages ?? [],
        ),
      ]),
    ).sort();

  private assertStoriesAreValid = () => {
    const seenStoryKeys = new Set<string>();
    const errors: string[] = [];

    for (const [index, definition] of this.definitions.entries()) {
      if (!definition.path) errors.push("Feature path is required.");
      if (
        this.definitions
          .slice(0, index)
          .some(
            (other) =>
              isSamePath(other.path, definition.path) &&
              other.caseKey === definition.caseKey &&
              methodsOverlap(other.method, definition.method),
          )
      )
        errors.push(`Ambiguous feature entry: ${definition.key}`);
    }

    for (const story of this.storiesCatalog) {
      if (!story.key.trim()) {
        errors.push("Story key is required.");
      } else if (seenStoryKeys.has(story.key)) {
        errors.push(`Duplicate story key: ${story.key}`);
      }

      seenStoryKeys.add(story.key);

      if (!story.title.trim()) {
        errors.push(`Story title is required: ${story.key || "(missing key)"}`);
      }

      if (!story.description.trim()) {
        errors.push(
          `Story description is required: ${story.key || "(missing key)"}`,
        );
      }

      if (this.getStoryPages(story).length === 0) {
        errors.push(
          `Story pages are required: ${story.key || "(missing key)"}`,
        );
      }

      if (story.entries.length === 0) {
        errors.push(
          `Story entries are required: ${story.key || "(missing key)"}`,
        );
      }

      for (const item of story.entries) {
        if (!this.findDefinitionByInput(item)) {
          errors.push(`Story references unknown entry: ${story.key}: ${item}`);
        }
      }
      const canonicalEntries = story.entries
        .map(this.normalizeActiveInput)
        .filter(Boolean);
      if (
        canonicalEntries.some((item, index) =>
          canonicalEntries
            .slice(0, index)
            .some((other) => other !== item && this.conflicts(item, other)),
        )
      ) {
        errors.push(`Story contains conflicting entries: ${story.key}`);
      }
    }

    if (errors.length > 0) {
      throw new Error(`Invalid test-mode stories:\n${errors.join("\n")}`);
    }
  };

  private canonicalizeStories = () => {
    this.storiesCatalog = this.storiesCatalog.map((story) => ({
      ...story,
      entries: [...new Set(story.entries.map(this.normalizeActiveInput))],
    }));
  };
}

export const createTestMode = (options?: TestModeOptions) =>
  new TestMode(options);
