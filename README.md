# @uiwwsw/test-mode

[![CI](https://github.com/uiwwsw/test-mode/actions/workflows/ci.yml/badge.svg)](https://github.com/uiwwsw/test-mode/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@uiwwsw/test-mode)](https://www.npmjs.com/package/@uiwwsw/test-mode)

**개발 중인 앱의 API 응답을 시나리오에 맞게 바꾸고, 브라우저 콘솔에서 그 상태를 켜고 끄는 개발·QA용 TypeScript 런타임입니다.**

A framework-neutral API scenario runtime for development and QA: fetch mocks, response patches, browser controls, and server adapters. ESM, TypeScript declarations, zero runtime dependencies.

로그인 잠금, 빈 장바구니, 서버 오류처럼 재현하기 어려운 화면 상태를 앱의 실제 UI로 확인할 때 사용합니다. 각 API 동작을 `feature`로 정의하고, 여러 feature를 사람이 이해할 수 있는 `story`로 묶습니다.

| 개념 | 하는 일 | 예시 |
| --- | --- | --- |
| Mock | 실제 요청을 보내기 전에 응답을 만듭니다. | 로그인 API가 403을 반환 |
| Patch | 실제 요청을 보낸 뒤 응답 내용을 수정합니다. | 실제 상품 목록의 재고만 0으로 변경 |
| Story | 여러 mock/patch 항목을 하나의 화면 상태로 선택합니다. | `cart.empty`, `auth.login.locked` |
| Console / overlay | 시나리오를 선택하고 현재 화면에 TEST MODE 표시를 합니다. | `test.story('cart.empty')` |
| Extension | 앱이 직접 작성한 브라우저 부수 효과를 켜고 끕니다. | 팝업 SDK 대체 |

이 패키지는 assertion, 테스트 결과 판정, 테스트 실행기, HTTP 서버를 제공하지 않습니다. 자동 검증은 Playwright/Vitest 등의 도구가 담당합니다. 전역 `fetch`를 사용하는 요청에 적용되며 XHR, axios의 XHR/HTTP 어댑터, WebSocket, iframe 내부 통신은 자동으로 가로채지 않습니다.

## 설치

```bash
npm install @uiwwsw/test-mode
```

모던 브라우저와 Node.js 18.17 이상에서 동작합니다. 패키지 개발·배포에는 Node.js 24와 npm 11을 사용합니다. CommonJS `require()` 전용 빌드는 제공하지 않습니다.

## 빠른 시작: 빈 장바구니 재현

Vite 앱의 클라이언트 초기화 코드입니다. 다른 빌드 도구에서는 `enabled`를 해당 앱의 개발 환경 조건으로 바꾸세요.

```ts
import {
  createTestMode,
  defineMock,
  defineStory,
  entry,
  installMockFetch,
  installTestModeOverlay,
} from '@uiwwsw/test-mode';

const runtime = createTestMode({
  enabled: () => import.meta.env.DEV,
  definitions: [
    defineMock('/api/cart', () => ({ items: [], total: 0 }), {
      caseKey: 'empty',
      method: 'GET',
      description: '장바구니가 비어 있는 상태',
      pages: ['/cart'],
    }),
  ],
  stories: [
    defineStory({
      key: 'cart.empty',
      title: '빈 장바구니',
      description: '상품이 없을 때 안내와 쇼핑 버튼을 확인합니다.',
      entries: [entry('/api/cart', 'empty')],
    }),
  ],
});

const uninstallOverlay = installTestModeOverlay(runtime);
const uninstallFetch = installMockFetch(runtime);

// 앱 종료, HMR dispose, useEffect cleanup 시 호출
const cleanup = () => {
  uninstallFetch();
  uninstallOverlay();
};
```

브라우저 콘솔에서 시나리오를 켠 뒤 앱에서 API를 다시 요청하세요. 시나리오 선택 자체는 앱의 데이터를 자동으로 다시 불러오지 않습니다.

```js
test();                         // 도움말
test.story.list('/cart');        // 현재 화면의 시나리오
test.story('cart.empty');        // 빈 장바구니 시나리오로 교체
await fetch('/api/cart').then(r => r.json()); // { items: [], total: 0 }
test.active();                  // ['/api/cart:empty']
test.clear();                   // 다시 실제 API 사용
```

`enabled` 기본값은 `NODE_ENV`가 `development` 또는 `test`일 때만 참입니다. `process`가 없는 브라우저에서는 기본적으로 비활성 상태입니다. 브라우저 앱은 개발 환경 조건을 명시하세요. 비활성 런타임은 mock/patch를 실행하지 않고 콘솔·오버레이·확장 기능을 설치하지 않습니다.

## Mock, Patch, 요청 데이터

```ts
import { defineMock, definePatch, httpResult, passThrough } from '@uiwwsw/test-mode';

// HTTP 오류 응답. 오류를 throw하는 것과 달리 fetch 자체는 resolve됩니다.
const locked = defineMock('/api/login', () => httpResult({
  data: { message: 'Account locked' },
  status: 403,
  statusText: 'Forbidden',
}), { caseKey: 'locked', method: 'POST', pages: ['/login'] });

// 타입이 있는 요청과 응답을 정의할 수 있습니다.
const greeting = defineMock<{ name: string }, { greeting: string }>(
  '/api/hello',
  ({ body }) => ({ greeting: `Hello ${body?.name ?? 'world'}` }),
  { method: 'POST' },
);

// 실제 API를 호출한 다음 payload만 변경합니다.
const outOfStock = definePatch<unknown, { stock: number }>(
  '/api/products/:id',
  (response) => ({ ...response, stock: 0 }),
  { pages: ['/products'] },
);

// 특정 요청만 mock, 나머지는 실제 API로 전달합니다.
const search = defineMock('/api/search', ({ params }) =>
  (params as { q?: string }).q === 'empty' ? { results: [] } : passThrough(),
);
```

mock은 `definitions`, patch는 `patchDefinitions`에 등록해야 합니다. 정의는 등록만으로 활성화되지 않으며 story 또는 feature 선택이 필요합니다.

- `body` / `request`: GET·HEAD는 query params, POST·PUT·PATCH·DELETE는 요청 본문입니다.
- `params`: query string을 객체로 변환한 값입니다. 같은 키가 여러 번 있으면 마지막 값이 남습니다. 경로의 `:id`를 추출하는 기능은 아닙니다.
- `headers`, `method`, `path`, `url`: 요청을 검사할 수 있습니다. fetch 어댑터의 `headers`는 `Headers`입니다.
- `requestCount`: 해당 런타임 인스턴스와 feature key의 호출 횟수입니다. 서버의 사용자별 카운터는 아닙니다.
- 반환값은 JSON으로 직렬화합니다. 문자열, Blob, FormData, URLSearchParams, ArrayBuffer, typed array, ReadableStream은 원래 body 형식으로 처리합니다.
- HEAD와 204·205·304에는 본문을 넣지 않습니다. 해당 실제 응답은 patch도 건너뜁니다.
- 취소된 fetch는 reject됩니다. 이미 시작된 사용자 작성 비동기 handler 자체를 강제로 중지하지는 않습니다.

## 경로 매칭

```ts
defineMock('/api/orders/:id', () => ({ id: 1 }));
defineMock('/api/orders/*', () => []);
// 정규식은 첫 인자가 아니라 match 옵션으로 전달합니다.
defineMock('/order-by-id', () => ({ id: 1 }), { match: /^\/api\/orders\/\d+$/ });
defineMock('/api/orders', () => [], {
  match: ({ url, method }) => new URL(url).origin === 'https://api.example.com' && method === 'GET',
});
```

기본 매칭은 origin, query, hash를 제외한 pathname 기준이며 `/api/orders`와 `/orders`를 같은 경로로 취급합니다. 여러 API 호스트를 구분해야 하면 `match`에서 URL도 검사하세요. 정규식·함수 matcher도 등록 key를 활성화해야 동작합니다.

`mapRequest`는 프록시 경로를 매칭용 경로로 바꿀 때 사용합니다. 실제 네트워크 요청 인자는 변경하지 않습니다.

```ts
installMockFetch(runtime, {
  mapRequest: request => ({
    ...request,
    path: request.path.replace(/^\/proxy/, '/api'),
  }),
});
```

## 콘솔 API와 시나리오 규칙

```js
test.search();                  // feature와 story 전체 검색
test.search({ page: '/cart', query: 'empty', active: true });
test.feat.list();
test.feat.add('/api/cart:empty');
test.feat.remove('/api/cart:empty');
test.feat.toggle('/api/cart:empty');
test.feat.set(['/api/cart:empty']);
test.story.list();
test.story.add('cart.empty');
test.story.remove('cart.empty');
test.story.toggle('cart.empty');
test.story.set(['cart.empty']);
test('cart.empty');              // story key이면 선택, 아니면 feature 토글
test.active();
test.clear();
```

story는 고유한 `key`, `title`, `description`, 등록된 `entries`가 필요합니다. 화면 경로 `pages`는 feature에서 상속하거나 story에 명시해야 합니다. 같은 경로·HTTP 메서드의 상충하는 case를 한 story에 넣으면 등록 시 오류가 납니다. feature 선택 시에는 나중에 선택한 case가 기존의 상충하는 case를 교체합니다. 동일 entry의 중복 정의는 메서드 범위가 겹치지 않을 때만 허용합니다.

선택 상태는 localStorage와 cookie에 보관합니다. 저장소가 차단되거나 용량이 부족하면 인스턴스 메모리를 사용합니다. 기본 키는 `test-mode.entries`, 변경 이벤트는 `test-mode:change`입니다. 여러 앱을 한 origin에서 운영한다면 `storageKey`, `cookieKey`, `eventName`을 각각 지정하세요.

## 앱에 적용하기

스타터를 복사한 뒤 `config.ts`의 `enabled`를 앱 환경에 맞게 설정하세요.

```bash
cp -R node_modules/@uiwwsw/test-mode/templates/test-mode src/test-mode
```

```text
src/test-mode/
  config.ts              # 환경 조건, 저장소 키, 표시 설정
  index.ts               # runtime 생성
  install.ts             # 설치 및 cleanup
  features/auth.ts       # API 동작
  stories/auth.stories.ts # QA 시나리오
```

React/Next.js의 effect에서는 `return installAppTestMode()`로 정리 함수를 반환하세요. Vite의 HMR에서는 `import.meta.hot?.dispose(cleanup)`을 사용하세요. Vue/일반 앱은 클라이언트 bootstrap에서 한 번 설치하고 앱을 해제할 때 cleanup을 호출합니다.

## 서버 / axios 어댑터

서버나 fetch를 사용하지 않는 API 클라이언트는 `runtime.resolve(request)`와 `runtime.applyPatch({ ...request, data })`로 연결할 수 있습니다.

```ts
const request = {
  method: 'GET',
  path: '/api/cart',
  cookieHeader: incomingRequest.headers.get('cookie') ?? '',
};
const mock = await runtime.resolve(request);
if (mock) {
  // 어댑터가 mock.data, status, statusText, headers를 실제 응답으로 변환
} else {
  const upstreamData = await callUpstream();
  const patched = await runtime.applyPatch({ ...request, data: upstreamData });
  const data = patched === null ? upstreamData : patched.data;
}
```

서버에서는 모든 요청에 `cookieHeader`를 명시해야 사용자별 선택 상태가 섞이지 않습니다. 활성화 cookie는 인증 수단이 아닙니다. 앱의 환경·접근 조건으로 test mode 사용 범위를 결정하세요. 기존 `patch()`도 유지하지만 `null` payload와 매칭 실패를 구분하려면 `applyPatch()`를 사용하세요.

상세 동작과 한계: [설계 및 보장 범위](./docs/architecture.md), [Story 설계](./docs/story-test-design.md).

## 개발 및 배포

```bash
npm ci
npm run ci                  # 타입, 런타임 회귀 테스트, 실제 tarball 설치 검증
npx playwright install chromium
npm run test:browser        # 실제 Chromium에서 콘솔·fetch·overlay 검증
npm pack                    # dist를 새로 빌드하고 설치 가능한 tgz 생성
```

GitHub Actions는 PR과 main에서 Node.js 18.17 / 20 / 22 / 24 및 Chromium을 검증합니다. 패키지 검사에는 외부 소비자 프로젝트에서의 ESM import, 타입이 있는 handler, 복사한 스타터의 TypeScript 컴파일이 포함됩니다.

배포는 **GitHub Release 발행** 또는 **Publish 워크플로의 기존 tag 지정 실행**으로 시작됩니다. 저장소 secret `NPM_TOKEN`을 사용하며, 발행 권한과 CI에서의 비대화형 발행 권한이 있어야 합니다. 토큰은 publish 단계에만 전달합니다.

1. `npm version patch` 등으로 package.json과 package-lock.json 버전을 함께 올립니다.
2. 변경 커밋을 main에 반영하고 버전 tag를 push합니다.
3. 해당 `vX.Y.Z` tag로 GitHub Release를 발행합니다.
4. 전체 CI 통과, tag와 package 버전 일치, main에 포함된 커밋인지 확인 후 npm에 provenance와 함께 발행합니다.

정식 버전은 `latest`, `1.2.0-beta.1` 같은 사전 버전은 `next`로 발행합니다. 수동 실행도 main에 포함된 기존 버전 tag가 필요합니다. 임의 브랜치 HEAD는 배포하지 않습니다. 재실행 시 동일 커밋의 발행 완료 버전은 건너뛰고, 레지스트리 확인은 반영 지연을 고려해 재시도합니다.

최초 발행 후 토큰 없이 배포하려면 npm의 [Trusted publishing](https://docs.npmjs.com/trusted-publishers/)에 GitHub user `uiwwsw`, repository `test-mode`, workflow `publish.yml`, environment `npm`을 등록하고 직접 `npm publish`를 허용하세요. 워크플로에는 OIDC 권한이 준비되어 있습니다.

## License

[MIT](./LICENSE)
