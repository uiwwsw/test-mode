export { createMockFetch, installMockFetch } from "./fetch.js";
export type { MockFetchOptions } from "./fetch.js";

const MOCK_RESULT = Symbol("TEST_MODE_MOCK_RESULT");
const MOCK_PASS_THROUGH = Symbol("TEST_MODE_PASS_THROUGH");
const DEFAULT_STORAGE_KEY = "test-mode.entries";
const DEFAULT_CHANGE_EVENT = "test-mode:change";
const DEFAULT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const BODYLESS_METHODS = new Set(["GET", "HEAD"]);

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
  pages?: readonly string[];
  path: string;
}>;

export type PatchDefinition<TRequest = unknown, TResponse = unknown> = Readonly<{
  caseKey?: string;
  description?: string;
  handler: PatchHandler<TRequest, TResponse>;
  match?: RouteMatcher;
  method?: readonly string[] | string;
  pages?: readonly string[];
  path: string;
}>;

// A registry contains heterogeneous routes. Erase types only at this boundary;
// defineMock/definePatch still type-check each handler's request and response.
type RegisteredMockDefinition = MockDefinition<any, any>;
type RegisteredPatchDefinition = PatchDefinition<any, any>;

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

export type FeatureCatalogItem = Readonly<{
  active: boolean;
  caseKey?: string;
  description: string;
  key: string;
  mode: "extension" | "mock" | "patch";
  pages: readonly string[];
  path: string;
}>;

export type CatalogItem = FeatureCatalogItem;

export type StoryDefinition = Readonly<{
  description: string;
  entries: readonly string[];
  key: string;
  pages: readonly string[];
  title: string;
}>;

export type StoryListOptions = Readonly<{
  active?: boolean;
  page?: string;
  query?: string;
  storyKey?: string;
}>;

export type StoryListInput = StoryListOptions | string;

export type StoryCatalogItem = StoryDefinition &
  Readonly<{
    active: boolean;
    activeEntries: readonly string[];
    unavailableEntries: readonly string[];
  }>;

export type TestModeSearchOptions = Readonly<{
  active?: boolean;
  page?: string;
  query?: string;
}>;

export type TestModeSearchInput = TestModeSearchOptions | string;

export type TestModeSearchResult = Readonly<{
  features: readonly FeatureCatalogItem[];
  stories: readonly StoryCatalogItem[];
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
  definitions?: readonly RegisteredMockDefinition[];
  enabled?: boolean | (() => boolean);
  eventName?: string;
  logger?: false | TestModeLogger;
  patchDefinitions?: readonly RegisteredPatchDefinition[];
  stories?: readonly StoryDefinition[];
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

export type TestModeConsoleOptions = Readonly<{
  extensions?: readonly TestModeExtension[];
  globalName?: string;
  installExtensions?: boolean;
  namespace?: string;
}>;

export type TestModeConsoleHelp = Readonly<{
  commands: Readonly<Record<string, string>>;
  examples: readonly string[];
  summary: string;
}>;

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

const defaultEnabled = () => ["development", "test"].includes(readNodeEnv() ?? "");

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
        ? "https://test-mode.invalid"
        : window.location.origin;
    const parsedUrl = new URL(trimmed, base);

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
    caseKey = decodeURIComponent(normalizedValue.slice(separatorIndex + 1).trim());
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

  try {
    document.cookie = [
      `${name}=${encodeURIComponent(JSON.stringify(paths))}`,
      "path=/",
      `max-age=${maxAgeSeconds}`,
      "samesite=lax",
    ].join("; ");
  } catch {
    // Sandboxed browsers can disable cookies; in-memory controls still work.
  }
};

const readBrowserStorage = (key: string): string | null | undefined => {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage.getItem(key);
  } catch {
    return undefined;
  }
};

const writeBrowserStorage = (key: string, value: string | null) => {
  try {
    if (typeof window === "undefined") return false;
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
    return true;
  } catch {
    // Storage is best effort (e.g. blocked access or an exhausted quota).
    return false;
  }
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

export const createToggleExtension = ({
  aliases = [],
  key,
  label,
  onDisable,
  onEnable,
  setup,
  storageKey = `test-mode.extension.${key}`,
}: ToggleExtensionOptions): TestModeExtension => {
  let activeInMemory = false;
  let memoryOnly = false;
  let sideEffectApplied = false;
  const listeners = new Set<() => void>();
  const isActive = () => {
    const stored = readBrowserStorage(storageKey);
    return memoryOnly || stored === undefined ? activeInMemory : stored === "true";
  };
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
    memoryOnly = !writeBrowserStorage(storageKey, "true");
    applySideEffect();
    notify();
  };
  const disable = () => {
    activeInMemory = false;
    memoryOnly = !writeBrowserStorage(storageKey, null);
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

const normalizeStoryListOptions = (
  input: StoryListInput,
): StoryListOptions => (typeof input === "string" ? { page: input } : input);

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
): TestModeSearchOptions => (typeof input === "string" ? { query: input } : input);

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
      ...definitions.map((definition) => normalizeDefinition(definition, "mock")),
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
      ...definitions.map((definition) => normalizeDefinition(definition, "mock")),
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
          typeof options.active !== "boolean" || story.active === options.active,
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
          typeof options.active !== "boolean" || feature.active === options.active,
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
        if (event.key === this.storageKey || event.key === null) {
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
      const cookie = typeof document === "undefined" ? "" : readCookieValue(document.cookie, this.cookieKey);
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
      this.memoryOnly = !writeBrowserStorage(this.storageKey, JSON.stringify(normalizedPaths));
      writeCookie(this.cookieKey, normalizedPaths);
      this.dispatchingChange = true;
      try {
        window.dispatchEvent(
          new CustomEvent<string[]>(this.eventName, { detail: [...normalizedPaths] }),
        );
      } finally {
        this.dispatchingChange = false;
      }
    }

    for (const listener of this.listeners) {
      listener([...normalizedPaths]);
    }

    return [...normalizedPaths];
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

    const definition = this.findDefinitionByEntry(entry);

    return definition?.key ?? "";
  };

  private findDefinitionByInput = (input: string) => {
    const exact = this.definitions.find((definition) => definition.key === input);

    if (exact) {
      return exact;
    }

    const entry = parseEntry(input);

    return entry ? this.findDefinitionByEntry(entry) : null;
  };

  private findDefinitionByEntry = (entry: ActiveEntry) =>
    this.definitions.find(
      (item) =>
        item.caseKey === entry.caseKey &&
        isSamePath(item.path, entry.path),
    );

  private conflicts = (leftKey: string, rightKey: string) => {
    const left = this.definitions.filter((definition) => definition.key === leftKey);
    const right = this.definitions.filter((definition) => definition.key === rightKey);

    if (left.length === 0 || right.length === 0) {
      return leftKey === rightKey;
    }

    return left.some((a) => right.some((b) =>
      isSamePath(a.path, b.path) && methodsOverlap(a.method, b.method),
    ));
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
      const definition = this.definitions.find((item) =>
        item.mode === mode && item.key === key &&
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
      if (this.definitions.slice(0, index).some((other) =>
        isSamePath(other.path, definition.path) &&
        other.caseKey === definition.caseKey &&
        methodsOverlap(other.method, definition.method)
      )) errors.push(`Ambiguous feature entry: ${definition.key}`);
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
        errors.push(`Story description is required: ${story.key || "(missing key)"}`);
      }

      if (this.getStoryPages(story).length === 0) {
        errors.push(`Story pages are required: ${story.key || "(missing key)"}`);
      }

      if (story.entries.length === 0) {
        errors.push(`Story entries are required: ${story.key || "(missing key)"}`);
      }

      for (const item of story.entries) {
        if (!this.findDefinitionByInput(item)) {
          errors.push(`Story references unknown entry: ${story.key}: ${item}`);
        }
      }
      const canonicalEntries = story.entries.map(this.normalizeActiveInput).filter(Boolean);
      if (canonicalEntries.some((item, index) => canonicalEntries.slice(0, index)
        .some((other) => other !== item && this.conflicts(item, other)))) {
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
    namespace = "__testMode",
  }: TestModeConsoleOptions = {},
) => {
  if (typeof window === "undefined" || !testMode.isAvailable()) {
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
    return testMode.list();
  };
  const feat = {
    add,
    list,
    remove,
    set,
    toggle,
  };
  const findStoryCatalogItem = (storyKey: string) =>
    testMode.stories({ storyKey })[0] ?? null;
  const setStories = (storyKeys: readonly string[] | string) =>
    testMode.set(
      parseInputList(storyKeys).flatMap(
        (storyKey) => findStoryCatalogItem(storyKey)?.entries ?? [],
      ),
    );
  const removeStory = (storyKey: string) => {
    const story = findStoryCatalogItem(storyKey);

    if (!story) {
      return testMode.active();
    }

    const storyEntries = new Set(story.entries);

    return testMode.set(
      testMode.active().filter((item) => !storyEntries.has(item)),
    );
  };
  const toggleStory = (storyKey: string) => {
    const story = findStoryCatalogItem(storyKey);

    if (!story) {
      return testMode.active();
    }

    return story.active ? removeStory(storyKey) : testMode.addStory(storyKey);
  };
  const apply = (input: string) =>
    testMode.hasStory(input) ? setStories(input) : toggle(input);
  const storyCommand = Object.assign(
    (storyKey: string) => setStories(storyKey),
    {
      add: (storyKey: string) => testMode.addStory(storyKey),
      list: (input?: StoryListInput) => testMode.stories(input),
      remove: removeStory,
      set: setStories,
      toggle: toggleStory,
    },
  );
  const help = (): TestModeConsoleHelp => ({
    commands: {
      "test()": "Show this help.",
      "test('story.key')": "Apply a story when the key exists; otherwise toggle a feature entry.",
      "test.clear()": "Disable all entries and extensions.",
      "test.feat.add('path:caseKey')": "Enable one feature entry.",
      "test.feat.list()": "List feature mock/patch API entries.",
      "test.feat.remove('path:caseKey')": "Disable one feature entry.",
      "test.feat.set(['path:caseKey'])": "Replace active feature entries and extensions.",
      "test.feat.toggle('path:caseKey')": "Toggle one feature entry.",
      "test.search('query')": "Search feature and story catalogs together.",
      "test.story('story.key')": "Replace active entries with one story. Alias of test.story.set('story.key').",
      "test.story.add('story.key')": "Add a story without clearing currently active entries.",
      "test.story.list()": "List story scenarios.",
      "test.story.list('/page')": "List story scenarios available for a page.",
      "test.story.remove('story.key')": "Remove one story's entries from the active entries.",
      "test.story.set(['story.key'])": "Replace active entries with one or more stories.",
      "test.story.toggle('story.key')": "Toggle one story.",
    },
    examples: [
      "test()",
      "test.story.list('/cart')",
      "test.search('cart')",
      "test.story('cart.discount-flow')",
      "test.story.add('main.event-popup')",
      "test.feat.add('/api/session/signin:locked')",
      "test.active()",
      "test.clear()",
    ],
    summary:
      "Use story commands for shared screen states; use feat commands for one API mock/patch entry at a time.",
  });
  const uninstallExtensions = shouldInstallExtensions
    ? installExtensions(testMode, extensions, () => undefined)
    : () => {};
  const run = (input?: string) =>
    typeof input === "string" && input.trim() ? apply(input) : help();
  const api = Object.assign(run, {
    active,
    clear,
    feat,
    help,
    isEnabled: () => active().length > 0,
    search: (input?: TestModeSearchInput) => testMode.search(input),
    story: storyCommand,
  });
  const storyAwareApi = api;

  target[namespace] = storyAwareApi;
  Object.defineProperty(window, globalName, {
    configurable: true,
    get: () => storyAwareApi,
    set: (value) => {
      if (typeof value === "string") {
        if (testMode.hasStory(value)) {
          setStories(value);
        } else {
          testMode.set(value);
        }
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
    namespace = "__testMode",
    watermarkText = "TEST MODE",
    zIndex = 2147483647,
  }: TestModeOverlayOptions = {},
) => {
  if (!documentRef || !testMode.isAvailable()) {
    return () => {};
  }

  const overlay = createOverlay(documentRef, watermarkText, zIndex);
  const getCurrentPage = () =>
    normalizePath(
      documentRef.location?.pathname ??
        (typeof window === "undefined" ? "/" : window.location.pathname),
    );
  const sync = () => {
    const visible = testMode.isAvailable() && (
      testMode.isActiveForPage(getCurrentPage()) ||
      extensions.some((extension) => extension.isActive()));

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
  const windowRef = documentRef.defaultView;
  const originalPushState = windowRef?.history.pushState;
  const originalReplaceState = windowRef?.history.replaceState;
  let installed = true;
  let timer: number | undefined;
  const scheduleSync = () => {
    if (!installed) return;
    if (timer !== undefined) windowRef?.clearTimeout(timer);
    timer = windowRef?.setTimeout(() => { if (installed) sync(); }, 0);
  };
  let pushState: History["pushState"] | undefined;
  let replaceState: History["replaceState"] | undefined;

  if (windowRef) {
    windowRef.addEventListener("hashchange", scheduleSync);
    windowRef.addEventListener("popstate", scheduleSync);

    if (originalPushState) {
      pushState = windowRef.history.pushState = function pushState(...args) {
        const result = originalPushState.apply(this, args);

        scheduleSync();

        return result;
      };
    }

    if (originalReplaceState) {
      replaceState = windowRef.history.replaceState = function replaceState(...args) {
        const result = originalReplaceState.apply(this, args);

        scheduleSync();

        return result;
      };
    }
  }
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
    if (!installed) return;
    installed = false;
    if (timer !== undefined) windowRef?.clearTimeout(timer);
    uninstallConsole();
    unsubscribe();
    uninstallExtensions();

    if (windowRef) {
      windowRef.removeEventListener("hashchange", scheduleSync);
      windowRef.removeEventListener("popstate", scheduleSync);

      if (originalPushState && windowRef.history.pushState === pushState) {
        windowRef.history.pushState = originalPushState;
      }

      if (originalReplaceState && windowRef.history.replaceState === replaceState) {
        windowRef.history.replaceState = originalReplaceState;
      }
    }

    overlay.remove();
    delete documentRef.documentElement.dataset[datasetName];
    if (documentRef.body) delete documentRef.body.dataset[datasetName];
  };
};
