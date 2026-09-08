import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const root = process.cwd();
const temp = mkdtempSync(join(tmpdir(), 'test-mode-package-'));
const run = (command, args, cwd = root) => execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...(process.platform === 'win32' && command === npm ? { shell: true } : {}) });
try {
  const [pack] = JSON.parse(run(npm, ['pack', '--ignore-scripts', '--json', '--pack-destination', temp]));
  const files = new Set(pack.files.map((file) => file.path));
  for (const required of ['dist/index.js', 'dist/fetch.js', 'dist/index.d.ts', 'dist/fetch.d.ts', 'src/index.ts', 'src/fetch.ts', 'templates/test-mode/install.ts', 'README.md', 'LICENSE']) {
    assert.ok(files.has(required), `Missing published file: ${required}`);
  }
  for (const file of files) assert.ok(!/^(tests|scripts|\.github|node_modules)\//.test(file), `Unexpected published file: ${file}`);
  writeFileSync(join(temp, 'package.json'), JSON.stringify({ name: 'test-mode-consumer', private: true, type: 'module' }));
  run(npm, ['install', '--ignore-scripts', '--no-audit', '--no-fund', join(temp, pack.filename)], temp);
  const installed = join(temp, 'node_modules/@uiwwsw/test-mode');
  const manifest = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'));
  assert.equal(manifest.name, '@uiwwsw/test-mode');
  run(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { createTestMode, defineMock, createMockFetch } from '@uiwwsw/test-mode';
    const runtime = createTestMode({ enabled: true, definitions: [defineMock('/api/packed', () => ({ packed: true }))] });
    runtime.add('/api/packed');
    const fetch = createMockFetch(runtime, { originalFetch: () => { throw new Error('unexpected transport'); } });
    assert.deepEqual(await (await fetch('https://example.com/api/packed')).json(), { packed: true });
  `], temp);
  cpSync(join(installed, 'templates/test-mode'), join(temp, 'template'), { recursive: true });
  writeFileSync(join(temp, 'consumer.ts'), `
    import { createTestMode, defineMock, definePatch, createMockFetch } from '@uiwwsw/test-mode';
    const mock = defineMock<{ name: string }, { greeting: string }>('/hello', ({ body }) => ({ greeting: body?.name ?? 'world' }));
    const patch = definePatch<unknown, { total: number }>('/total', (data) => ({ total: data.total + 1 }));
    const runtime = createTestMode({ enabled: true, definitions: [mock], patchDefinitions: [patch] });
    const wrapped: typeof fetch = createMockFetch(runtime);
    void wrapped;
  `);
  writeFileSync(join(temp, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, exactOptionalPropertyTypes: true, noEmit: true, module: 'ESNext', moduleResolution: 'Bundler', target: 'ES2022', lib: ['ES2022', 'DOM', 'DOM.Iterable'] }, include: ['consumer.ts', 'template/**/*.ts'] }));
  run(process.execPath, [resolve('node_modules/typescript/bin/tsc'), '-p', join(temp, 'tsconfig.json')], temp);
  console.log(`Verified ${manifest.name}@${manifest.version}: ${files.size} files, tarball install, ESM import, typed handlers and starter template.`);
} catch (error) {
  if (error.stdout) process.stderr.write(error.stdout);
  if (error.stderr) process.stderr.write(error.stderr);
  throw error;
} finally {
  rmSync(temp, { recursive: true, force: true });
}
