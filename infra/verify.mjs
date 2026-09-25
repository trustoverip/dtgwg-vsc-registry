#!/usr/bin/env node
// Verify a deployed registry: node infra/verify.mjs <base-url> [--expect-commit <sha>]
//
// Checks each row of the negotiation table (PLAN.md §1.7) against a live host,
// that an unknown term is a real 404, that the trailing-slash form redirects,
// and, with --expect-commit, that the deployment is the build of that commit.
// Paths come from registry.config.json; the base URL is the one argument, so
// the same script checks a preview deployment and the production host.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../scripts/lib/config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const base = (args.find((a) => !a.startsWith('--')) ?? '').replace(/\/+$/, '');
const ci = args.indexOf('--expect-commit');
const expectCommit = ci >= 0 ? args[ci + 1] : null;
if (!base) {
  console.error('usage: node infra/verify.mjs <base-url> [--expect-commit <sha>]');
  process.exit(2);
}
const config = loadConfig(path.join(ROOT, 'registry.config.json'));
const ns = config.namespacePath;
const ctx = config.contextPath;

let failures = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const bad = (msg) => { failures++; console.log(`  ✗ ${msg}`); };

async function get(p, accept) {
  const res = await fetch(base + p, { headers: accept ? { accept } : {}, redirect: 'manual' });
  const text = await res.text();
  return { status: res.status, type: res.headers.get('content-type') ?? '', headers: res.headers, text };
}

function expect(label, r, { status, typeStart, bodyIncludes, header }) {
  const problems = [];
  if (status !== undefined && r.status !== status) problems.push(`status ${r.status}, expected ${status}`);
  if (typeStart && !r.type.startsWith(typeStart)) problems.push(`content-type "${r.type}", expected ${typeStart}`);
  if (bodyIncludes && !r.text.includes(bodyIncludes)) problems.push(`body lacks ${JSON.stringify(bodyIncludes)}`);
  if (header) for (const [k, v] of Object.entries(header)) if (r.headers.get(k) !== v) problems.push(`${k}: "${r.headers.get(k)}", expected "${v}"`);
  if (problems.length) bad(`${label}: ${problems.join('; ')}`);
  else ok(label);
}

console.log(`verifying ${base}`);

expect('home is HTML', await get('/'), { status: 200, typeStart: 'text/html' });
expect(`${ns} → HTML`, await get(ns), { status: 200, typeStart: 'text/html', header: { vary: 'Accept' } });
expect(`${ns} + ld+json → vocab`, await get(ns, 'application/ld+json'), { status: 200, typeStart: 'application/ld+json', bodyIncludes: '"@graph"', header: { 'access-control-allow-origin': '*' } });
const acceptList = await get(ns, 'application/json');
expect(`${ns} + json → accept-list`, acceptList, { status: 200, typeStart: 'application/json', bodyIncludes: '"predicates"' });
expect(`${ns}/vocab.jsonld direct`, await get(`${ns}/vocab.jsonld`), { status: 200, typeStart: 'application/ld+json' });
expect(`${ns}/ redirects to ${ns}`, await get(`${ns}/`), { status: 301, header: { location: `${base}${ns}` } });
expect(`${ns}/does-not-exist/1 is 404`, await get(`${ns}/does-not-exist/1`), { status: 404 });
expect(`${ns}/does-not-exist/1 + ld+json is 404`, await get(`${ns}/does-not-exist/1`, 'application/ld+json'), { status: 404 });
expect(`${ctx} → HTML`, await get(ctx), { status: 200, typeStart: 'text/html' });
expect(`${config.metaPath}/${config.metaVersion}/predicate.schema.json`, await get(`${config.metaPath}/${config.metaVersion}/predicate.schema.json`), { status: 200, typeStart: 'application/json', bodyIncludes: '"$id"' });

// One published term, if any: every representation, and the bare name rule.
let terms = [];
try {
  terms = Object.keys(JSON.parse(acceptList.text).predicates ?? {});
} catch {
  bad('accept-list is not JSON');
}
if (terms.length === 0) {
  console.log('  - no published terms; term checks skipped');
} else {
  const iri = terms[0];
  const termPath = new URL(iri).pathname;
  const namePath = termPath.replace(/\/[0-9]+$/, '');
  expect(`${termPath} → HTML`, await get(termPath), { status: 200, typeStart: 'text/html', bodyIncludes: iri, header: { 'cache-control': 'public, max-age=31536000, immutable' } });
  const def = await get(termPath, 'application/ld+json');
  expect(`${termPath} + ld+json → definition`, def, { status: 200, typeStart: 'application/ld+json', bodyIncludes: `"id": "${iri}"` });
  expect(`${termPath} + json → 406`, await get(termPath, 'application/json'), { status: 406 });
  expect(`${termPath}/predicate.jsonld direct`, await get(`${termPath}/predicate.jsonld`), { status: 200, typeStart: 'application/ld+json' });
  expect(`${namePath} → HTML`, await get(namePath), { status: 200, typeStart: 'text/html' });
  expect(`${namePath} + ld+json → 406`, await get(namePath, 'application/ld+json'), { status: 406 });
}

const release = await get('/release.json');
expect('release.json', release, { status: 200, typeStart: 'application/json', bodyIncludes: '"files"' });
if (expectCommit) {
  try {
    const commit = JSON.parse(release.text).commit;
    if (commit === expectCommit) ok(`deployment is the build of ${expectCommit.slice(0, 7)}`);
    else bad(`deployment is the build of ${String(commit).slice(0, 7)}, expected ${expectCommit.slice(0, 7)}`);
  } catch {
    bad('release.json is not JSON');
  }
}

if (failures) {
  console.log(`\n${failures} check${failures === 1 ? '' : 's'} failed`);
  process.exit(1);
}
console.log('\nall checks passed');
