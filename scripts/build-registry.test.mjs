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
import { parseConfig } from './lib/config.mjs';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'test', 'fixtures');
const NS = 'https://registry.example/vocab/';
const PNS = 'https://registry.example/purpose/';

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
const purposePath = (root, name = 'example-use', v = '1') => path.join(root, 'purposes', name, v, 'purpose.jsonld');
const readPurpose = (root, name = 'example-use', v = '1') => JSON.parse(fs.readFileSync(purposePath(root, name, v), 'utf8'));
const writePurpose = (root, def, name = 'example-use', v = '1') => {
  fs.mkdirSync(path.dirname(purposePath(root, name, v)), { recursive: true });
  fs.writeFileSync(purposePath(root, name, v), JSON.stringify(def, null, 2));
};
const editPurpose = (fn) => (root) => writePurpose(root, fn(readPurpose(root)) ?? readPurpose(root));
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

  // The fixture's namespace sits directly under the host root, so `/` is the
  // registry's home itself: no landing page, no "All registries" link.
  const home = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  assert.match(home, /<h1>Example Community Registry<\/h1>/);
  assert.doesNotMatch(home, /All registries/);

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

test('a namespace below the root gets a registry home at its parent path and a landing page at /', () => {
  // The DTG shape: namespace /community/vocab/, so the registry's home is
  // /community and / is the host's landing page listing it.
  const root = scratch((r) => {
    for (const rel of ['registry.config.json', 'predicates/attended/1/predicate.jsonld', 'predicates/attended/1/attendance.schema.json', 'predicates/attended/1/examples/in-person.json', 'purposes/example-use/1/purpose.jsonld', 'purposes/example-use/1/examples/grant.json']) {
      const f = path.join(r, rel);
      fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replaceAll('https://registry.example/', 'https://registry.example/community/'));
    }
    const cfgFile = path.join(r, 'registry.config.json');
    const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
    cfg.siteUrl = 'https://registry.example/'; // the origin every check is relative to; not a prefix
    fs.writeFileSync(cfgFile, JSON.stringify(cfg));
  });
  const reg = loadRegistry({ root, configFile: path.join(root, 'registry.config.json') });
  assert.deepEqual(validateRegistry(reg), []);
  assert.equal(reg.config.registryPath, '/community');
  const out = path.join(root, 'dist');
  generateRegistry(reg, { outDir: out });

  for (const rel of ['index.html', 'community.html', 'community/vocab.html', 'community/vocab/attended/1.html', 'community/context.html', 'community/purpose.html', 'community/purpose/example-use/1.html']) {
    assert.ok(fs.existsSync(path.join(out, rel)), `missing ${rel}`);
  }
  const landing = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  assert.match(landing, /<title>Registries · Example registries<\/title>/);
  assert.match(landing, /<h1>Example registries<\/h1>/);
  assert.match(landing, /href="\/community">Example Community Registry</);
  assert.doesNotMatch(landing, /<header class="site">/); // no registry nav on the host's page

  const home = fs.readFileSync(path.join(out, 'community.html'), 'utf8');
  assert.match(home, /<title>Home · Example Community Registry<\/title>/);
  assert.match(home, /<h1>Example Community Registry<\/h1>/);
  assert.match(home, /<a href="\/community">Example Community Registry<\/a>/); // nav site-name link
  assert.match(home, /<a href="\/">All registries<\/a>/);
  assert.match(home, /href="\/community\/vocab"/);
  assert.match(home, /href="\/community\/purpose"/);
  assert.match(fs.readFileSync(path.join(out, 'community', 'vocab.html'), 'utf8'), /<h1>Predicates<\/h1>/); // indexName, from config

  // Breadcrumbs start at the registry's home, not at /.
  const term = fs.readFileSync(path.join(out, 'community', 'vocab', 'attended', '1.html'), 'utf8');
  assert.match(term, /<nav class="crumbs"[^>]*><a href="\/community">Home<\/a>/);
});

test('config: a context or meta base at the parent of the namespace is refused', () => {
  const base = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'registry.config.json'), 'utf8'));
  const nested = { ...base, namespace: 'https://registry.example/reg/vsc/', contextBase: 'https://registry.example/reg/context/', metaBase: 'https://registry.example/reg/meta/' };
  assert.equal(parseConfig(nested).registryPath, '/reg');
  // The home page would be written to reg.html, over the contexts index.
  assert.throws(() => parseConfig({ ...nested, contextBase: 'https://registry.example/reg/' }), /"contextBase" \(\/reg\) is the parent of "namespace"/);
  assert.throws(() => parseConfig({ ...nested, metaBase: 'https://registry.example/reg/' }), /"metaBase" \(\/reg\)/);
  assert.throws(() => parseConfig({ ...base, indexName: undefined }), /"indexName" is required/);
});

// ---------------------------------------------------------------------------
// Purposes: the vocabulary beside the predicates (meta/purpose.schema.json)
// ---------------------------------------------------------------------------

test('purpose definition format: missing and malformed members', () => {
  expectError(editPurpose((d) => { delete d.excludes; return d; }), /purpose\.jsonld.*excludes/);
  expectError(editPurpose((d) => { d.includes = []; return d; }), /includes.*fewer/);
  expectError(editPurpose((d) => { d.description = { nl: 'x' }; return d; }), /description.*en/);
  expectError(editPurpose((d) => { d.status = 'active'; return d; }), /purpose\.jsonld.*status/);
  expectError(editPurpose((d) => { d.extra = 1; return d; }), /purpose\.jsonld.*additional propert/);
  expectError(editPurpose((d) => { d.type = 'Predicate'; return d; }), /purpose\.jsonld.*type/);
  expectError(editPurpose((d) => { d.mappings[0].relation = 'sameAs'; return d; }), /mappings\/0\/relation/);
  expectError(editPurpose((d) => { d.status = 'candidate'; return d; }), /purpose\.jsonld.*since/);
  expectError(editPurpose((d) => { d['@context'] = 'https://registry.example/meta/v1/predicate-context.jsonld'; return d; }), /purpose\.jsonld.*@context/);
});

test('purpose identifier: id must equal the purpose namespace + folder path, byte-exact', () => {
  expectError(editPurpose((d) => { d.id = `${NS}example-use/1`; return d; }), /id is .* folder path gives "https:\/\/registry\.example\/purpose\/example-use\/1"/);
  expectError(editPurpose((d) => { d.id = `${PNS}example-use/1/`; return d; }), /id is .* folder path/);
  expectError(editPurpose((d) => { d.name = 'example'; return d; }), /name .* does not match folder/);
  expectError((root) => {
    fs.cpSync(path.join(root, 'purposes', 'example-use'), path.join(root, 'purposes', 'Example_Use'), { recursive: true });
  }, /not a valid purpose name/);
});

test('purpose versioning: n>1 needs n-1, supersedes it, and n-1 is deprecated pointing forward', () => {
  const v2 = (d) => ({ ...d, id: `${PNS}example-use/2`, version: 2, supersedes: null });
  expectError((root) => writePurpose(root, v2(readPurpose(root)), 'example-use', '2'), /must declare supersedes/);
  expectError((root) => writePurpose(root, { ...v2(readPurpose(root)), supersedes: `${PNS}example-use/1` }, 'example-use', '2'), /must be marked deprecated/);
  const ok = errorsFor((root) => {
    writePurpose(root, { ...v2(readPurpose(root)), supersedes: `${PNS}example-use/1` }, 'example-use', '2');
    writePurpose(root, { ...readPurpose(root), status: 'deprecated', since: '2026-01-01', deprecatedOn: '2026-09-01', supersededBy: `${PNS}example-use/2` });
  });
  assert.deepEqual(ok, []);
  expectError(editPurpose((d) => { d.supersedes = 'https://other.example/purposes#exampleUse'; return d; }), /requires convergenceRecord/);
  expectError(editPurpose((d) => { d.supersededBy = `${PNS}example-use/2`; return d; }), /status must be deprecated/);
});

test('purpose examples must carry the purpose IRI byte-exact', () => {
  expectError((root) => {
    const f = path.join(root, 'purposes', 'example-use', '1', 'examples', 'grant.json');
    fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(`${PNS}example-use/1`, `${PNS}example-use/1/`));
  }, /grant\.json: does not carry the purpose IRI/);
});

test('one identifier per purpose: no shared live label, no two exactMatch claims on one term, no mapping to itself', () => {
  const twin = (d, extra) => ({ ...d, id: `${PNS}other-use/1`, name: 'other-use', label: { en: 'other use' }, mappings: [], ...extra });
  expectError((root) => writePurpose(root, twin(readPurpose(root), { label: { en: 'Example use' } }), 'other-use', '1'), /English label "Example use" is already used by "example-use"/);
  expectError((root) => writePurpose(root, twin(readPurpose(root), { mappings: readPurpose(root).mappings }), 'other-use', '1'), /exactMatch to "exampleUse" is already claimed by "example-use"/);
  // A close match to the same term is not a second identifier.
  assert.deepEqual(errorsFor((root) => writePurpose(root, twin(readPurpose(root), { mappings: [{ ...readPurpose(root).mappings[0], relation: 'closeMatch' }] }), 'other-use', '1')), []);
  // A purpose and a predicate may share a label: they are different vocabularies.
  assert.deepEqual(errorsFor(editPurpose((d) => { d.label.en = 'attended'; return d; })), []);
  expectError(editPurpose((d) => { d.mappings.push({ term: `${PNS}other-use/1`, scheme: PNS, relation: 'broadMatch' }); return d; }), /names this registry's own purpose/);
});

test('purposes need a configured purpose namespace', () => {
  expectError((root) => {
    const f = path.join(root, 'registry.config.json');
    const cfg = JSON.parse(fs.readFileSync(f, 'utf8'));
    delete cfg.purposeNamespace;
    fs.writeFileSync(f, JSON.stringify(cfg));
  }, /purposes\/: purpose definitions are present but registry\.config\.json sets no "purposeNamespace"/);
});

test('generate: purpose pages, vocabulary and purpose list, which validates against its schema', () => {
  const root = scratch();
  const reg = loadRegistry({ root, configFile: path.join(root, 'registry.config.json') });
  assert.deepEqual(validateRegistry(reg), []);
  const out = path.join(root, 'dist');
  const { purposeList } = generateRegistry(reg, { outDir: out });

  for (const rel of [
    'purpose.html', 'purpose/vocab.jsonld', 'purpose/purposes.json', 'purpose/purposes.json.sha256',
    'purpose/example-use.html', 'purpose/example-use/1.html', 'purpose/example-use/1/purpose.jsonld',
    'purpose/example-use/1/examples/grant.json',
    'meta/v1/purpose.schema.json', 'meta/v1/purpose-context.jsonld', 'meta/v1/purpose-list.schema.json'
  ]) {
    assert.ok(fs.existsSync(path.join(out, rel)), `missing ${rel}`);
  }
  assert.ok(!fs.existsSync(path.join(out, 'purpose', 'example-use', '1', 'index.html')));

  const schema = JSON.parse(fs.readFileSync(path.join(out, 'meta', 'v1', 'purpose.schema.json'), 'utf8'));
  assert.equal(schema.$id, 'https://registry.example/meta/v1/purpose.schema.json');
  assert.equal(schema.properties['@context'].const, 'https://registry.example/meta/v1/purpose-context.jsonld');

  const ajv = new Ajv2020({ strict: true, strictRequired: false, allowUnionTypes: true });
  addFormats(ajv);
  const validate = ajv.compile(JSON.parse(fs.readFileSync(path.join(out, 'meta', 'v1', 'purpose-list.schema.json'), 'utf8')));
  assert.ok(validate(purposeList), JSON.stringify(validate.errors));
  assert.equal(purposeList.namespace, PNS);
  assert.deepEqual(purposeList.purposes[`${PNS}example-use/1`], {
    status: 'draft',
    label: { en: 'example use', nl: 'voorbeeldgebruik' },
    description: { en: 'To do the example thing you asked for.' },
    supersededBy: null
  });

  const vocab = JSON.parse(fs.readFileSync(path.join(out, 'purpose', 'vocab.jsonld'), 'utf8'));
  assert.equal(vocab['@context'], 'https://registry.example/meta/v1/purpose-context.jsonld');
  assert.deepEqual(vocab['@graph'].map((t) => t.id), [`${PNS}example-use/1`]);

  // The purpose page names the IRI in exact bytes, the description a person sees, and links its alternate.
  const page = fs.readFileSync(path.join(out, 'purpose', 'example-use', '1.html'), 'utf8');
  assert.ok(page.includes(`<code id="iri">${PNS}example-use/1</code>`));
  assert.ok(page.includes('rel="alternate" type="application/ld+json" href="/purpose/example-use/1/purpose.jsonld"'));
  assert.ok(page.includes('To do the example thing you asked for.'));
  assert.ok(page.includes('voorbeeldgebruik'));
  assert.match(page, /<code>exactMatch<\/code> <code>exampleUse<\/code>/);

  const history = fs.readFileSync(path.join(out, 'purpose', 'example-use.html'), 'utf8');
  assert.ok(history.includes(`<code>${PNS}example-use</code> is not a purpose`));

  // Nav, home page and worker know the purpose namespace.
  const home = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  assert.match(home, /<a href="\/purpose">Purposes<\/a>/);
  assert.ok(home.includes(`>${PNS}</a></dt>`));
  assert.match(fs.readFileSync(path.join(out, '_worker.js'), 'utf8'), /purposeNamespacePath = '\/purpose'/);

  const release = JSON.parse(fs.readFileSync(path.join(out, 'release.json'), 'utf8'));
  assert.ok(release.files['purpose/example-use/1/purpose.jsonld']);
  assert.equal(release.purposeNamespace, PNS);
});

test('a registry with no purpose namespace publishes no purpose pages', () => {
  const root = scratch((r) => {
    fs.rmSync(path.join(r, 'purposes'), { recursive: true });
    const f = path.join(r, 'registry.config.json');
    const cfg = JSON.parse(fs.readFileSync(f, 'utf8'));
    cfg.purposeNamespace = null;
    fs.writeFileSync(f, JSON.stringify(cfg));
  });
  const reg = loadRegistry({ root, configFile: path.join(root, 'registry.config.json') });
  assert.deepEqual(validateRegistry(reg), []);
  const out = path.join(root, 'dist');
  const { purposeList } = generateRegistry(reg, { outDir: out });
  assert.equal(purposeList, null);
  assert.ok(!fs.existsSync(path.join(out, 'purpose.html')));
  assert.doesNotMatch(fs.readFileSync(path.join(out, 'index.html'), 'utf8'), /Purposes/);
  const worker = fs.readFileSync(path.join(out, '_worker.js'), 'utf8');
  assert.match(worker, /purposeNamespacePath = ''/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(out, 'release.json'), 'utf8')).purposeNamespace, undefined);
});

test('config: the purpose namespace is an https prefix on the same origin, beside the other paths', () => {
  const base = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'registry.config.json'), 'utf8'));
  assert.equal(parseConfig(base).purposeNamespacePath, '/purpose');
  assert.equal(parseConfig({ ...base, purposeNamespace: null }).purposeNamespacePath, '');
  assert.throws(() => parseConfig({ ...base, purposeNamespace: 'https://registry.example/purpose' }), /"purposeNamespace" must end with "\/"/);
  assert.throws(() => parseConfig({ ...base, purposeNamespace: 'http://registry.example/purpose/' }), /"purposeNamespace" must be https/);
  assert.throws(() => parseConfig({ ...base, purposeNamespace: 'https://elsewhere.example/purpose/' }), /"purposeNamespace" must share the origin/);
  assert.throws(() => parseConfig({ ...base, purposeNamespace: '' }), /"purposeNamespace" must be a non-empty string, or null/);
  assert.throws(() => parseConfig({ ...base, purposeNamespace: 'https://registry.example/vocab/purpose/' }), /"purposeNamespace" \(\/vocab\/purpose\) and "namespace" \(\/vocab\) overlap/);
  assert.throws(() => parseConfig({ ...base, purposeNamespace: base.namespace }), /overlap/);
  assert.throws(() => parseConfig({ ...base, purposeNamespace: 'https://registry.example/context/' }), /"contextBase" \(\/context\) overlap/);
  const nested = { ...base, namespace: 'https://registry.example/reg/vsc/', contextBase: 'https://registry.example/reg/context/', metaBase: 'https://registry.example/reg/meta/' };
  assert.throws(() => parseConfig({ ...nested, purposeNamespace: 'https://registry.example/reg/' }), /"purposeNamespace" \(\/reg\) is the parent of "namespace"/);
});
