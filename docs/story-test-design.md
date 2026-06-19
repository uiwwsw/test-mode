# Story-Based Test Mode Design

`@uiwwsw/test-mode` supports two testing perspectives without mixing their responsibilities.

- `test.feat`: feature-level API mock/patch testing for developers.
- `test.story`: user-facing scenario testing for QA, product, design, and frontend sharing.

The package has a feature API around `defineMock`, `definePatch`, `test.feat.list/add/remove/set/toggle()`, `test.active()`, and `test.clear()`. It also has a story layer around `defineStory`, `entry`, `test.story.list/add/remove/set/toggle()`, and `test.story()`.

## Why Split The Concepts

API-level mocks are precise, but they are not the best sharing language.

```js
test.feat.add("/orders/cart/getCartInfo:502");
```

That is useful for a developer, but a tester usually wants the screen state:

```js
test.story("cart.load.server-error");
```

The story API hides path/caseKey details and exposes the state a person wants to verify.

## test.feat

`test.feat` is the foundation of the package. It answers: "Can this runtime mock or patch one API behavior correctly?"

It covers:

- path normalization
- caseKey serialization and parsing
- mock handler lookup
- patch handler lookup
- active entry storage
- cookie/server handoff
- fetch patching
- overlay state
- page-aware overlay visibility
- catalog search
- pass-through behavior
- HTTP status result behavior

Good feature API examples:

```js
test.feat.add("/api/session/signin:locked");
test.feat.remove("/api/session/signin:locked");
test.active();
test.feat.list();
test.clear();
```

Good package tests:

```ts
serializeEntry("/api/session/signin", "locked");
parseEntry("/api/session/signin:locked");
createTestMode({ definitions });
installMockFetch(runtime);
```

This layer remains stable, explicit, and close to the runtime internals.

## test.story

`test.story` is a higher-level catalog. It answers: "Which screen state or user flow do I want to reproduce?"

Browser API:

```js
test();
test.help();
test.search();
test.search("cart");
test.story.list();
test.story.list("/cart");
test.story.add("main.event-popup.default");
test.story.remove("main.event-popup.default");
test.story.set(["cart.discount-flow"]);
test.story.toggle("cart.discount-flow");
test.story("cart.discount-flow");
test.active();
test.clear();
```

Behavior:

- `test()` returns command help.
- `test.help()` returns the same command help object.
- `test.search()` lists every registered feature and story entry.
- `test.search(query | options)` searches and filters feature and story catalogs together.
- `test.story.list(input?)` lists story scenarios.
- `test.story.add(storyKey)` keeps the current active entries and adds the story entries.
- `test.story.remove(storyKey)` removes the story entries from the current active entries.
- `test.story.set(storyKey | storyKeys)` replaces the current active entries with one or more stories.
- `test.story.toggle(storyKey)` removes the story when all its entries are active; otherwise it adds the story.
- `test.story(storyKey)` is a shorthand for `test.story.set(storyKey)`.
- Unknown `storyKey` is ignored and returns the current active entries.
- If multiple entries target the same path with different caseKeys, the later entry wins through the existing active-entry normalization rules.

## Story Definition

The story layer is intentionally small.

```ts
defineStory({
  key: "cart.load.server-error",
  title: "Cart - server error",
  description: "Reproduces the cart load failure state and retry guidance.",
  entries: [entry("/orders/cart/getCartInfo", "502")],
});
```

Required fields:

- `key`: stable console identifier
- `title`: short human-readable name
- `description`: what state this creates and what should be checked
- `entries`: mock/patch entries used to build the state

Story pages are inherited from referenced feature entries and merged with explicit story pages. Put `pages` on features by default. Use explicit story pages only when the story should appear on extra screens.

Do not require `tags` at this stage. `pages`, `key`, `title`, and `description` are enough for discovery. Tags can be reconsidered later if the catalog becomes too large to search comfortably.

## Folder Pattern

Applications should separate feature entries from story combinations.

The package ships a starter folder at:

```txt
node_modules/@uiwwsw/test-mode/templates/test-mode/
```

```txt
test-mode/
  features/
    auth.ts
    cart.ts
  stories/
    auth.stories.ts
    cart.stories.ts
  index.ts
```

- `features/*`: defines one API behavior at a time with `defineMock` or `definePatch`; put `pages` here when the API behavior belongs to specific screens.
- `stories/*`: combines feature entries into user-visible states with `defineStory`.
- `index.ts`: creates the runtime by passing all features to `definitions`/`patchDefinitions` and all stories to `stories`.

## Naming Rules

Use the user-visible state, not the API implementation detail.

Good:

```txt
auth.login.locked
auth.oauth.session-expired
cart.discount-flow
coupon.list.long-text
withdraw.unused-voucher
fulfillment.restore.none
```

Avoid:

```txt
getCartInfo.502
oauthUserInfo.AU-204
membersGetHeader.case1
```

Recommended shape:

```txt
domain.screen.state
domain.flow.result
domain.feature.variant
```

## Catalog Search

Initial filtering should stay simple:

- by page
- by active state
- by text query across `key`, `title`, `description`, `pages`, and `entries`

Example:

```js
test.story.list("/coupon/list");
test.story.list({ page: "/coupon/list", query: "long" });
test.story.list({ active: true });
test.search("coupon");
test.search({ page: "/coupon/list", query: "long" });
```

`test.search()` returns both catalogs:

```ts
{
  features: FeatureCatalogItem[];
  stories: StoryCatalogItem[];
}
```

## Overlay Visibility

The `TEST MODE` overlay is page-aware.

- If an active feature has `pages`, the overlay appears only when the current page matches those pages.
- If an active story is applied, the overlay uses the story's explicit pages plus the pages inherited from its feature entries.
- If a feature has no `pages`, it is treated as global and can show the overlay on every page.
- SPA navigation through `pushState`, `replaceState`, `popstate`, and `hashchange` re-checks overlay visibility.

## Sharing Guide

When sharing this design with a team, lead with the distinction:

```md
Test mode now has two levels.

- Feature tests validate the runtime: API entries, caseKeys, patching, storage, and fetch behavior.
- Story tests reproduce user-visible screen states with stable story keys.

Use `test.search()` for the global feature/story catalog view.
Use `test.feat.list()` for one-API feature entries when debugging.
Use `test.story.list()` and `test.story("cart.discount-flow")` when sharing QA scenarios.
```

## Runtime Guarantees

- `createTestMode({ stories })` validates stories during construction.
- Story validation runs when the runtime is created or when definitions are registered programmatically.
- Duplicate story keys throw.
- Empty `key`, `title`, `description`, or `entries` throw.
- Missing pages throw only when neither the story nor its referenced features provide pages.
- Unknown story entries throw.
- `test.story.set(storyKey | storyKeys)` replaces active entries.
- `test.story.add(storyKey)` adds entries while preserving compatible active entries.
- `test.story.remove(storyKey)` removes one story's entries.
- `test.story.toggle(storyKey)` toggles one story.
- `test()` shows command help.
- `test("story.key")` applies a story when the key exists; otherwise it keeps the original toggle behavior.

This keeps the runtime useful for developers while giving teams a cleaner language for screen-state verification.



