import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// Serve the actual ESM build in a real browser, without an app framework.
const sources = new Map(await Promise.all(['index', 'fetch'].map(async (name) => [`/${name}.js`, await readFile(new URL(`../../dist/${name}.js`, import.meta.url), 'utf8')])));

test.beforeEach(async ({ page }) => {
  await page.route('http://test-mode.local/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (sources.has(path)) return route.fulfill({ contentType: 'text/javascript', body: sources.get(path) });
    if (path.startsWith('/api/')) return route.fulfill({ contentType: 'application/json', headers: { 'x-upstream': 'yes' }, body: '{"source":"real"}' });
    return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><title>Test mode fixture</title></head><body><main>App</main></body></html>' });
  });
  await page.goto('http://test-mode.local/cart');
  await page.evaluate(async () => {
    const api = await import('/index.js');
    window.api = api;
    window.runtime = api.createTestMode({ enabled: true, definitions: [api.defineMock('/api/items', () => ({ items: [] }), { caseKey: 'empty', pages: ['/cart'] })], stories: [api.defineStory({ key: 'cart.empty', title: 'Empty cart', description: 'No items', entries: [api.entry('/api/items', 'empty')] })] });
  });
});

test('console story controls fetch and page-aware overlay end to end', async ({ page }) => {
  await page.evaluate(() => {
    window.originalFetch = window.fetch;
    window.originalPushState = history.pushState;
    window.stopOverlay = api.installTestModeOverlay(runtime);
    window.stopFetch = api.installMockFetch(runtime);
    test.story('cart.empty');
  });
  await expect(page.locator('html')).toHaveAttribute('data-test-mode', 'true');
  expect(await page.evaluate(async () => (await fetch('/api/items')).json())).toEqual({ items: [] });
  expect(await page.evaluate(() => test.search('empty').stories[0].active)).toBe(true);
  await page.evaluate(() => history.pushState({}, '', '/account'));
  await expect(page.locator('html')).not.toHaveAttribute('data-test-mode', 'true');
  await page.evaluate(() => history.replaceState({}, '', '/cart/checkout'));
  await expect(page.locator('html')).toHaveAttribute('data-test-mode', 'true');
  await page.evaluate(() => { test.clear(); stopFetch(); stopOverlay(); });
  expect(await page.evaluate(() => ({ fetch: fetch === originalFetch, history: history.pushState === originalPushState, consoleRemoved: !('test' in window) }))).toEqual({ fetch: true, history: true, consoleRemoved: true });
});

test('one browser change emits one notification per runtime and persists cookies', async ({ page }) => {
  const result = await page.evaluate(() => {
    let local = 0; let sibling = 0;
    const other = api.createTestMode({ enabled: true, definitions: [api.defineMock('/api/items', () => ({}), { caseKey: 'empty' })] });
    runtime.subscribe(() => local++);
    const stop = other.subscribe(() => sibling++);
    runtime.story('cart.empty');
    const cookie = document.cookie;
    const persisted = JSON.parse(localStorage.getItem(runtime.storageKey));
    stop(); runtime.clear();
    return { local, sibling, cookie, persisted, cleared: other.active() };
  });
  expect(result.local).toBe(2);
  expect(result.sibling).toBe(1);
  expect(result.cookie).toContain('test-mode.entries=');
  expect(result.persisted).toEqual(['/api/items:empty']);
  expect(result.cleared).toEqual([]);
});

test('blocked storage and cookies fall back to instance memory', async ({ page }) => {
  expect(await page.evaluate(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } });
    Object.defineProperty(document, 'cookie', { get() { throw new Error('blocked'); }, set() { throw new Error('blocked'); } });
    runtime.story('cart.empty');
    const active = runtime.active();
    const extension = api.createToggleExtension({ key: 'popup', label: 'Popup' });
    extension.enable(); const enabled = extension.isActive(); extension.disable();
    return { active, enabled, disabled: !extension.isActive() };
  })).toEqual({ active: ['/api/items:empty'], enabled: true, disabled: true });
});

test('storage quota failure preserves usable runtime and extension controls', async ({ page }) => {
  expect(await page.evaluate(() => {
    Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); };
    runtime.story('cart.empty');
    const extension = api.createToggleExtension({ key: 'popup', label: 'Popup' });
    extension.enable();
    return { active: runtime.active(), extension: extension.isActive() };
  })).toEqual({ active: ['/api/items:empty'], extension: true });
});

test('overlay cleanup cancels queued navigation and removes dataset markers', async ({ page }) => {
  await page.evaluate(() => {
    const stop = api.installTestModeOverlay(runtime);
    runtime.story('cart.empty');
    history.pushState({}, '', '/cart/checkout');
    stop(); stop();
  });
  await expect(page.locator('[data-test-mode]')).toHaveCount(0);
  await expect(page.locator('div[aria-hidden="true"]')).toHaveCount(0);
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 30)));
  await expect(page.locator('div[aria-hidden="true"]')).toHaveCount(0);
});

test('console installer restores existing property descriptors', async ({ page }) => {
  expect(await page.evaluate(() => {
    const before = () => 'existing';
    Object.defineProperty(window, 'test', { configurable: true, value: before, writable: false });
    const stop = api.installConsole(runtime);
    test.story('cart.empty'); stop();
    return { restored: window.test === before, writable: Object.getOwnPropertyDescriptor(window, 'test').writable };
  })).toEqual({ restored: true, writable: false });
});

test('real response patches retain application headers', async ({ page }) => {
  expect(await page.evaluate(async () => {
    const mode = api.createTestMode({ enabled: true, patchDefinitions: [api.definePatch('/api/items', (data) => ({ ...data, patched: true }))] });
    mode.add('/api/items');
    const mockFetch = api.createMockFetch(mode);
    const response = await mockFetch('/api/items');
    return { data: await response.json(), header: response.headers.get('x-upstream'), url: response.url };
  })).toEqual({ data: { source: 'real', patched: true }, header: 'yes', url: 'http://test-mode.local/api/items' });
});

test('default browser runtime stays disabled', async ({ page }) => {
  expect(await page.evaluate(() => api.createTestMode().isAvailable())).toBe(false);
});

test('disabled installers add no console, overlay, or extension side effects', async ({ page }) => {
  expect(await page.evaluate(() => {
    const mode = api.createTestMode({ enabled: false });
    let installed = false;
    const extension = api.createToggleExtension({ key: 'popup', label: 'Popup', setup() { installed = true; } });
    api.installTestModeOverlay(mode, { extensions: [extension] });
    api.installConsole(mode, { extensions: [extension] });
    return { installed, console: 'test' in window, overlay: document.querySelector('div[aria-hidden="true"]') !== null };
  })).toEqual({ installed: false, console: false, overlay: false });
});
