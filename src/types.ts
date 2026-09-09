import type { TestMode } from "./core.js";
import type { MOCK_RESULT, MOCK_PASS_THROUGH } from "./internal/symbols.js";

export type TestModeLogger = Partial<
  Record<
    "debug" | "error" | "info" | "warning",
    (message: string, data?: unknown) => void
  >
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
  | ((
      context: Pick<
        MockContext,
        "headers" | "method" | "params" | "path" | "url"
      >,
    ) => boolean);

export type MockDefinition<TRequest = unknown, TResponse = unknown> = Readonly<{
  caseKey?: string;
  description?: string;
  handler: MockHandler<TRequest, TResponse>;
  match?: RouteMatcher;
  method?: readonly string[] | string;
  pages?: readonly string[];
  path: string;
}>;

export type PatchDefinition<
  TRequest = unknown,
  TResponse = unknown,
> = Readonly<{
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
export type RegisteredMockDefinition = MockDefinition<any, any>;
export type RegisteredPatchDefinition = PatchDefinition<any, any>;

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
