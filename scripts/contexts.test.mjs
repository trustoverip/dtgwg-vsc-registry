// Expansion tests for the published credential contexts (contexts/vN.jsonld).
// check-immutability keeps a published context byte-identical; these check
// what it means: that a credential the specification describes expands under
// it in JSON-LD safe mode, which fails on any term that would be dropped, and
// that its protected terms cannot be redefined by a later context.
//
// No network: every context is loaded from this repository. The W3C VC v2
// context is a vendored copy, pinned to the digest the VC Data Model 2.0
// Recommendation publishes for it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jsonld from 'jsonld';
import { loadConfig } from './lib/config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = loadConfig(path.join(ROOT, 'registry.config.json'));

const VC_V2 = 'https://www.w3.org/ns/credentials/v2';
const VC_V2_FILE = path.join(ROOT, 'scripts', 'test', 'contexts', 'credentials-v2.jsonld');
const VC_V2_SHA256 = '59955ced6697d61e03f2b2556febe5308ab16842846f5b586d7f1f7adec92734';

const ctxUrl = (v) => `${config.contextBase}${v}`;
const ctxFile = (v) => path.join(ROOT, 'contexts', `${v}.jsonld`);
const ctxDoc = (v) => JSON.parse(fs.readFileSync(ctxFile(v), 'utf8'));

// Every term the contexts define is minted under one unversioned namespace;
// take it from v1's own DTGCredential rather than writing the host here.
const CRED = ctxDoc('v1')['@context'].DTGCredential.replace(/DTGCredential$/, '');

const LOCAL = new Map([
  [VC_V2, VC_V2_FILE],
  [ctxUrl('v1'), ctxFile('v1')],
  [ctxUrl('v2'), ctxFile('v2')],
]);

async function documentLoader(url) {
  const file = LOCAL.get(url);
  if (!file) throw new Error(`no local copy of ${url}; these tests never fetch`);
  return { contextUrl: null, documentUrl: url, document: JSON.parse(fs.readFileSync(file, 'utf8')) };
}

const expand = (doc) => jsonld.expand(doc, { documentLoader, safe: true });

/** The agent VAC from the specification's VAC section, which lists v2 and states `purposes`; `purposes: null` omits it. */
function vac({ context = 'v2', purposes = { scope: 'listed', purposes: ['taskExecution'] } } = {}) {
  return {
    '@context': [VC_V2, ctxUrl(context)],
    type: ['VerifiableCredential', 'DTGCredential', 'AuthorityCredential'],
    issuer: 'did:key:z6MkpTHR8VNs',
    issuerScope: 'directed',
    validFrom: '2026-01-06T10:00:00Z',
    validUntil: '2026-01-06T14:00:00Z',
    credentialSubject: {
      id: 'did:key:z6MkfR2aQ9Xv',
      authority: {
        scope: 'did:webvh:z6Mkw:example.com:rooms:7f3a',
        actions: ['read'],
        parent: 'zQmSfwf25HTvhmHve5VVWjwmQ9z7LFDWsB9hTweoieva2cd',
        maxAttenuation: 0,
      },
      ...(purposes === null ? {} : { purposes }),
    },
  };
}

const subjectOf = (expanded) => expanded[0]['https://www.w3.org/2018/credentials#credentialSubject'][0];
const purposesOf = (expanded) => subjectOf(expanded)[`${CRED}purposes`]?.[0];

test('the vendored W3C VC v2 context is the published one', () => {
  const sha = crypto.createHash('sha256').update(fs.readFileSync(VC_V2_FILE)).digest('hex');
  assert.equal(sha, VC_V2_SHA256);
});

test('v2 is v1 with exactly one term added, purposes', () => {
  const v1 = ctxDoc('v1')['@context'];
  const v2 = ctxDoc('v2')['@context'];
  for (const [term, def] of Object.entries(v1)) assert.deepEqual(v2[term], def, `v2 changed v1's ${term}`);
  assert.deepEqual(Object.keys(v2).filter((t) => !(t in v1)), ['purposes']);
});

test('a VAC listing purposes expands under v2 with no term dropped', async () => {
  const out = await expand(vac());
  const p = purposesOf(out);
  assert.ok(p, 'purposes did not expand');
  assert.deepEqual(p[`${CRED}purposeScope`], [{ '@value': 'listed' }]);
  assert.deepEqual(p[`${CRED}listedPurposes`], [{ '@value': 'taskExecution' }]);

  // The purposes-scoped `scope` does not displace authority's.
  const authority = subjectOf(out)[`${CRED}authority`][0];
  assert.deepEqual(authority[`${CRED}authorityScope`], [{ '@id': 'did:webvh:z6Mkw:example.com:rooms:7f3a' }]);
  assert.equal(authority[`${CRED}purposeScope`], undefined);
});

test('purposes {"scope": "any"} expands under v2', async () => {
  const p = purposesOf(await expand(vac({ purposes: { scope: 'any' } })));
  assert.deepEqual(p, { [`${CRED}purposeScope`]: [{ '@value': 'any' }] });
});

test('a listed purpose is a plain string, an IRI purpose included, never an @id', async () => {
  const iri = 'https://w3id.org/dpv#ServiceProvision';
  const p = purposesOf(await expand(vac({ purposes: { scope: 'listed', purposes: ['taskExecution', iri] } })));
  assert.deepEqual(p[`${CRED}listedPurposes`], [{ '@value': 'taskExecution' }, { '@value': iri }]);
});

test('a VAC stating purposes does not expand under v1', async () => {
  await assert.rejects(expand(vac({ context: 'v1' })), (e) =>
    e.name === 'jsonld.ValidationError' && e.details?.event?.details?.property === 'purposes');
});

test('a VAC with no purposes expands identically under v1 and v2', async () => {
  const strip = (doc) => JSON.stringify(doc);
  assert.equal(
    strip(await expand(vac({ context: 'v1', purposes: null }))),
    strip(await expand(vac({ context: 'v2', purposes: null }))),
  );
});

test('a later context cannot redefine purposes or its members', async () => {
  const redefine = (ctx) => {
    const doc = vac();
    doc['@context'] = [...doc['@context'], ctx];
    return expand(doc);
  };
  const isProtected = (e) => e.details?.code === 'protected term redefinition';
  await assert.rejects(redefine({ purposes: 'https://attacker.example/purposes' }), isProtected);
  await assert.rejects(redefine({ purposes: { '@id': `${CRED}purposes`, '@context': { scope: 'https://attacker.example/scope' } } }), isProtected);
});
