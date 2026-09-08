import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const script = fileURLToPath(new URL('../scripts/check-release.mjs', import.meta.url));
const fixture = (run) => {
  const dir = mkdtempSync(join(tmpdir(), 'test-mode-release-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
  const manifest = (version) => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: '@uiwwsw/test-mode', version }));
    writeFileSync(join(dir, 'package-lock.json'), JSON.stringify({ name: '@uiwwsw/test-mode', version, packages: { '': { version } } }));
  };
  const check = (tag, prerelease = '') => spawnSync(process.execPath, [script], { cwd: dir, encoding: 'utf8', env: { ...process.env, RELEASE_TAG: tag, RELEASE_PRERELEASE: prerelease, GITHUB_ENV: '' } });
  try {
    git('init', '-b', 'main');
    git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'Release test');
    manifest('1.2.3'); git('add', '.'); git('commit', '-m', 'initial'); git('tag', 'v1.2.3');
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    run({ git, manifest, check, dir });
  } finally { rmSync(dir, { recursive: true, force: true }); }
};

test('release guard accepts only matching tags on main', () => fixture(({ check }) => {
  assert.equal(check('v1.2.3', 'false').status, 0);
  assert.notEqual(check('v9.9.9').status, 0);
  assert.notEqual(check('v1.2.3', 'true').status, 0);
}));

test('release guard rejects unmerged tags and mismatched lockfiles', () => fixture(({ git, manifest, check, dir }) => {
  manifest('1.2.4'); git('add', '.'); git('commit', '-m', 'unmerged'); git('tag', 'v1.2.4');
  assert.notEqual(check('v1.2.4').status, 0);
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  assert.equal(check('v1.2.4').status, 0);
  writeFileSync(join(dir, 'package-lock.json'), JSON.stringify({ version: '1.2.3' }));
  assert.notEqual(check('v1.2.4').status, 0);
}));

test('prerelease versions publish to next instead of latest', () => fixture(({ git, manifest, check }) => {
  manifest('1.3.0-beta.1'); git('add', '.'); git('commit', '-m', 'prerelease'); git('tag', 'v1.3.0-beta.1');
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  const result = check('v1.3.0-beta.1', 'true');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /npm dist-tag: next/);
}));
