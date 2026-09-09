# Changelog

## 0.2.0 — 2026-09-09

- Redesign the README and npm presentation with a custom banner, an actual four-state demo, concise onboarding and dedicated usage/release guides.
- Split the runtime, browser controls, fetch adapter, public types and shared helpers; add `./core`, `./browser` and `./fetch` exports without changing root imports.
- Preserve active scenarios on unknown story names; notify subscribers after successful dynamic registration.
- Make console/overlay installation transactional, teardown idempotent, and nested installation safe in either cleanup order. Continue releasing resources when an extension teardown fails.
- Synchronize cross-tab storage removal without resurrecting stale cookie selections.
- Add browser lifecycle regressions, a real local API playground, and consumer tests for every public entry point.

## 0.1.0 — 2026-09-09

First npm release of the API scenario runtime for development and QA.

- Mock and patch API responses; combine entries into named stories controlled from a browser console and page-aware overlay.
- Extract the fetch adapter and fix DELETE bodies, Request header replacement, empty bodies, form inputs, binary payloads, HEAD and bodyless HTTP statuses.
- Leave unmatched responses and streaming bodies untouched. Preserve response metadata and application headers when patching, and support JSON null patch results.
- Respect cancellation and restore fetch hooks safely, including nested installs.
- Isolate request counts by runtime; validate ambiguous features and conflicting stories; canonicalize API aliases and roll back invalid registration.
- Make browser subscriptions fire once and keep controls usable when persistence fails. Clean up overlay markers and pending navigation refreshes.
- Require explicit development/test activation and replace application-specific storage/event defaults with neutral names.
- Fix typed mock/patch registration for consumers and ship usable source/declaration maps.
- Add Node and Chromium regression tests, real tarball installation/type checks, npm lockfile and guarded GitHub Actions publication using NPM_TOKEN/provenance with OIDC support.
- Rewrite the README around the package's purpose, limits, configuration, request lifecycle and release process.
