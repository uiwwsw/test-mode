# 사용 가이드

설치와 첫 실행은 [README](https://github.com/uiwwsw/test-mode#readme)를 참고하세요.

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

상세 동작과 한계: [설계 및 보장 범위](./architecture.md), [Story 설계](./story-test-design.md).

