import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';

const { version, name } = JSON.parse(readFileSync('package.json', 'utf8'));
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const tag = process.env.RELEASE_TAG;
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?$/;
assert.ok(semver.test(version), `Invalid release version: ${version}`);
assert.equal(tag, `v${version}`, `Release tag must be v${version}`);
assert.equal(lock.version, version, 'Lockfile version differs from package.json');
assert.equal(lock.packages[''].version, version, 'Lockfile root version differs from package.json');
assert.equal(lock.name, name, 'Lockfile package name differs from package.json');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const head = git('rev-parse', 'HEAD');
assert.equal(git('rev-parse', `refs/tags/${tag}^{commit}`), head, 'Checkout must be the release tag');
git('merge-base', '--is-ancestor', head, 'origin/main');
const prerelease = version.includes('-');
if (process.env.RELEASE_PRERELEASE) {
  assert.equal(process.env.RELEASE_PRERELEASE, String(prerelease), 'GitHub prerelease setting must match package version');
}
const distTag = prerelease ? 'next' : 'latest';
if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, `NPM_DIST_TAG=${distTag}\n`);
console.log(`Verified ${name}@${version}: ${tag} is on main; npm dist-tag: ${distTag}.`);
