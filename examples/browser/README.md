# Browser playground

Real API → empty cart mock → HTTP 503 mock → discount patch, using the actual package build and a small local API.

```bash
git clone https://github.com/uiwwsw/test-mode.git
cd test-mode
npm ci
npm run dev:example
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173). Select the four buttons to change scenarios. The browser's `test` console API is also available; run `test.story.list()` to see the registered stories. The buttons refetch the cart after changing the story; console-only changes require refetching or clicking a button.

This example explicitly enables test mode for local development. Use your application's development condition before installing it in an app. The example is source code for local use, not a hosted production store.

To regenerate the README visuals, install Chromium (`npx playwright install chromium`) and Python 3 with Pillow, then run `npm run docs:assets`. PNG and GIF captures come from this working example. The SVG banner remains editable in `docs/assets/hero.svg`.
