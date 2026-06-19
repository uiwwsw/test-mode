# @uiwwsw/test-mode

Framework-neutral TypeScript runtime for API test mode, story-based scenarios, browser console control, overlays, and `fetch` mocking.

<p align="center">
  <img src="https://raw.githubusercontent.com/uiwwsw/test-mode/main/docs/demo.gif" alt="Console toggles a test scenario, the real API response is reused, and selected fields are overridden under a TEST MODE overlay." width="760" />
</p>

## Why

Most frontend teams need two kinds of test-mode controls:

- **Story tests**: shared, user-visible states such as `cart.load.server-error` or `auth.login.locked`.
- **General tests**: low-level API mock/patch entries such as `/api/session/signin:locked`.

`@uiwwsw/test-mode` supports both. Use stories when sharing QA/product/design scenarios. Use low-level entries when debugging API behavior.

```js
test(); // command help
test.story.list("/cart");
test.story("cart.load.server-error");
test.active();
test.clear();
```

## Features

- Story catalog with `defineStory`, `entry`, `test.story.list/add/remove/set/toggle()`, and `test.story()`
- Feature-level mock and patch entries with `defineMock`, `definePatch`, `test.feat.add()`, and `test.feat.list()`
- Search across feature and story catalogs with `test.search()`
- Page-aware vanilla DOM `TEST MODE` overlay
- Global `fetch` patching
- Server/proxy integration hooks for requests that cannot use browser `fetch`
- Browser storage and cookie handoff for SSR/server requests
- App-specific extensions for popups, SDKs, iframes, `window.open`, or `postMessage`
- No React, Vue, Next.js, Redux, axios, or test-runner dependency

## Install

```bash
npm install @uiwwsw/test-mode
```

```bash
pnpm add @uiwwsw/test-mode
```

Local tarball install before publishing:

```bash
npm install ../test-mode2/uiwwsw-test-mode-0.1.0.tgz
```

## Create Your Test Mode Folder

After installing the package, create one app-owned folder for test mode definitions.

Recommended location:

```txt
src/test-mode/
```

The package ships a starter template:

```txt
node_modules/@uiwwsw/test-mode/templates/test-mode/
```

Copy it into your app:

```bash
cp -R node_modules/@uiwwsw/test-mode/templates/test-mode src/test-mode
```

On Windows PowerShell:

```powershell
Copy-Item -Recurse node_modules/@uiwwsw/test-mode/templates/test-mode src/test-mode
```

Template structure:

```txt
src/test-mode/
  config.ts
  index.ts
  install.ts
  features/
    auth.ts
  stories/
    auth.stories.ts
```

- `config.ts`: app-specific storage keys, cookie key, event name, overlay labels.
- `features/*`: one API behavior at a time with `defineMock` or `definePatch`.
- `stories/*`: combinations of feature entries with `defineStory`.
- `index.ts`: creates the app runtime from features and stories.
- `install.ts`: installs `test`, overlay, and fetch patching.

Then call `installAppTestMode()` once from your client bootstrap.

## Quick Start

```ts
import {
  createTestMode,
  defineMock,
  defineStory,
  entry,
  httpResult,
  installMockFetch,
  installTestModeOverlay,
} from "@uiwwsw/test-mode";

const runtime = createTestMode({
  enabled: () => import.meta.env.DEV,
  definitions: [
    defineMock(
      "/api/session/signin",
      () =>
        httpResult({
          data: {
            code: "AU-105",
            data: null,
            message: "Password is locked",
            status: 400,
          },
          status: 200,
          statusText: "OK",
        }),
      {
        caseKey: "locked",
        description: "Login locked account branch",
        pages: ["/login"],
      },
    ),
  ],
  stories: [
    defineStory({
      key: "auth.login.locked",
      title: "Login - locked account",
      description: "Shows the locked password branch on the login screen.",
      entries: [entry("/api/session/signin", "locked")],
    }),
  ],
});

installTestModeOverlay(runtime);
installMockFetch(runtime);
```

Browser console:

```js
test(); // command help
test.story.list("/login");
test.story("auth.login.locked");
test.active();
test.clear();
```

## Console API

The template installs the browser console API for you. After installation, use `test` in the browser console.

```js
test(); // help
test.help(); // same help object
test.search(); // every registered feature and story entry
test.search("cart"); // search feature and story catalogs together

test.story.list(); // story catalog
test.story.list("/cart"); // stories for one page
test.story.list({ page: "/cart", query: "error" });
test.story.add("main.event-popup"); // add one story
test.story.remove("main.event-popup"); // remove one story's entries
test.story.set(["cart.load.server-error"]); // replace active entries with stories
test.story.toggle("cart.load.server-error"); // toggle one story
test.story("cart.load.server-error"); // shorthand for test.story.set("cart.load.server-error")

test.feat.list(); // feature-level mock/patch API catalog
test.feat.add("/api/session/signin:locked");
test.feat.remove("/api/session/signin:locked");
test.feat.toggle("/api/session/signin:locked");
test.feat.set(["/api/session/signin:locked"]);

test.active();
test.clear();
```

`test.story.list()` and `test.feat.list()` only show entries registered by your app through `src/test-mode/stories/*` and `src/test-mode/features/*`. `test.search()` is the global view across both catalogs; call it with no input to list everything, or pass a string/options object to filter.

`test("some.key")` is story-aware:

- if `some.key` is a story key, it applies that story
- otherwise it toggles a feature-level mock/patch/extension entry

## Story-Based Scenarios

Stories are the recommended sharing layer. They group one or more mock/patch entries into a screen state.

```ts
import {
  createTestMode,
  defineMock,
  definePatch,
  defineStory,
  entry,
} from "@uiwwsw/test-mode";

const runtime = createTestMode({
  definitions: [
    defineMock(
      "/orders/cart/getCartInfo",
      () => ({
        code: "200",
        data: { items: [{ name: "Pepperoni Pizza" }] },
        message: "OK",
        status: 200,
      }),
      { pages: ["/cart"] },
    ),
    defineMock(
      "/orders/cart/getCartInfo",
      () => ({
        code: "502",
        data: null,
        message: "Temporary cart failure",
        status: 502,
      }),
      {
        caseKey: "server-error",
        description: "Cart load server error",
        pages: ["/cart"],
      },
    ),
  ],
  patchDefinitions: [
    definePatch("/promotions/event/getPrmtEventList", (response) => ({
      ...(response as object),
      testPopup: true,
    }), { pages: ["/"] }),
  ],
  stories: [
    defineStory({
      key: "cart.full",
      title: "Cart - full",
      description: "Shows a cart with menu data loaded.",
      entries: [entry("/orders/cart/getCartInfo")],
    }),
    defineStory({
      key: "cart.load.server-error",
      title: "Cart - server error",
      description: "Shows the cart load failure state.",
      entries: [entry("/orders/cart/getCartInfo", "server-error")],
    }),
    defineStory({
      key: "main.event-popup",
      title: "Main - event popup",
      description: "Patches the event popup response on the main screen.",
      entries: [entry("/promotions/event/getPrmtEventList")],
    }),
  ],
});
```

Story rules:

- `key`, `title`, `description`, and `entries` are required.
- `pages` are inherited from referenced feature entries and merged with explicit story pages.
- Story keys must be unique.
- Story entries must point to registered mock or patch entries.
- Stories do not require tags. Search by `page`, `key`, `title`, and `description` first.

More detail: [Story-Based Test Mode Design](./docs/story-test-design.md).

## Recommended App Structure

Keep feature entries and stories in separate folders. A feature owns one API behavior. A story combines features into a screen state.

```txt
src/test-mode/
  index.ts
  features/
    auth.ts
    cart.ts
    promotions.ts
  stories/
    auth.stories.ts
    cart.stories.ts
```

Feature file:

```ts
// src/test-mode/features/auth.ts
import { defineMock, httpResult } from "@uiwwsw/test-mode";

export const authFeatures = [
  defineMock(
    "/api/session/signin",
    () =>
      httpResult({
        data: {
          code: "AU-105",
          data: null,
          message: "Password is locked",
          status: 400,
        },
        status: 200,
        statusText: "OK",
      }),
      {
        caseKey: "locked",
        description: "Login locked account branch",
        pages: ["/login"],
      },
    ),
];
```

Story file:

```ts
// src/test-mode/stories/auth.stories.ts
import { defineStory, entry } from "@uiwwsw/test-mode";

export const authStories = [
  defineStory({
    key: "auth.login.locked",
    title: "Login - locked account",
    description: "Shows the locked password branch on the login screen.",
    entries: [entry("/api/session/signin", "locked")],
  }),
];
```

Runtime file:

```ts
// src/test-mode/index.ts
import { createTestMode } from "@uiwwsw/test-mode";
import { authFeatures } from "./features/auth";
import { authStories } from "./stories/auth.stories";

export const runtime = createTestMode({
  enabled: () => import.meta.env.DEV,
  definitions: [...authFeatures],
  stories: [...authStories],
});
```

## Mock vs Patch

Mock replaces the response before the real request goes out.

```ts
import { defineMock, httpResult } from "@uiwwsw/test-mode";

defineMock("/orders/cart/getCartInfo", () =>
  httpResult({
    data: {
      code: "200",
      data: { items: [] },
      message: "OK",
      status: 200,
    },
    status: 200,
    statusText: "OK",
  }),
);
```

Patch lets the real request happen, then modifies the response.

```ts
import { definePatch } from "@uiwwsw/test-mode";

definePatch("/menus/:menuCode", (response) => ({
  ...(response as object),
  patchedByTest: true,
}));
```

Use `passThrough()` from a mock handler when a mock should conditionally let the real request continue.

```ts
import { defineMock, passThrough } from "@uiwwsw/test-mode";

defineMock("/api/search", ({ params }) => {
  if ((params as { q?: string }).q !== "test") {
    return passThrough();
  }

  return { results: [] };
});
```

## Bootstrap Patterns

### Vanilla or Vite

```ts
import { installMockFetch, installTestModeOverlay } from "@uiwwsw/test-mode";
import { runtime } from "./test-mode";

if (import.meta.env.DEV) {
  installTestModeOverlay(runtime);
  installMockFetch(runtime);
}
```

### React

Install test mode once in a client-only bootstrap module.

```ts
// src/test-mode.ts
import {
  createTestMode,
  defineMock,
  installMockFetch,
  installTestModeOverlay,
} from "@uiwwsw/test-mode";

export const runtime = createTestMode({
  enabled: () => import.meta.env.DEV,
  definitions: [
    defineMock("/api/example", () => ({
      ok: true,
      source: "mock",
    })),
  ],
});

export const installAppTestMode = () => {
  const uninstallOverlay = installTestModeOverlay(runtime);
  const uninstallFetch = installMockFetch(runtime);

  return () => {
    uninstallFetch();
    uninstallOverlay();
  };
};
```

```tsx
// src/main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { installAppTestMode } from "./test-mode";

if (import.meta.env.DEV) {
  installAppTestMode();
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

### Next.js App Router

```tsx
"use client";

import { useEffect } from "react";
import { installAppTestMode } from "../test-mode";

export function TestModeClient() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      return;
    }

    return installAppTestMode();
  }, []);

  return null;
}
```

Render `<TestModeClient />` from a client boundary such as a provider component.

### Vue

```ts
// src/main.ts
import { createApp } from "vue";
import App from "./App.vue";
import { installAppTestMode } from "./test-mode";

if (import.meta.env.DEV) {
  installAppTestMode();
}

createApp(App).mount("#app");
```

## Advanced: Server or Proxy Integration

Most apps should use the browser `test` API. Use this advanced hook only when requests do not go through browser `fetch`, or when your server/proxy must participate in test mode.

```ts
const mock = await runtime.resolve({
  body,
  cookieHeader: request.headers.get("cookie"),
  headers: request.headers,
  method: request.method,
  params,
  path: normalizedPath,
  url: upstreamUrl,
});

if (mock) {
  return Response.json(mock.data, {
    headers: mock.headers,
    status: mock.status,
    statusText: mock.statusText,
  });
}

const upstream = await fetch(upstreamUrl, init);
const payload = await upstream.clone().json().catch(() => null);
const patched = await runtime.patch({
  body,
  cookieHeader: request.headers.get("cookie"),
  data: payload,
  headers: request.headers,
  method: request.method,
  params,
  path: normalizedPath,
  url: upstreamUrl,
});

if (patched !== null) {
  return Response.json(patched, {
    status: upstream.status,
    statusText: upstream.statusText,
  });
}

return upstream;
```

## Request Matching

Static paths, route params, wildcards, regular expressions, and custom matchers are supported.

```ts
defineMock("/orders/:orderId", () => ({ ok: true }));
defineMock("/orders/*", () => ({ ok: true }));
defineMock(/\/orders\/\d+/, () => ({ ok: true }));
defineMock(
  "/orders",
  () => ({ ok: true }),
  {
    match: ({ method, path }) => method === "POST" && path === "/orders",
    method: "POST",
  },
);
```

If the browser request path needs to be normalized before matching, use `mapRequest`.

```ts
installMockFetch(runtime, {
  mapRequest(request) {
    if (request.path.startsWith("/next/api/")) {
      return {
        ...request,
        path: request.path.replace(/^\/next\/api/, "/api"),
      };
    }

    return request;
  },
});
```

This changes only how test mode matches the request. Real transport rewrites should stay in the app's API client or proxy.

## App-Specific Extensions

Use extensions for behavior that is not a normal API response: popup, iframe, SDK, `window.open`, `postMessage`, or browser-only integrations.

```ts
import {
  createTestMode,
  createToggleExtension,
  installTestModeOverlay,
} from "@uiwwsw/test-mode";

let originalOpen: typeof window.open | null = null;

const passAuthExtension = createToggleExtension({
  aliases: ["본인인증", "pass-auth", "pass"],
  key: "pass-auth",
  label: "본인인증",
  onEnable() {
    if (originalOpen) return;

    originalOpen = window.open.bind(window);
    window.open = (url, target, features) => {
      const parsedUrl = new URL(String(url ?? ""), window.location.href);

      if (parsedUrl.pathname !== "/kgauth/request") {
        return originalOpen?.(url, target, features) ?? null;
      }

      window.setTimeout(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: {
              code: "AU-000",
              data: { name: "테스트", phone: "01012345678" },
              message: "OK",
            },
            origin: parsedUrl.origin,
          }),
        );
      }, 0);

      return { closed: false, close() {}, focus() {} } as Window;
    };
  },
  onDisable() {
    if (!originalOpen) return;

    window.open = originalOpen;
    originalOpen = null;
  },
});

const runtime = createTestMode({ enabled: () => import.meta.env.DEV });

installTestModeOverlay(runtime, {
  extensions: [passAuthExtension],
});
```

Console:

```js
test.feat.add("본인인증");
test.active(); // includes "본인인증"
test.feat.remove("본인인증");
```

## Public Usage Surface

Browser console:

- `test()`
- `test.search(input?)`
- `test.feat.list()`
- `test.feat.add(path)`
- `test.feat.remove(path)`
- `test.feat.set(paths)`
- `test.feat.toggle(path)`
- `test.story.list(input?)`
- `test.story.add(storyKey)`
- `test.story.remove(storyKey)`
- `test.story.set(storyKeys)`
- `test.story.toggle(storyKey)`
- `test.story(storyKey)`
- `test.active()`
- `test.clear()`

Setup helpers used by the app template:

- `createTestMode(options)`
- `defineMock(path, handler, options?)`
- `definePatch(path, handler, options?)`
- `defineStory(story)`
- `entry(path, caseKey?)`
- `httpResult(result)`
- `passThrough()`
- `installConsole(...)`
- `installTestModeOverlay(...)`
- `installMockFetch(...)`
- `createMockFetch(...)`
- `createToggleExtension(options)`

Do not teach application users to call runtime methods directly. The browser-facing control surface is `test`.

## Why Not axios?

`fetch` can be patched globally. axios cannot be reliably covered by a simple global `fetch` patch because axios may use XHR in the browser or Node HTTP adapters on the server.

This package stays HTTP-client neutral:

- If your app uses `fetch`, use the template installer.
- If your app uses axios, wire the runtime into your existing axios interceptor or API client.
- If your app has a server proxy, wire the runtime there.

## CI and Publish

```bash
pnpm install --frozen-lockfile
pnpm run ci
```

Publishing runs from GitHub Actions when either:

- a GitHub Release is published
- the `Publish` workflow is manually dispatched

Required repository secret:

```text
NPM_TOKEN=<npm automation token>
```

Publish command:

```bash
pnpm publish --access public --provenance --no-git-checks
```



