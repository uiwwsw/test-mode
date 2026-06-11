# @uiwwsw/test-mode

Vanilla TypeScript test-mode runtime for API mocks.

No React, no Next.js, no Redux, no axios dependency. The package exports one small runtime that can:

- register mock and patch scenarios
- register app-specific extensions
- turn scenarios on/off from the browser console
- show a `TEST MODE` overlay with vanilla DOM
- patch global `fetch`
- run directly inside server/API proxy code

## Why Not axios?

`fetch` can be patched globally. axios cannot be reliably covered by a simple global `fetch` patch because axios may use XHR in the browser or Node HTTP adapters on the server.

So this package stays HTTP-client neutral:

- If your app uses `fetch`, call `installMockFetch(testMode)`.
- If your app uses axios, call `testMode.resolve()` / `testMode.patch()` from your existing axios interceptor or API client.
- If your app has a server proxy, call `testMode.resolve()` / `testMode.patch()` there. This is the most complete path because every client request eventually passes through the proxy.

## Extension Decision

Browser-level API mocking cannot cover everything. PASS identity verification, iframe/popup flows, postMessage handshakes, SDK calls, or route-specific rewrites are app behavior, not universal API mocking.

So this package does not ship built-in PASS or Next plugins. Instead, it exposes a tiny extension hook:

- core package stays small and framework-neutral
- app-specific behavior lives in the consuming app
- extension state still appears in `test.active()` / `test.list()`
- extension state still turns on the `TEST MODE` overlay

Use this rule:

| Need | Use |
| --- | --- |
| Replace an API response | `defineMock` |
| Modify a real API response | `definePatch` |
| Cover every API regardless of browser client | server proxy with `resolve` / `patch` |
| Mock popup, iframe, SDK, `window.open`, `postMessage` | extension |
| Normalize a weird browser request path before matching | `mapRequest` |

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
npm install ../test-mode/uiwwsw-test-mode-0.1.0.tgz
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

## App-Specific Extension Example

Example: PASS-like identity verification that opens a popup/iframe and returns data through `postMessage`.

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

## Build

```bash
pnpm install
pnpm run typecheck
pnpm run build
pnpm pack --dry-run
```

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
