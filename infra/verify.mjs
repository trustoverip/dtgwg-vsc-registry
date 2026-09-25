#!/usr/bin/env node
// Verify a deployed registry: node infra/verify.mjs <base-url> [--expect-commit <sha>] [--wait <seconds>] [--retry <seconds>]
//
// A fresh Pages deployment answers 404 for a few seconds after `wrangler pages
// deploy` returns, and not for every file at once: one request finds a file
// and the next one does not. So the script first waits (default 120 s) for
// release.json to appear at the base URL, and then retries each check that
// fails until it passes or its own deadline (default 60 s, --retry <seconds>)
// runs out. A real defect fails every attempt and is still reported; only the
// last attempt's problems are printed.
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
  console.error('usage: node infra/verify.mjs <base-url> [--expect-commit <sha>] [--wait <seconds>] [--retry <seconds>]');
  process.exit(2);
}
const wi = args.indexOf('--wait');
const waitSeconds = wi >= 0 ? Number(args[wi + 1]) : 120;
const ri = args.indexOf('--retry');
const retrySeconds = ri >= 0 ? Number(args[ri + 1]) : 60;
const config = loadConfig(path.join(ROOT, 'registry.config.json'));
const ns = config.namespacePath;
const ctx = config.contextPath;

// Wait for the deployment to propagate.
{
  const deadline = Date.now() + waitSeconds * 1000;
  let attempt = 0;
  for (;;) {
    attempt++;
    let status = 'unreachable';
    try {
      status = (await fetch(`${base}/release.json`, { redirect: 'manual' })).status;
    } catch {
      /* DNS or TLS not ready yet */
    }
    if (status === 200) {
      if (attempt > 1) console.log(`deployment ready after ${attempt} attempts`);
      break;
    }
    if (Date.now() > deadline) {
      console.log(`✗ ${base}/release.json still ${status} after ${waitSeconds}s`);
      process.exit(1);
    }
    if (attempt === 1) console.log(`waiting for ${base} (release.json is ${status})`);
    await new Promise((r) => setTimeout(r, Math.min(5000, 1000 * attempt)));
  }
}

let failures = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const bad = (msg) => { failures++; console.log(`  ✗ ${msg}`); };

async function get(p, accept) {
  const res = await fetch(base + p, { headers: accept ? { accept } : {}, redirect: 'manual' });
  const text = await res.text();
  return { status: res.status, type: res.headers.get('content-type') ?? '', headers: res.headers, text };
}

function problemsWith(r, { status, typeStart, bodyIncludes, header }) {
  const problems = [];
  if (status !== undefined && r.status !== status) problems.push(`status ${r.status}, expected ${status}`);
  if (typeStart && !r.type.startsWith(typeStart)) problems.push(`content-type "${r.type}", expected ${typeStart}`);
  if (bodyIncludes && !r.text.includes(bodyIncludes)) problems.push(`body lacks ${JSON.stringify(bodyIncludes)}`);
  if (header) for (const [k, v] of Object.entries(header)) if (r.headers.get(k) !== v) problems.push(`${k}: "${r.headers.get(k)}", expected "${v}"`);
  return problems;
}

// Run one check, retrying while it fails until retrySeconds have elapsed.
// `request` is a thunk so every attempt is a fresh fetch. Returns the last
// response so callers can read its body.
async function check(label, request, expectation) {
  const deadline = Date.now() + retrySeconds * 1000;
  let attempt = 0;
  for (;;) {
    attempt++;
    let r;
    let problems;
    try {
      r = await request();
      problems = problemsWith(r, expectation);
    } catch (e) {
      r = null;
      problems = [`fetch failed: ${e.message}`];
    }
    if (problems.length === 0) {
      ok(attempt > 1 ? `${label} (after ${attempt} attempts)` : label);
      return r;
    }
    if (Date.now() > deadline) {
      bad(`${label}: ${problems.join('; ')}${attempt > 1 ? ` (${attempt} attempts)` : ''}`);
      return r;
    }
    await new Promise((res) => setTimeout(res, Math.min(5000, 1000 * attempt)));
  }
}

console.log(`verifying ${base}`);

await check('home is HTML', () => get('/'), { status: 200, typeStart: 'text/html' });
await check(`${ns} → HTML`, () => get(ns), { status: 200, typeStart: 'text/html', header: { vary: 'Accept' } });
await check(`${ns} + ld+json → vocab`, () => get(ns, 'application/ld+json'), { status: 200, typeStart: 'application/ld+json', bodyIncludes: '"@graph"', header: { 'access-control-allow-origin': '*' } });
const acceptList = await check(`${ns} + json → accept-list`, () => get(ns, 'application/json'), { status: 200, typeStart: 'application/json', bodyIncludes: '"predicates"' });
await check(`${ns}/vocab.jsonld direct`, () => get(`${ns}/vocab.jsonld`), { status: 200, typeStart: 'application/ld+json' });
await check(`${ns}/ redirects to ${ns}`, () => get(`${ns}/`), { status: 301, header: { location: `${base}${ns}` } });
await check(`${ns}/does-not-exist/1 is 404`, () => get(`${ns}/does-not-exist/1`), { status: 404 });
await check(`${ns}/does-not-exist/1 + ld+json is 404`, () => get(`${ns}/does-not-exist/1`, 'application/ld+json'), { status: 404 });
await check(`${ctx} → HTML`, () => get(ctx), { status: 200, typeStart: 'text/html' });
await check(`${config.metaPath}/${config.metaVersion}/predicate.schema.json`, () => get(`${config.metaPath}/${config.metaVersion}/predicate.schema.json`), { status: 200, typeStart: 'application/json', bodyIncludes: '"$id"' });

// One published term, if any: every representation, and the bare name rule.
let terms = [];
try {
  terms = Object.keys(JSON.parse(acceptList?.text ?? '').predicates ?? {});
} catch {
  bad('accept-list is not JSON');
}
if (terms.length === 0) {
  console.log('  - no published terms; term checks skipped');
} else {
  const iri = terms[0];
  const termPath = new URL(iri).pathname;
  const namePath = termPath.replace(/\/[0-9]+$/, '');
  await check(`${termPath} → HTML`, () => get(termPath), { status: 200, typeStart: 'text/html', bodyIncludes: iri, header: { 'cache-control': 'public, max-age=31536000, immutable' } });
    await check(`${termPath} + ld+json → definition`, () => get(termPath, 'application/ld+json'), { status: 200, typeStart: 'application/ld+json', bodyIncludes: `"id": "${iri}"` });
  await check(`${termPath} + json → 406`, () => get(termPath, 'application/json'), { status: 406 });
  await check(`${termPath}/predicate.jsonld direct`, () => get(`${termPath}/predicate.jsonld`), { status: 200, typeStart: 'application/ld+json' });
  await check(`${namePath} → HTML`, () => get(namePath), { status: 200, typeStart: 'text/html' });
  await check(`${namePath} + ld+json → 406`, () => get(namePath, 'application/ld+json'), { status: 406 });
}

const release = await check('release.json', () => get('/release.json'), { status: 200, typeStart: 'application/json', bodyIncludes: '"files"' });
if (expectCommit) {
  try {
    const commit = JSON.parse(release?.text ?? '').commit;
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
