import { createCleanup, installProperty } from "./internal/lifecycle.js";
import type {
  StoryListInput,
  TestModeSearchInput,
  TestModeExtension,
  ToggleExtensionOptions,
  TestModeOverlayOptions,
  TestModeConsoleOptions,
  TestModeConsoleHelp,
} from "./types.js";
import type { TestMode } from "./core.js";
import { normalizePath, parseInputList } from "./internal/paths.js";
import { readBrowserStorage, writeBrowserStorage } from "./internal/storage.js";

export type {
  TestModeConsoleOptions,
  TestModeOverlayOptions,
  TestModeExtension,
  TestModeExtensionContext,
  ToggleExtensionOptions,
} from "./types.js";

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
    return memoryOnly || stored === undefined
      ? activeInMemory
      : stored === "true";
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
  const cleanups: (() => void)[] = [];
  const cleanup = createCleanup(cleanups);
  try {
    for (const extension of extensions) {
      cleanups.push(extension.subscribe?.(refresh) ?? (() => {}));
      cleanups.push(extension.install?.({ refresh, testMode }) ?? (() => {}));
    }
  } catch (error) {
    try {
      cleanup();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Extension installation failed",
      );
    }
    throw error;
  }
  return cleanup;
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
    const mockInputs = inputs.filter(
      (input) => !findExtension(extensions, input),
    );

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
  const setStories = (storyKeys: readonly string[] | string) => {
    const keys = parseInputList(storyKeys);
    const entries = keys.flatMap(
      (key) => findStoryCatalogItem(key)?.entries ?? [],
    );
    return keys.length > 0 && entries.length === 0
      ? testMode.active()
      : testMode.set(entries);
  };
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
      "test('story.key')":
        "Apply a story when the key exists; otherwise toggle a feature entry.",
      "test.clear()": "Disable all entries and extensions.",
      "test.feat.add('path:caseKey')": "Enable one feature entry.",
      "test.feat.list()": "List feature mock/patch API entries.",
      "test.feat.remove('path:caseKey')": "Disable one feature entry.",
      "test.feat.set(['path:caseKey'])":
        "Replace active feature entries and extensions.",
      "test.feat.toggle('path:caseKey')": "Toggle one feature entry.",
      "test.search('query')": "Search feature and story catalogs together.",
      "test.story('story.key')":
        "Replace active entries with one story. Alias of test.story.set('story.key').",
      "test.story.add('story.key')":
        "Add a story without clearing currently active entries.",
      "test.story.list()": "List story scenarios.",
      "test.story.list('/page')": "List story scenarios available for a page.",
      "test.story.remove('story.key')":
        "Remove one story's entries from the active entries.",
      "test.story.set(['story.key'])":
        "Replace active entries with one or more stories.",
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
  const cleanups: (() => void)[] = [];
  const cleanup = createCleanup(cleanups);
  try {
    cleanups.push(
      installProperty(target, namespace, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: api,
      }),
    );
    cleanups.push(
      installProperty(target, globalName, {
        configurable: true,
        get: () => api,
        set: (value: unknown) => {
          if (typeof value === "string") {
            if (testMode.hasStory(value)) setStories(value);
            else testMode.set(value);
          }
        },
      }),
    );
    if (shouldInstallExtensions)
      cleanups.push(installExtensions(testMode, extensions, () => undefined));
  } catch (error) {
    try {
      cleanup();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Console installation failed",
      );
    }
    throw error;
  }
  return cleanup;
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
    document: documentRef = typeof document === "undefined"
      ? undefined
      : document,
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
  const windowRef = documentRef.defaultView;
  let installed = true;
  let timer: number | undefined;
  const markers = new Map<HTMLElement, () => void>();
  const clearMarkers = () => {
    const cleanup = createCleanup([...markers.values()]);
    markers.clear();
    cleanup();
  };
  const cleanups: (() => void)[] = [
    () => {
      if (timer !== undefined) windowRef?.clearTimeout(timer);
      overlay.remove();
      clearMarkers();
    },
  ];
  const cleanup = createCleanup(cleanups);
  const getCurrentPage = () =>
    normalizePath(
      documentRef.location?.pathname ??
        (typeof window === "undefined" ? "/" : window.location.pathname),
    );
  const sync = () => {
    if (!installed) return;
    const visible =
      testMode.isAvailable() &&
      (testMode.isActiveForPage(getCurrentPage()) ||
        extensions.some((extension) => extension.isActive()));
    if (visible) {
      for (const element of [documentRef.documentElement, documentRef.body]) {
        if (element && !markers.has(element)) {
          markers.set(
            element,
            installProperty(element.dataset, datasetName, {
              configurable: true,
              enumerable: true,
              writable: true,
              value: "true",
            }),
          );
        }
      }
      if (!overlay.parentElement)
        (documentRef.body ?? documentRef.documentElement).appendChild(overlay);
    } else {
      overlay.remove();
      clearMarkers();
    }
  };
  const scheduleSync = () => {
    if (!installed) return;
    if (timer !== undefined) windowRef?.clearTimeout(timer);
    timer = windowRef?.setTimeout(sync, 0);
  };
  try {
    if (shouldInstallConsole)
      cleanups.push(
        installConsole(testMode, {
          extensions,
          globalName,
          installExtensions: false,
          namespace,
        }),
      );
    cleanups.push(installExtensions(testMode, extensions, sync));
    cleanups.push(testMode.subscribe(sync));
    if (windowRef) {
      for (const eventName of ["hashchange", "popstate"]) {
        windowRef.addEventListener(eventName, scheduleSync);
        cleanups.push(() =>
          windowRef.removeEventListener(eventName, scheduleSync),
        );
      }
      for (const method of ["pushState", "replaceState"] as const) {
        const original = windowRef.history[method];
        cleanups.push(
          installProperty(windowRef.history, method, {
            configurable: true,
            enumerable: true,
            writable: true,
            value: function (
              this: History,
              ...args: Parameters<History[typeof method]>
            ) {
              const result = original.apply(this, args);
              scheduleSync();
              return result;
            },
          }),
        );
      }
    }
    sync();
  } catch (error) {
    installed = false;
    try {
      cleanup();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Overlay installation failed",
      );
    }
    throw error;
  }
  return () => {
    installed = false;
    cleanup();
  };
};
