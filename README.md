<p align="center">
  <img src="https://raw.githubusercontent.com/uiwwsw/test-mode/v0.2.0/docs/assets/hero.png" width="100%" alt="test mode — Your app. Every API state. API mocks, response patches, and repeatable QA scenarios." />
</p>

<p align="center">
  <strong>API 시나리오를 바꾸고, 실제 화면을 확인하세요.</strong><br />
  Framework-neutral API scenarios for development &amp; QA.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@uiwwsw/test-mode"><img src="https://img.shields.io/npm/v/@uiwwsw/test-mode?style=flat-square&amp;color=173c36" alt="npm version" /></a>
  <a href="https://github.com/uiwwsw/test-mode/actions/workflows/ci.yml"><img src="https://github.com/uiwwsw/test-mode/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://www.npmjs.com/package/@uiwwsw/test-mode?activeTab=dependencies"><img src="https://img.shields.io/badge/runtime_dependencies-0-173c36?style=flat-square" alt="Zero runtime dependencies" /></a>
  <a href="https://github.com/uiwwsw/test-mode/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-62796f?style=flat-square" alt="MIT license" /></a>
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="#see-it-in-action">Demo</a> ·
  <a href="https://github.com/uiwwsw/test-mode/blob/main/docs/guide.md">사용 가이드</a> ·
  <a href="https://github.com/uiwwsw/test-mode/blob/main/docs/architecture.md">설계</a> ·
  <a href="https://github.com/uiwwsw/test-mode/blob/main/CHANGELOG.md">Changelog</a>
</p>

---

로그인 잠금, 빈 장바구니, 일시적인 서버 오류. 매번 계정이나 서버 데이터를 바꾸지 않고, **앱의 실제 UI에서 필요한 상태를 재현**하세요. API 동작을 feature로 정의하고, 팀이 공유할 시나리오를 story로 묶습니다.

| Mock | Patch | Story |
| :--- | :--- | :--- |
| 요청 전에 응답을 만듭니다. | 실제 응답의 일부를 바꿉니다. | 여러 API 동작을 하나로 선택합니다. |
| 빈 목록 · HTTP 오류 · 특정 계정 상태 | 실제 상품 + 테스트 할인 · 재고 변경 | `cart.empty` · `auth.login.locked` |

## See it in action

<p align="center">
  <img src="https://raw.githubusercontent.com/uiwwsw/test-mode/v0.2.0/docs/assets/scenarios.gif" width="880" alt="실제 실행 데모: Real API, 빈 장바구니 mock, HTTP 503 mock, 실제 응답에 할인을 적용한 patch 순서로 전환합니다." />
</p>

같은 장바구니를 **Real API → Empty → Error → Patch**로 전환합니다. 이 데모는 실제 패키지의 `fetch` 어댑터, story, 콘솔, TEST MODE 오버레이로 동작합니다.

[예제 실행하기](https://github.com/uiwwsw/test-mode/tree/main/examples/browser) · [배너와 데모 생성 소스](https://github.com/uiwwsw/test-mode/blob/main/scripts/render-doc-assets.mjs)

## Quick start

```bash
npm install @uiwwsw/test-mode
```

**1. 개발 환경에서 시나리오를 등록합니다.** 다음은 Vite 앱의 클라이언트 초기화 예제입니다.

```ts
import {
  createTestMode, defineMock, defineStory, entry,
  installMockFetch, installTestModeOverlay,
} from '@uiwwsw/test-mode';

const runtime = createTestMode({
  enabled: () => import.meta.env.DEV,
  definitions: [
    defineMock('/api/cart', () => ({ items: [], total: 0 }), {
      caseKey: 'empty', method: 'GET', pages: ['/cart'],
    }),
  ],
  stories: [
    defineStory({
      key: 'cart.empty', title: '빈 장바구니',
      description: '상품이 없을 때 안내와 쇼핑 버튼을 확인합니다.',
      entries: [entry('/api/cart', 'empty')],
    }),
  ],
});

const stopFetch = installMockFetch(runtime);
const stopOverlay = installTestModeOverlay(runtime);

// 앱 종료, effect cleanup, HMR dispose 시 호출
const cleanup = () => { stopOverlay(); stopFetch(); };
```

**2. 브라우저 콘솔에서 선택하고 API를 다시 요청합니다.**

```js
test.story.list('/cart');       // 화면에 맞는 시나리오 탐색
test.story('cart.empty');       // 빈 장바구니로 전환
await fetch('/api/cart').then(r => r.json()); // { items: [], total: 0 }
test.clear();                   // 실제 API로 복귀
```

> `enabled`는 Node의 `development` / `test` 환경에서만 기본 활성화됩니다. 브라우저에서는 앱의 개발 환경 조건을 명시하세요. 시나리오를 선택한 뒤 데이터 재요청은 앱이 수행합니다.

## What you get

| 기능 | 사용 방법 |
| :--- | :--- |
| 팀이 공유하는 화면 시나리오 | `test.story('cart.empty')`, `test.story.list('/cart')` |
| API 한 개만 빠르게 전환 | `test.feat.add('/api/cart:empty')` |
| 현재 설정 확인과 검색 | `test.active()`, `test.search('cart')`, `test()` |
| 현재 화면에만 테스트 표시 | `pages`와 SPA 이동을 반영하는 오버레이 |
| 실제 응답을 유지하면서 필드 변경 | `definePatch()` |
| 특정 mock 요청만 실제 API에 전달 | `passThrough()` |
| 서버·API 클라이언트 연결 | `runtime.resolve()`와 `runtime.applyPatch()` |
| 타입과 디버깅 지원 | TypeScript 선언, 소스 코드, source map 제공 |

**필요한 모듈만 가져올 수도 있습니다.** 기존 최상위 import는 그대로 지원합니다.

```ts
import { createTestMode, defineMock } from '@uiwwsw/test-mode/core';
import { createMockFetch } from '@uiwwsw/test-mode/fetch';
import { installTestModeOverlay } from '@uiwwsw/test-mode/browser';
```

`core`에는 콘솔·오버레이 구현을 포함하지 않습니다. 서버 어댑터와 브라우저 설치 코드를 분리해서 구성할 수 있습니다.

## Fits your app

React, Vue, Next.js, Vite, 일반 JavaScript 앱에서 사용할 수 있는 ESM 패키지입니다. 모던 브라우저와 Node.js 18.17 이상을 지원하며, 런타임 의존성이 없습니다.

- 앱 소유의 [스타터 템플릿](https://github.com/uiwwsw/test-mode/tree/main/templates/test-mode)을 복사해 feature와 story를 관리하세요.
- [사용 가이드](https://github.com/uiwwsw/test-mode/blob/main/docs/guide.md)에서 typed handler, 경로 매칭, SSR cookie 전달, 확장 기능을 확인하세요.
- [설계 및 보장 범위](https://github.com/uiwwsw/test-mode/blob/main/docs/architecture.md)에서 처리 순서와 제약을 확인하세요.

이 패키지는 화면 상태를 재현하는 런타임입니다. 테스트 실행이나 assertion은 Playwright·Vitest 등의 도구가 담당합니다. 전역 `fetch`를 거치지 않는 XHR·WebSocket·iframe 통신에는 별도 어댑터가 필요합니다. 본문 전체를 읽는 patch는 무한 SSE 스트림에 적용하지 마세요.

## Develop & release

```bash
npm ci
npm run ci             # 타입 · 런타임 · tarball 설치 및 consumer 타입 검증
npm run test:browser   # Chromium 통합 테스트 (최초: npx playwright install chromium)
npm run dev:example    # 로컬 시나리오 데모
```

릴리스 태그·버전·main 포함 여부를 확인한 뒤, 모든 검증을 통과한 버전만 GitHub Actions에서 npm에 provenance와 함께 발행합니다. [배포 절차와 문서 이미지 갱신](https://github.com/uiwwsw/test-mode/blob/main/docs/releasing.md).

<p align="center">
  <sub>Built for repeatable debugging. Shared for easier QA.</sub><br />
  <a href="https://github.com/uiwwsw/test-mode/issues">문제 제보</a> ·
  <a href="https://github.com/uiwwsw/test-mode/releases">릴리스</a> ·
  <a href="https://github.com/uiwwsw/test-mode/blob/main/LICENSE">MIT License</a>
</p>
