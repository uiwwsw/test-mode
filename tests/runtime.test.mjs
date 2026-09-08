import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTestMode, defineMock, definePatch, defineStory, entry, passThrough, normalizePath } from '../dist/index.js';

const request = { method: 'GET', path: '/api/items' };
const feature = (caseKey = 'empty') => defineMock('/api/items', () => [], { caseKey, pages: ['/cart'] });
const story = (entries = [entry('/api/items', 'empty')]) => defineStory({ key: 'cart.empty', title: 'Empty cart', description: 'No items', entries });
const runtime = (options = {}) => createTestMode({ enabled: true, ...options });

test('normalizes relative, absolute, query and hash paths', () => {
  assert.equal(normalizePath(' https://example.com/api/items?q=1#top '), '/api/items');
  assert.equal(normalizePath('api/items'), '/api/items');
  assert.equal(normalizePath(''), '');
});

test('default activation is explicit in browsers and production', () => {
  const previous = process.env.NODE_ENV;
  try {
    for (const env of [undefined, 'production', 'staging']) {
      if (env === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = env;
      assert.equal(createTestMode().isAvailable(), false);
    }
    process.env.NODE_ENV = 'development';
    assert.equal(createTestMode().isAvailable(), true);
    process.env.NODE_ENV = 'test';
    assert.equal(createTestMode().isAvailable(), true);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous;
  }
});

test('disabled runtimes do not activate or call handlers', async () => {
  const mode = runtime({ enabled: false, definitions: [defineMock('/api/items', () => assert.fail())] });
  assert.deepEqual(mode.add('/api/items'), []);
  assert.equal(await mode.resolve(request), null);
});

test('case selection, encoded case names, unknown and malformed input', () => {
  const mode = runtime({ definitions: [feature('empty'), feature('error'), feature('한글:%')] });
  assert.deepEqual(mode.set(['/items:empty', '/api/items:error']), ['/api/items:error']);
  assert.deepEqual(mode.add(entry('/items', '한글:%')), [entry('/api/items', '한글:%')]);
  assert.doesNotThrow(() => mode.add('/items:%ZZ'));
  assert.deepEqual(mode.toggle('/unknown'), mode.active());
  mode.clear();
  assert.deepEqual(mode.active(), []);
});

test('request counts are isolated by runtime instance', async () => {
  const definition = defineMock('/api/items', ({ requestCount }) => requestCount);
  const one = runtime({ definitions: [definition] });
  const two = runtime({ definitions: [definition] });
  one.add('/items'); two.add('/items');
  assert.equal((await one.resolve(request)).data, 1);
  assert.equal((await one.resolve(request)).data, 2);
  assert.equal((await two.resolve(request)).data, 1);
});

test('cookies are request-scoped and cannot leak active entries between server requests', async () => {
  const mode = runtime({ definitions: [feature()], cookieKey: 'qa' });
  const cookie = `qa=${encodeURIComponent(JSON.stringify(['/items:empty']))}`;
  assert.deepEqual((await mode.resolve({ ...request, cookieHeader: cookie })).data, []);
  assert.equal(await mode.resolve({ ...request, cookieHeader: '' }), null);
  assert.deepEqual(mode.active(), []);
  assert.doesNotThrow(() => mode.active('qa=%ZZ'));
});

test('methods on the same entry select the matching definition', async () => {
  const mode = runtime({ definitions: [
    defineMock('/api/items', () => 'get', { method: 'GET' }),
    defineMock('/api/items', ({ body }) => body, { method: 'DELETE' }),
  ] });
  mode.add('/items');
  assert.equal((await mode.resolve(request)).data, 'get');
  assert.deepEqual((await mode.resolve({ ...request, method: 'delete', body: { ids: [1] } })).data, { ids: [1] });
});

test('dynamic routes, wildcard and stateful regular expressions match repeatedly', async () => {
  for (const [path, options] of [['/api/items/:id', {}], ['/api/items/*', {}], ['/item-match', { match: /^\/api\/items\/\d+$/g }]]) {
    const mode = runtime({ definitions: [defineMock(path, () => 'matched', options)] });
    mode.add(path);
    for (let index = 0; index < 3; index++) assert.equal((await mode.resolve({ ...request, path: '/api/items/42' })).data, 'matched');
  }
});

test('pass-through leaves transport to the adapter', async () => {
  const mode = runtime({ definitions: [defineMock('/api/items', passThrough)] });
  mode.add('/items');
  assert.equal(await mode.resolve(request), null);
});

test('patch envelopes distinguish null payloads from no match', async () => {
  const mode = runtime({ patchDefinitions: [definePatch('/api/items', () => null)] });
  assert.equal(await mode.applyPatch({ ...request, data: {} }), null);
  mode.add('/items');
  assert.deepEqual(await mode.applyPatch({ ...request, data: {} }), { data: null });
});

test('stories canonicalize API aliases, inherit pages, filter and activate', () => {
  const mode = runtime({ definitions: [feature()], stories: [story(['/items:empty'])] });
  mode.story('cart.empty');
  assert.equal(mode.stories({ active: true })[0].active, true);
  assert.deepEqual(mode.stories('/cart')[0].pages, ['/cart']);
  assert.equal(mode.isActiveForPage('/cart/checkout'), true);
  assert.equal(mode.isActiveForPage('/account'), false);
  assert.equal(mode.search('empty').stories.length, 1);
  assert.equal(mode.search({ page: '/cart', active: true }).features.length, 1);
});

test('invalid registration rolls back both features and stories', () => {
  const mode = runtime({ definitions: [feature()], stories: [story()] });
  assert.throws(() => mode.register([feature('new')], [], [story()]), /Duplicate story/);
  assert.equal(mode.search().features.length, 1);
  assert.equal(mode.stories().length, 1);
  mode.story('cart.empty');
  assert.equal(mode.stories()[0].active, true);
});

test('rejects ambiguous features, invalid story references and conflicting cases', () => {
  assert.throws(() => runtime({ definitions: [feature(), feature()] }), /Ambiguous feature/);
  assert.throws(() => runtime({ definitions: [feature()], stories: [story(['/unknown'])] }), /unknown entry/);
  assert.throws(() => runtime({ definitions: [feature(), feature('error')], stories: [story(['/items:empty', '/items:error'])] }), /conflicting entries/);
});

test('server subscriptions fire once, unsubscribe and cannot mutate stored state', () => {
  const mode = runtime({ definitions: [feature()] });
  let count = 0;
  const stop = mode.subscribe((paths) => { count++; paths.length = 0; });
  const active = mode.add('/items:empty');
  active.length = 0;
  assert.deepEqual(mode.active(), ['/api/items:empty']);
  assert.equal(count, 1);
  stop(); mode.clear();
  assert.equal(count, 1);
});

test('a broad case replaces every conflicting method-specific case', () => {
  const mode = runtime({ definitions: [
    defineMock('/items', () => 'get', { caseKey: 'get', method: 'GET' }),
    defineMock('/items', () => 'post', { caseKey: 'post', method: 'POST' }),
    defineMock('/items', () => 'all', { caseKey: 'all' }),
  ] });
  assert.deepEqual(mode.set(['/items:get', '/items:post', '/items:all']), ['/items:all']);
});
