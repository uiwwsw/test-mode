# Test Mode App Template

Copy this folder into your app, usually as:

```txt
src/test-mode/
```

Recommended structure:

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

- `features/*`: one API mock/patch behavior per entry.
- `stories/*`: combinations of feature entries for shared screen states.
- `config.ts`: app-specific runtime settings.
- `index.ts`: creates the app test-mode runtime.
- `install.ts`: installs console, overlay, and fetch patching.

Put `pages` on feature entries. Stories inherit and merge the pages from their referenced features, so a story usually does not need its own `pages`.

Console basics:

```js
test();
test.search();
test.search("login");
test.feat.list();
test.story.list("/login");
test.story.set("auth.login.locked");
```

After installing, call `installAppTestMode()` once from your client bootstrap.

## Enable it deliberately

The template defaults to enabled only when `NODE_ENV` is `development` or `test`.
For a Vite browser app, replace `runtimeConfig.enabled` in `config.ts` with:

```ts
enabled: () => import.meta.env.DEV,
```

Use your own build/environment condition in other apps. A browser without a
`process` global is disabled by default. Install once, retain the returned cleanup
function and invoke it on teardown or HMR disposal. Selecting a scenario does not
refetch application data; trigger the affected request or reload the page.
