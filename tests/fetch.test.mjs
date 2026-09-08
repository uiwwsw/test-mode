import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMockFetch, createTestMode, defineMock, definePatch, httpResult, installMockFetch, passThrough } from '../dist/index.js';

const url = 'https://example.com/api/items';
const setup = (handler, { patch = false, originalFetch = async () => assert.fail('Unexpected network request'), ...options } = {}) => {
  const mode = createTestMode({ enabled: true, [patch ? 'patchDefinitions' : 'definitions']: [(patch ? definePatch : defineMock)('/api/items', handler)] });
  mode.add('/api/items');
  return { mode, fetch: createMockFetch(mode, { originalFetch, ...options }) };
};

test('JSON mocks skip network and preserve HTTP errors and custom headers', async () => {
  const { fetch } = setup(() => httpResult({ data: { error: 'locked' }, status: 403, statusText: 'Forbidden', headers: { 'x-mock': 'yes' } }));
  const response = await fetch(url);
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('x-mock'), 'yes');
  assert.deepEqual(await response.json(), { error: 'locked' });
});

test('DELETE bodies, GET query parameters and empty string overrides reach handlers', async () => {
  const { fetch } = setup(({ request }) => request);
  assert.deepEqual(await (await fetch(url, { method: 'DELETE', body: '{"id":1}' })).json(), { id: 1 });
  assert.deepEqual(await (await fetch(`${url}?q=test`)).json(), { q: 'test' });
  const request = new Request(url, { method: 'POST', body: '{"old":true}' });
  assert.equal(await (await fetch(request, { body: '' })).text(), '');
  assert.equal(request.bodyUsed, false);
});

test('RequestInit headers replace original Request headers', async () => {
  const { fetch } = setup(({ headers }) => Object.fromEntries(headers));
  const request = new Request(url, { headers: { 'x-old': 'old' } });
  assert.deepEqual(await (await fetch(request, { headers: { 'x-new': 'new' } })).json(), { 'x-new': 'new' });
});

test('form request bodies are available without consuming the original request', async () => {
  const { fetch } = setup(({ body }) => body instanceof FormData ? Object.fromEntries(body) : body);
  const form = new FormData(); form.set('name', 'Ada');
  const request = new Request(url, { method: 'POST', body: form });
  assert.deepEqual(await (await fetch(request)).json(), { name: 'Ada' });
  assert.equal(request.bodyUsed, false);
  assert.deepEqual(await (await fetch(url, { method: 'POST', body: new URLSearchParams({ name: 'Ada' }) })).json(), { name: 'Ada' });
});

for (const status of [204, 205, 304]) test(`HTTP ${status} mocks have no body`, async () => {
  const { fetch } = setup(() => httpResult({ data: { ignored: true }, status, statusText: '' }));
  const response = await fetch(url);
  assert.equal(response.status, status);
  assert.equal(response.body, null);
});

test('HEAD mocks have no body', async () => {
  const { fetch } = setup(() => ({ ignored: true }));
  assert.equal((await fetch(url, { method: 'HEAD' })).body, null);
});

test('binary and raw body mocks are not JSON-encoded', async () => {
  const { fetch } = setup(() => new Uint8Array([0, 255, 42]));
  assert.deepEqual(new Uint8Array(await (await fetch(url)).arrayBuffer()), new Uint8Array([0, 255, 42]));
});

test('unmatched responses and endless streams are returned without cloning or reading', async () => {
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('data: hello\n\n')); } });
  const original = new Response(stream, { headers: { 'content-type': 'text/event-stream' } });
  original.clone = () => assert.fail('Must not read or clone an unmatched response');
  const { fetch } = setup(() => ({}), { originalFetch: async () => original });
  const response = await fetch('https://example.com/events');
  assert.equal(response, original);
  assert.equal(response.bodyUsed, false);
  await response.body.cancel();
});

test('disabled mode bypasses mapping and delegates original arguments', async () => {
  const request = new Request(url);
  const init = { headers: { 'x-test': '1' } };
  const expected = new Response('real');
  const fetch = createMockFetch(createTestMode({ enabled: false }), {
    mapRequest: () => assert.fail('disabled mapping'),
    originalFetch: async (...args) => { assert.deepEqual(args, [request, init]); return expected; },
  });
  assert.equal(await fetch(request, init), expected);
});

test('pass-through sends an unconsumed Request to the real transport', async () => {
  const { fetch } = setup(passThrough, { originalFetch: async (request) => new Response(await request.text()) });
  const response = await fetch(new Request(url, { method: 'POST', body: 'original' }));
  assert.equal(await response.text(), 'original');
});

test('patches preserve response headers and metadata but remove stale byte metadata', async () => {
  const original = new Response('{"real":true}', { status: 202, statusText: 'Accepted', headers: { 'content-type': 'application/json', 'x-request-id': '123', 'content-length': '13', 'content-encoding': 'gzip', etag: 'old' } });
  Object.defineProperties(original, { url: { value: url }, redirected: { value: true } });
  const { fetch } = setup((data) => ({ ...data, patched: true }), { patch: true, originalFetch: async () => original });
  const response = await fetch(url);
  assert.equal(response.clone().url, url);
  assert.deepEqual(await response.json(), { real: true, patched: true });
  assert.equal(response.status, 202);
  assert.equal(response.statusText, 'Accepted');
  assert.equal(response.url, url);
  assert.equal(response.redirected, true);
  assert.equal(response.headers.get('x-request-id'), '123');
  for (const name of ['content-length', 'content-encoding', 'etag']) assert.equal(response.headers.has(name), false);
});

test('patch handlers can produce JSON null', async () => {
  const { fetch } = setup(() => null, { patch: true, originalFetch: async () => new Response('{"old":true}') });
  assert.equal(await (await fetch(url)).text(), 'null');
});

test('binary patch handlers receive bytes', async () => {
  const { fetch } = setup((data) => {
    assert.ok(data instanceof ArrayBuffer);
    return new Uint8Array([3, 2, 1]);
  }, { patch: true, originalFetch: async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'application/octet-stream' } }) });
  assert.deepEqual(new Uint8Array(await (await fetch(url)).arrayBuffer()), new Uint8Array([3, 2, 1]));
});

test('bodyless upstream responses skip patch handlers', async () => {
  const original = new Response(null, { status: 204 });
  const { fetch } = setup(() => assert.fail('bodyless patch'), { patch: true, originalFetch: async () => original });
  assert.equal(await fetch(url), original);
});

test('pre-aborted requests do not execute handlers', async () => {
  const controller = new AbortController(); controller.abort();
  const { fetch } = setup(() => assert.fail('aborted mock'));
  await assert.rejects(fetch(url, { signal: controller.signal }), { name: 'AbortError' });
});

test('abort rejects promptly while an async handler is pending', async () => {
  const controller = new AbortController();
  let started;
  const ready = new Promise((resolve) => { started = resolve; });
  const { fetch } = setup(() => { started(); return new Promise(() => {}); });
  const pending = fetch(url, { signal: controller.signal });
  await ready;
  controller.abort(new Error('cancelled'));
  await assert.rejects(pending, /cancelled/);
});

test('request mapping affects matching, not real transport', async () => {
  const { fetch } = setup(({ path }) => ({ path }), { mapRequest: (request) => ({ ...request, path: '/api/items' }) });
  assert.deepEqual(await (await fetch('https://example.com/proxy')).json(), { path: '/api/items' });
});

test('fetch cleanup restores identity, preserves newer hooks, and respects custom transport', async () => {
  const original = async () => new Response('original');
  const custom = async () => new Response('custom');
  const target = { fetch: original };
  const mode = createTestMode({ enabled: false });
  const stop = installMockFetch(mode, { target, originalFetch: custom });
  assert.equal(await (await target.fetch(url)).text(), 'custom');
  stop(); stop();
  assert.equal(target.fetch, original);
  const first = installMockFetch(mode, { target });
  const newer = async () => new Response('newer'); target.fetch = newer;
  first();
  assert.equal(target.fetch, newer);
});

test('nested fetch installations can be removed out of order', async () => {
  const original = async () => new Response('original');
  const target = { fetch: original };
  const mode = createTestMode({ enabled: true, definitions: [defineMock('/api/items', () => 'mock')] });
  mode.add('/api/items');
  const first = installMockFetch(mode, { target });
  const second = installMockFetch(createTestMode({ enabled: false }), { target });
  first();
  assert.equal(await (await target.fetch(url)).text(), 'original');
  second();
  assert.equal(target.fetch, original);
});
