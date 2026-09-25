// Validator and generator tests against the fixture registry in
// scripts/test/fixtures. The real registry starts with zero predicates, so
// these are what exercise the rules in CI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { loadRegistry, validateRegistry, generateRegistry } from './lib/registry.mjs';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'test', 'fixtures');
const NS = 'https://registry.example/vocab/';

/** Copy the fixture tree to a temp dir and let `mutate` edit it. Returns the root. */
function scratch(mutate) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vsc-registry-'));
  fs.cpSync(FIXTURES, root, { recursive: true });
  mutate?.(root);
  return root;
}
const defPath = (root, name = 'attended', v = '1') => path.join(root, 'predicates', name, v, 'predicate.jsonld');
const readDef = (root, name, v) => JSON.parse(fs.readFileSync(defPath(root, name, v), 'utf8'));
const writeDef = (root, def, name = 'attended', v = '1') => {
  fs.mkdirSync(path.dirname(defPath(root, name, v)), { recursive: true });
  fs.writeFileSync(defPath(root, name, v), JSON.stringify(def, null, 2));
};
const editDef = (fn, name = 'attended', v = '1') => (root) => writeDef(root, fn(readDef(root, name, v)) ?? readDef(root, name, v), name, v);
const exPath = (root) => path.join(root, 'predicates', 'attended', '1', 'examples', 'in-person.json');
const editExample = (fn) => (root) => {
  const ex = JSON.parse(fs.readFileSync(exPath(root), 'utf8'));
  fs.writeFileSync(exPath(root), JSON.stringify(fn(ex) ?? ex));
};
const errorsFor = (mutate) => {
  const root = scratch(mutate);
  return validateRegistry(loadRegistry({ root, configFile: path.join(root, 'registry.config.json') }));
};
const expectError = (mutate, re) => {
  const errors = errorsFor(mutate);
  assert.ok(errors.some((e) => re.test(e)), `expected an error matching ${re}, got:\n  ${errors.join('\n  ') || '(none)'}`);
};

test('the fixture registry is valid', () => {
  assert.deepEqual(errorsFor(), []);
});

test('definition format: missing and malformed members', () => {
  expectError(editDef((d) => { delete d.doesNotEstablish; return d; }), /doesNotEstablish/);
  expectError(editDef((d) => { d.doesNotEstablish = []; return d; }), /doesNotEstablish.*fewer/);
  expectError(editDef((d) => { d.label = { nl: 'x' }; return d; }), /label.*en/);
  expectError(editDef((d) => { d.status = 'active'; return d; }), /status/);
  expectError(editDef((d) => { d.extra = 1; return d; }), /additional propert/);
  expectError(editDef((d) => { d.minimumIssuerScope = 'global'; return d; }), /minimumIssuerScope/);
  expectError(editDef((d) => { d.objectKind = ['value']; return d; }), /objectSchema|objectSchemaDelegated/);
  expectError(editDef((d) => { d.status = 'candidate'; return d; }), /since/);
  expectError(editDef((d) => { d.status = 'deprecated'; d.since = '2026-01-01'; return d; }), /deprecatedOn/);
  expectError(editDef((d) => { d.classification = 'evidence'; d.weighedBy = null; return d; }), /weighedBy/);
});

test('identifier: id must equal namespace + folder path, byte-exact', () => {
  expectError(editDef((d) => { d.id = `${NS}attended/2`; return d; }), /id is .* folder path/);
  expectError(editDef((d) => { d.id = 'https://www.registry.example/vocab/attended/1'; return d; }), /id is .* folder path/);
  expectError(editDef((d) => { d.name = 'attend'; return d; }), /name .* does not match folder/);
});

test('folder names must be in the grammar', () => {
  expectError((root) => {
    fs.cpSync(path.join(root, 'predicates', 'attended'), path.join(root, 'predicates', 'Attended_Event'), { recursive: true });
  }, /not a valid predicate name/);
  expectError((root) => {
    fs.cpSync(path.join(root, 'predicates', 'attended', '1'), path.join(root, 'predicates', 'attended', '01'), { recursive: true });
  }, /not a valid version/);
});

test('versioning: n>1 needs n-1, supersedes it, and n-1 is deprecated pointing forward', () => {
  const v2 = (d) => ({ ...d, id: `${NS}attended/2`, version: 2, supersedes: null });
  expectError((root) => writeDef(root, v2(readDef(root)), 'attended', '2'), /must declare supersedes/);
  expectError((root) => writeDef(root, { ...v2(readDef(root)), supersedes: `${NS}attended/1` }, 'attended', '2'), /must be marked deprecated/);
  // A correctly sequenced new version passes.
  const ok = errorsFor((root) => {
    writeDef(root, { ...v2(readDef(root)), supersedes: `${NS}attended/1` }, 'attended', '2');
    writeDef(root, { ...readDef(root), status: 'deprecated', since: '2026-01-01', deprecatedOn: '2026-09-01', supersededBy: `${NS}attended/2` });
  });
  assert.deepEqual(ok, []);
  expectError((root) => {
    fs.renameSync(path.join(root, 'predicates', 'attended', '1'), path.join(root, 'predicates', 'attended', '3'));
    writeDef(root, { ...readDef(root, 'attended', '3'), id: `${NS}attended/3`, version: 3, supersedes: `${NS}attended/2` }, 'attended', '3');
  }, /version 2 does not/);
});

test('convergence from a community namespace requires convergenceRecord', () => {
  expectError(editDef((d) => { d.supersedes = 'https://other.example/vocab#attended'; return d; }), /requires convergenceRecord/);
  const ok = errorsFor(editDef((d) => { d.supersedes = 'https://other.example/vocab#attended'; d.convergenceRecord = 'https://github.com/other/vocab/pull/7'; return d; }));
  assert.deepEqual(ok, []);
  expectError(editDef((d) => { d.convergenceRecord = 'https://github.com/other/vocab/pull/7'; return d; }), /only meaningful/);
});

test('supersededBy implies deprecated', () => {
  expectError(editDef((d) => { d.supersededBy = `${NS}attended/2`; return d; }), /status must be deprecated/);
});

test('local schema files must declare their published $id', () => {
  expectError((root) => {
    const f = path.join(root, 'predicates', 'attended', '1', 'attendance.schema.json');
    const s = JSON.parse(fs.readFileSync(f, 'utf8'));
    s.$id = 'https://elsewhere.example/attendance.schema.json';
    fs.writeFileSync(f, JSON.stringify(s));
  }, /\$id must be/);
  expectError(editDef((d) => { d.additionalMembers.attendance.schema = `${NS}attended/1/missing.schema.json`; return d; }), /does not exist/);
});

test('examples must be credentials the profile accepts', () => {
  expectError(editExample((ex) => { ex.credentialSubject.predicate = `${NS}attended/1/`; return ex; }), /predicate is .* expected .* byte-exact/);
  expectError(editExample((ex) => { ex.credentialSubject.object = { value: 'x' }; return ex; }), /object kind "value" is not permitted/);
  expectError(editExample((ex) => { ex.credentialSubject.object = { id: 'a', digestMultibase: 'b' }; return ex; }), /exactly one of/);
  expectError(editExample((ex) => { delete ex.taskContext; return ex; }), /requires taskContext/);
  expectError(editExample((ex) => { ex.credentialSubject.attendance = { method: 'telepathy' }; return ex; }), /attendance does not validate/);
  expectError(editExample((ex) => { ex.type = ['VerifiableCredential']; return ex; }), /StatementCredential/);
});

test('one identifier per concept: two live names cannot share an English label', () => {
  expectError((root) => {
    const d = readDef(root);
    writeDef(root, { ...d, id: `${NS}was-present/1`, name: 'was-present', label: { en: 'attended' } }, 'was-present', '1');
  }, /already used by/);
});

test('generate: dist layout, accept-list validates against its schema, digests cover everything', () => {
  const root = scratch();
  const reg = loadRegistry({ root, configFile: path.join(root, 'registry.config.json') });
  assert.deepEqual(validateRegistry(reg), []);
  const out = path.join(root, 'dist');
  const { acceptList } = generateRegistry(reg, { outDir: out });

  for (const rel of [
    'index.html', '404.html', '_worker.js', '_headers', 'assets/site.css', 'release.json',
    'vocab.html', 'vocab/vocab.jsonld', 'vocab/accept-list.json', 'vocab/accept-list.json.sha256',
    'vocab/attended.html', 'vocab/attended/1.html', 'vocab/attended/1/predicate.jsonld',
    'vocab/attended/1/attendance.schema.json', 'vocab/attended/1/examples/in-person.json',
    'context.html', 'meta/v1/predicate.schema.json', 'meta/v1/predicate-context.jsonld', 'meta/v1/accept-list.schema.json'
  ]) {
    assert.ok(fs.existsSync(path.join(out, rel)), `missing ${rel}`);
  }
  // No index.html under a term path: the canonical URL must serve without a redirect.
  assert.ok(!fs.existsSync(path.join(out, 'vocab', 'attended', '1', 'index.html')));

  // The worker got its paths from the config.
  const worker = fs.readFileSync(path.join(out, '_worker.js'), 'utf8');
  assert.match(worker, /namespacePath = '\/vocab'/);
  assert.match(worker, /contextPath = '\/context'/);
  assert.doesNotMatch(worker, /\{\{/);

  // The published meta-schema carries the instance's URLs, not tokens.
  const schema = JSON.parse(fs.readFileSync(path.join(out, 'meta', 'v1', 'predicate.schema.json'), 'utf8'));
  assert.equal(schema.$id, 'https://registry.example/meta/v1/predicate.schema.json');

  // accept-list validates against the schema we publish for it.
  const ajv = new Ajv2020({ strict: true, strictRequired: false, allowUnionTypes: true });
  addFormats(ajv);
  const validate = ajv.compile(JSON.parse(fs.readFileSync(path.join(out, 'meta', 'v1', 'accept-list.schema.json'), 'utf8')));
  assert.ok(validate(acceptList), JSON.stringify(validate.errors));
  assert.equal(acceptList.predicates[`${NS}attended/1`].taskContextRequired, true);
  assert.equal(acceptList.predicates[`${NS}attended/1`].additionalMembers.attendance.schema, `${NS}attended/1/attendance.schema.json`);

  // The predicate page names the IRI in exact bytes and links its alternate.
  const page = fs.readFileSync(path.join(out, 'vocab', 'attended', '1.html'), 'utf8');
  assert.ok(page.includes(`<code id="iri">${NS}attended/1</code>`));
  assert.ok(page.includes('rel="alternate" type="application/ld+json" href="/vocab/attended/1/predicate.jsonld"'));
  assert.ok(page.includes('heeft bijgewoond'));

  // release.json digests every file but itself.
  const release = JSON.parse(fs.readFileSync(path.join(out, 'release.json'), 'utf8'));
  assert.ok(release.files['vocab/attended/1/predicate.jsonld']);
  assert.ok(!release.files['release.json']);
  assert.equal(release.namespace, NS);
});
