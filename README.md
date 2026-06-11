# @uiwwsw/test-mode

Vanilla TypeScript test-mode runtime for API mocks.

<p align="center">
  <img src="https://raw.githubusercontent.com/uiwwsw/test-mode/main/docs/demo.gif" alt="Console toggles a test scenario, the real API response is reused, and selected fields are overridden under a TEST MODE overlay." width="760" />
</p>

## What It Does Best

Turn API scenarios on from the browser console, keep the real API request/response, and override only the fields you need.

```js
test.list();
test.add("/orders/:id:half-off");
test.active();
test.clear();
```

That is the main idea:

- `test.add(...)`, `test.list()`, `test.active()`, and `test.clear()` work directly from the browser console.
- Patch scenarios can let the real API request happen and reuse the real response payload.
- Mock data stays easy because a scenario can override only a few fields on top of the real response.
- Active scenarios are stored in browser state and cookies, so server/API proxy code can also read them.

No React, no Vue, no Next.js, no Redux, no axios dependency. The package exports one small runtime that can:

- register mock and patch scenarios
- register app-specific extensions
- turn scenarios on/off from the browser console
- show a `TEST MODE` overlay with vanilla DOM
- patch global `fetch`
- run directly inside server/API proxy code

## Framework Strategy

This package does **not** ship React or Vue wrappers by default.

Why:

- the runtime is already framework-independent
- React/Vue wrappers would add peer dependency and maintenance surface
- app bootstrap is usually the right place to install global test mode behavior
- most apps need the same 3 calls: create runtime, install overlay, install fetch patch

So the package provides framework-neutral APIs, and the README shows how to use them in React, Vue, and vanilla JavaScript.

If the same wrapper code becomes repetitive across real projects, create optional packages later:

- `@uiwwsw/test-mode-react`
- `@uiwwsw/test-mode-vue`
- `@uiwwsw/test-mode-next`

## Install

After publishing:

```bash
npm install @uiwwsw/test-mode
```

```bash
pnpm add @uiwwsw/test-mode
```

Before publishing, test it locally with the tarball created by `pnpm pack`:

```bash
npm install ../test-mode2/uiwwsw-test-mode-0.1.0.tgz
```

## Quick Start

```ts
import {
  createTestMode,
  defineMock,
  httpResult,
  installMockFetch,
  installTestModeOverlay,
} from "@uiwwsw/test-mode";

const testMode = createTestMode({
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
      },
    ),
  ],
});

installTestModeOverlay(testMode);
installMockFetch(testMode);
```

Browser console:

```js
test.add("/api/session/signin:locked");
test.active();
test.list();
test.clear();
```

## React Usage

Install test mode once in a client-only bootstrap module.

```ts
// src/test-mode.ts
import {
  createTestMode,
  defineMock,
  installMockFetch,
  installTestModeOverlay,
} from "@uiwwsw/test-mode";

export const testMode = createTestMode({
  enabled: () => import.meta.env.DEV,
  definitions: [
    defineMock("/api/example", () => ({
      ok: true,
      source: "mock",
    })),
  ],
});

export const installAppTestMode = () => {
  const uninstallOverlay = installTestModeOverlay(testMode);
  const uninstallFetch = installMockFetch(testMode);

  return () => {
    uninstallFetch();
    uninstallOverlay();
  };
};
```

React entry:

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

Next.js App Router:

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

Then render `<TestModeClient />` from a client boundary such as a provider component.

## Vue Usage

Install test mode before mounting the app.

```ts
// src/test-mode.ts
import {
  createTestMode,
  defineMock,
  installMockFetch,
  installTestModeOverlay,
} from "@uiwwsw/test-mode";

export const testMode = createTestMode({
  enabled: () => import.meta.env.DEV,
  definitions: [
    defineMock("/api/example", () => ({
      ok: true,
      source: "mock",
    })),
  ],
});

export const installAppTestMode = () => {
  const uninstallOverlay = installTestModeOverlay(testMode);
  const uninstallFetch = installMockFetch(testMode);

  return () => {
    uninstallFetch();
    uninstallOverlay();
  };
};
```

Vue entry:

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

Vue plugin shape if you prefer plugin installation:

```ts
import type { App } from "vue";
import { installAppTestMode } from "./test-mode";

export const testModePlugin = {
  install(_app: App) {
    if (import.meta.env.DEV) {
      installAppTestMode();
    }
  },
};
```

## Mock vs Patch

Mock replaces the response before the real request goes out.

```ts
defineMock("/orders/cart/getCartInfo", () => ({
  code: "200",
  data: { items: [] },
  message: "OK",
  status: 200,
}));
```

Patch lets the real request happen, then modifies the response.

```ts
import { definePatch } from "@uiwwsw/test-mode";

definePatch("/menus/:menuCode", (response) => ({
  ...(response as object),
  patchedByTestMode: true,
}));
```

## App-Specific Extension Example

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

      const popup = {
        closed: false,
        close() {
          popup.closed = true;
        },
        focus() {},
      } as Window;

      window.setTimeout(() => {
        if (popup.closed) return;

        window.dispatchEvent(
          new MessageEvent("message", {
            data: {
              code: "AU-000",
              data: {
                birth: "19900101",
                ci: "TEST_CI_19900101",
                comId: "PASS",
                gender: "M",
                name: "테스트",
                phone: "01012345678",
              },
              message: "OK",
            },
            origin: parsedUrl.origin,
          }),
        );
      }, 0);

      return popup;
    };
  },
  onDisable() {
    if (!originalOpen) return;

    window.open = originalOpen;
    originalOpen = null;
  },
});

const testMode = createTestMode({ enabled: () => import.meta.env.DEV });

installTestModeOverlay(testMode, {
  extensions: [passAuthExtension],
});
```

Console:

```js
test.add("본인인증");
test.active(); // includes "본인인증"
test.remove("본인인증");
```

## Why Not axios?

`fetch` can be patched globally. axios cannot be reliably covered by a simple global `fetch` patch because axios may use XHR in the browser or Node HTTP adapters on the server.

So this package stays HTTP-client neutral:

- If your app uses `fetch`, call `installMockFetch(testMode)`.
- If your app uses axios, call `testMode.resolve()` / `testMode.patch()` from your existing axios interceptor or API client.
- If your app has a server proxy, call `testMode.resolve()` / `testMode.patch()` there. This is the most complete path because every client request eventually passes through the proxy.

## Server Proxy Usage

Use this when you want to cover every API, including requests that never go through browser `fetch`.

```ts
const mock = await testMode.resolve({
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
    status: mock.status,
    statusText: mock.statusText,
  });
}

const upstream = await fetch(upstreamUrl, init);
const payload = await upstream.clone().json().catch(() => null);
const patched = await testMode.patch({
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

## Request Path Normalization

If the browser request path needs to be normalized before matching, use `mapRequest`.

```ts
installMockFetch(testMode, {
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

## CI and Publish

CI runs on every push to `main` and every pull request:

```bash
pnpm install --frozen-lockfile
pnpm run ci
```

Publishing runs from GitHub Actions when either:

- a GitHub Release is published
- the `Publish` workflow is manually dispatched

Before publishing, add this repository secret in GitHub:

```text
NPM_TOKEN=<npm automation token>
```

The publish workflow runs:

```bash
pnpm publish --access public --provenance --no-git-checks
```

The package is published as:

```text
@uiwwsw/test-mode
```
