// Immutability check tests: a fixture checkout committed once as the base,
// then edited, with scripts/check-immutability.mjs run against it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, 'test', 'fixtures');
const SCRIPT = path.join(HERE, 'check-immutability.mjs');

/** A git checkout of the fixtures, with `before` applied and committed as the base. */
function checkout(before) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vsc-immutability-'));
  fs.cpSync(FIXTURES, root, { recursive: true });
  before?.(root);
  const git = (...a) => execFileSync('git', a, { cwd: root, stdio: 'ignore' });
  git('init', '-q');
  git('add', '-A');
  git('-c', 'user.name=test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'base');
  return root;
}
const run = (root) => spawnSync(process.execPath, [SCRIPT, '--root', root, '--base', 'HEAD'], { encoding: 'utf8' });
const purposeFile = (root) => path.join(root, 'purposes', 'example-use', '1', 'purpose.jsonld');
const editPurpose = (root, fn) => {
  const d = JSON.parse(fs.readFileSync(purposeFile(root), 'utf8'));
  fs.writeFileSync(purposeFile(root), JSON.stringify(fn(d) ?? d, null, 2));
};
const candidate = (root) => editPurpose(root, (d) => ({ ...d, status: 'candidate', since: '2026-01-01' }));

test('a draft purpose may change in place', () => {
  const root = checkout();
  editPurpose(root, (d) => { d.label.en = 'an example use'; });
  const r = run(root);
  assert.equal(r.status, 0, r.stderr);
});

test('a candidate purpose may change only its lifecycle members', () => {
  let root = checkout(candidate);
  editPurpose(root, (d) => { d.excludes.push('something new'); });
  let r = run(root);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /purposes\/example-use\/1\/purpose\.jsonld: "excludes" changed on a candidate version/);

  root = checkout(candidate);
  editPurpose(root, (d) => ({ ...d, status: 'deprecated', deprecatedOn: '2026-06-01' }));
  r = run(root);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /1 frozen version unchanged/);
});

test('a candidate purpose folder is frozen: no example added or changed, profile.md excepted', () => {
  let root = checkout(candidate);
  fs.writeFileSync(path.join(root, 'purposes', 'example-use', '1', 'examples', 'more.json'), '{}');
  let r = run(root);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /examples\/more\.json: added to a candidate version/);

  root = checkout(candidate);
  fs.appendFileSync(path.join(root, 'purposes', 'example-use', '1', 'profile.md'), '\nMore prose.\n');
  r = run(root);
  assert.equal(r.status, 0, r.stderr);
});

test('a purpose status may not go backwards, and a published purpose is never removed', () => {
  let root = checkout(candidate);
  editPurpose(root, (d) => { d.status = 'draft'; delete d.since; });
  let r = run(root);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /status candidate → draft is not a permitted transition/);

  root = checkout();
  fs.rmSync(path.join(root, 'purposes', 'example-use'), { recursive: true });
  r = run(root);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /purposes\/example-use\/1: a published version was removed/);
});
