#!/usr/bin/env node
// Immutability check (GOVERNANCE.md §3, §4.2, §10): a published, non-draft
// predicate or purpose version never changes meaning, and a released context
// never changes at all.
//
// Compares the working tree (of this repository, or --root <dir>) against a
// base ref (default origin/main, or BASE_REF, or --base <ref>). For every
// predicates/<name>/<n>/ and purposes/<name>/<n>/ present in the base with
// status other than draft:
//   - the definition (predicate.jsonld, purpose.jsonld) may differ only in
//     status, since, deprecatedOn, supersededBy;
//   - a status change must be a permitted transition;
//   - every other file in the folder must be byte-identical, and none removed
//     (profile.md, the prose, is the one exception);
// and every contexts/vN.jsonld present in the base must be byte-identical.
// A draft version may change freely. Exit 1 on any violation.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MUTABLE_MEMBERS } from './lib/registry.mjs';

const args = process.argv.slice(2);
const opt = (name) => {
  const k = args.indexOf(name);
  return k >= 0 && args[k + 1] ? args[k + 1] : null;
};
// --root <dir>: the checkout to check (default: this repository); the tests use a fixture checkout.
const ROOT = path.resolve(opt('--root') ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const BASE = opt('--base') ?? (process.env.BASE_REF || 'origin/main');

const TRANSITIONS = {
  draft: ['candidate', 'deprecated'],
  candidate: ['standard', 'deprecated'],
  standard: ['deprecated'],
  deprecated: []
};

function git(...a) {
  return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

let baseFiles;
try {
  git('rev-parse', '--verify', `${BASE}^{commit}`);
  baseFiles = git('ls-tree', '-r', '--name-only', BASE, '--', 'predicates', 'purposes', 'contexts').split('\n').filter(Boolean);
} catch {
  console.error(`error: base ref "${BASE}" is not available. Fetch it, or pass --base <ref> / BASE_REF.`);
  process.exit(2);
}

const baseRead = (rel) => git('show', `${BASE}:${rel}`);
const workRead = (rel) => {
  const f = path.join(ROOT, rel);
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
};

const errors = [];
const fail = (rel, msg) => errors.push(`${rel}: ${msg}`);

// Group base files by term version folder. Each kind names its definition file.
const DEF_FILE = { predicates: 'predicate.jsonld', purposes: 'purpose.jsonld' };
const folders = new Map();
for (const rel of baseFiles) {
  const m = /^(predicates|purposes)\/([^/]+)\/([^/]+)\/(.+)$/.exec(rel);
  if (!m) continue;
  const key = `${m[1]}/${m[2]}/${m[3]}`;
  if (!folders.has(key)) folders.set(key, { defFile: DEF_FILE[m[1]], files: [] });
  folders.get(key).files.push(m[4]);
}

let frozen = 0;
for (const [folder, { defFile, files }] of folders) {
  if (!files.includes(defFile)) continue;
  let baseDef;
  try {
    baseDef = JSON.parse(baseRead(`${folder}/${defFile}`));
  } catch {
    continue; // the base copy was itself invalid; the validator owns that
  }
  const workRaw = workRead(`${folder}/${defFile}`);
  if (workRaw === null) {
    fail(folder, 'a published version was removed; nothing is ever deleted (GOVERNANCE §3)');
    continue;
  }
  let workDef;
  try {
    workDef = JSON.parse(workRaw);
  } catch {
    continue; // the validator reports the JSON error
  }

  // Status transitions apply to every version, draft included.
  if (workDef.status !== baseDef.status && !(TRANSITIONS[baseDef.status] ?? []).includes(workDef.status)) {
    fail(`${folder}/${defFile}`, `status ${baseDef.status} → ${workDef.status} is not a permitted transition (GOVERNANCE §4.1)`);
  }
  if (baseDef.status === 'draft') continue;
  frozen++;

  const keys = new Set([...Object.keys(baseDef), ...Object.keys(workDef)]);
  for (const k of keys) {
    if (MUTABLE_MEMBERS.includes(k)) continue;
    if (JSON.stringify(baseDef[k]) !== JSON.stringify(workDef[k])) {
      fail(`${folder}/${defFile}`, `"${k}" changed on a ${baseDef.status} version; only ${MUTABLE_MEMBERS.join(', ')} may change. A meaning change is a new version (GOVERNANCE §3, §4.2)`);
    }
  }
  for (const f of files) {
    if (f === defFile || f === 'profile.md') continue;
    const w = workRead(`${folder}/${f}`);
    if (w === null) fail(`${folder}/${f}`, `removed from a ${baseDef.status} version`);
    else if (w !== baseRead(`${folder}/${f}`)) fail(`${folder}/${f}`, `changed on a ${baseDef.status} version; frozen`);
  }
  const workDir = path.join(ROOT, folder);
  if (fs.existsSync(workDir)) {
    for (const f of walk(workDir)) {
      if (!files.includes(f) && f !== 'profile.md') fail(`${folder}/${f}`, `added to a ${baseDef.status} version; frozen`);
    }
  }
}

for (const rel of baseFiles) {
  if (!/^contexts\/v[1-9][0-9]*\.jsonld$/.test(rel)) continue;
  const w = workRead(rel);
  if (w === null) fail(rel, 'a published context was removed');
  else if (w !== baseRead(rel)) fail(rel, 'a published context changed; additions go under a new version IRI');
}

function* walk(dir, base = dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full, base);
    else yield path.relative(base, full).split(path.sep).join('/');
  }
}

if (errors.length) {
  console.error(`\nimmutability check against ${BASE}: ${errors.length} violation${errors.length === 1 ? '' : 's'}\n`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.error('');
  process.exit(1);
}
console.log(`✓ immutability against ${BASE}: ${frozen} frozen version${frozen === 1 ? '' : 's'} unchanged, ${folders.size - frozen} draft`);
