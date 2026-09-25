// Load, validate and generate the registry.
//
// The CLI in scripts/build-registry.mjs is a thin wrapper around three
// functions here so the tests can drive them against fixture trees:
//
//   loadRegistry({ root, configFile })  → registry (or throws on unreadable input)
//   validateRegistry(registry)          → array of "location: message" strings, empty when valid
//   generateRegistry(registry, { outDir }) → writes dist/
//
// The validation rules are those of GOVERNANCE.md and PLAN.md §1.5; each
// check names the rule it enforces.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { loadConfig, substitute, NAME_RE, VERSION_RE } from './config.mjs';
import * as render from './render.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..', '..');

const STATUSES = ['draft', 'candidate', 'standard', 'deprecated'];
export const MUTABLE_MEMBERS = ['status', 'since', 'deprecatedOn', 'supersededBy'];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function listDirs(dir) {
  if (!exists(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
}

function listFiles(dir) {
  if (!exists(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isFile()).map((d) => d.name).sort();
}

function lastModified(root, rel) {
  try {
    const iso = execSync(`git log -1 --format=%cI -- "${rel}"`, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (iso) return iso.slice(0, 10);
  } catch {
    /* not a git checkout, or path not committed yet */
  }
  return new Date().toISOString().slice(0, 10);
}

function gitInfo(root) {
  const run = (cmd) => {
    try {
      return execSync(cmd, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      return '';
    }
  };
  const commit = run('git rev-parse HEAD') || '0000000';
  // A release is a tag on this exact commit. A build from any other commit is
  // 'unreleased', so accept-list.json never claims a revision it is not.
  const tag = run('git describe --tags --exact-match HEAD');
  return { commit, revision: tag || 'unreleased' };
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

export function loadRegistry({ root = REPO_ROOT, configFile } = {}) {
  const config = loadConfig(configFile ?? path.join(root, 'registry.config.json'));
  const metaDir = path.join(REPO_ROOT, 'meta');
  const meta = {
    predicateSchema: JSON.parse(substitute(fs.readFileSync(path.join(metaDir, 'predicate.schema.json'), 'utf8'), config)),
    predicateContext: JSON.parse(substitute(fs.readFileSync(path.join(metaDir, 'predicate-context.jsonld'), 'utf8'), config)),
    acceptListSchema: JSON.parse(substitute(fs.readFileSync(path.join(metaDir, 'accept-list.schema.json'), 'utf8'), config))
  };

  const predicates = [];
  const loadErrors = [];
  const predicatesDir = path.join(root, 'predicates');
  for (const name of listDirs(predicatesDir)) {
    for (const version of listDirs(path.join(predicatesDir, name))) {
      const relDir = path.posix.join('predicates', name, version);
      const dir = path.join(predicatesDir, name, version);
      const defFile = path.join(dir, 'predicate.jsonld');
      const rec = {
        name,
        version,
        relDir,
        dir,
        iri: `${config.namespace}${name}/${version}`,
        def: null,
        profileMd: exists(path.join(dir, 'profile.md')) ? fs.readFileSync(path.join(dir, 'profile.md'), 'utf8') : null,
        schemaFiles: listFiles(dir).filter((f) => f.endsWith('.schema.json')),
        examples: [],
        updated: lastModified(root, relDir)
      };
      if (!exists(defFile)) {
        loadErrors.push(`${relDir}: predicate.jsonld is missing`);
      } else {
        try {
          rec.def = readJson(defFile);
        } catch (e) {
          loadErrors.push(`${relDir}/predicate.jsonld: not valid JSON (${e.message})`);
        }
      }
      for (const f of listFiles(path.join(dir, 'examples'))) {
        if (!f.endsWith('.json')) continue;
        try {
          rec.examples.push({ file: f, doc: readJson(path.join(dir, 'examples', f)) });
        } catch (e) {
          loadErrors.push(`${relDir}/examples/${f}: not valid JSON (${e.message})`);
        }
      }
      predicates.push(rec);
    }
  }

  const contexts = [];
  const contextsDir = path.join(root, 'contexts');
  for (const f of listFiles(contextsDir)) {
    const m = /^v([1-9][0-9]*)\.jsonld$/.exec(f);
    if (!m) {
      loadErrors.push(`contexts/${f}: context files are named v<N>.jsonld`);
      continue;
    }
    try {
      contexts.push({ version: `v${m[1]}`, file: f, doc: readJson(path.join(contextsDir, f)), raw: fs.readFileSync(path.join(contextsDir, f), 'utf8'), updated: lastModified(root, `contexts/${f}`) });
    } catch (e) {
      loadErrors.push(`contexts/${f}: not valid JSON (${e.message})`);
    }
  }

  return { root, config, meta, predicates, contexts, loadErrors, git: gitInfo(root) };
}

// ---------------------------------------------------------------------------
// Validate
// ---------------------------------------------------------------------------

function newAjv() {
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true });
  addFormats(ajv);
  return ajv;
}

function formatAjvErrors(errors) {
  return (errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}${e.params?.additionalProperty ? ` (${e.params.additionalProperty})` : ''}`).join('; ');
}

function objectKindOf(object) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) return [];
  return ['id', 'digestMultibase', 'value'].filter((k) => k in object);
}

export function validateRegistry(reg) {
  const errors = [...reg.loadErrors];
  const fail = (loc, msg) => errors.push(`${loc}: ${msg}`);
  const { config } = reg;

  const ajv = newAjv();
  const validateDef = ajv.compile(reg.meta.predicateSchema);
  ajv.compile(reg.meta.acceptListSchema); // the schema we publish must itself compile

  const byIri = new Map(reg.predicates.map((p) => [p.iri, p]));
  const byName = new Map();
  for (const p of reg.predicates) {
    if (!byName.has(p.name)) byName.set(p.name, []);
    byName.get(p.name).push(p);
  }

  for (const p of reg.predicates) {
    const loc = `${p.relDir}/predicate.jsonld`;

    // Folder path must be in the grammar (GOVERNANCE §2.1).
    if (!NAME_RE.test(p.name)) fail(p.relDir, `folder name "${p.name}" is not a valid predicate name`);
    if (!VERSION_RE.test(p.version)) fail(p.relDir, `folder "${p.version}" is not a valid version (positive integer, no leading zeros)`);
    if (!p.def) continue;

    // Definition format (meta/predicate.schema.json).
    if (!validateDef(p.def)) {
      fail(loc, formatAjvErrors(validateDef.errors));
      continue;
    }
    const d = p.def;
    p.schemaValid = true;

    // id == namespace + folder path, byte-exact and NFC (GOVERNANCE §2.1, spec Predicate Handling).
    if (d.id !== p.iri) fail(loc, `id is "${d.id}" but the folder path gives "${p.iri}"`);
    if (d.id !== d.id.normalize('NFC')) fail(loc, 'id is not in Unicode Normalization Form C');
    if (d.name !== p.name) fail(loc, `name "${d.name}" does not match folder "${p.name}"`);
    if (String(d.version) !== p.version) fail(loc, `version ${d.version} does not match folder "${p.version}"`);

    // Every schema URL the definition names under this version's folder must be a file there,
    // and every *.schema.json file must declare $id as its published URL.
    const localSchemaUrl = (file) => `${p.iri}/${file}`;
    const schemaUrls = [d.objectSchema, ...Object.values(d.additionalMembers).map((m) => m.schema)].filter((u) => typeof u === 'string');
    for (const u of schemaUrls) {
      if (u.startsWith(p.iri + '/')) {
        const file = u.slice(p.iri.length + 1);
        if (!p.schemaFiles.includes(file)) fail(loc, `references schema ${u} but ${p.relDir}/${file} does not exist`);
      }
    }
    p.localSchemas = new Map();
    for (const f of p.schemaFiles) {
      const sLoc = `${p.relDir}/${f}`;
      let schema;
      try {
        schema = readJson(path.join(p.dir, f));
      } catch (e) {
        fail(sLoc, `not valid JSON (${e.message})`);
        continue;
      }
      if (schema.$id !== localSchemaUrl(f)) fail(sLoc, `$id must be "${localSchemaUrl(f)}"`);
      if (schema.$schema !== 'https://json-schema.org/draft/2020-12/schema') fail(sLoc, '$schema must be https://json-schema.org/draft/2020-12/schema');
      try {
        p.localSchemas.set(localSchemaUrl(f), newAjv().compile(schema));
      } catch (e) {
        fail(sLoc, `does not compile: ${e.message}`);
      }
    }

    // Versioning (GOVERNANCE §3): n>1 needs n-1, and supersedes exactly n-1.
    const n = Number(p.version);
    const prevIri = `${config.namespace}${p.name}/${n - 1}`;
    if (n > 1) {
      if (!byIri.has(prevIri)) fail(loc, `version ${n} exists but version ${n - 1} does not`);
      if (d.supersedes !== prevIri) fail(loc, `version ${n} must declare supersedes "${prevIri}"`);
    }
    if (typeof d.supersedes === 'string') {
      if (d.supersedes.startsWith(config.namespace)) {
        const target = byIri.get(d.supersedes);
        if (!target) fail(loc, `supersedes "${d.supersedes}", which is not in this registry`);
        else if (target.def) {
          if (target.def.status !== 'deprecated') fail(loc, `supersedes "${d.supersedes}", which must be marked deprecated in the same change`);
          if (target.def.supersededBy !== p.iri) fail(`${target.relDir}/predicate.jsonld`, `must declare supersededBy "${p.iri}"`);
        }
      } else {
        // Convergence from a community namespace (GOVERNANCE §5): the link is mandatory.
        if (n !== 1) fail(loc, 'only version 1 of a term can supersede a term outside this namespace');
        if (typeof d.convergenceRecord !== 'string') fail(loc, `supersedes the external term "${d.supersedes}" and therefore requires convergenceRecord`);
      }
    } else if (typeof d.convergenceRecord === 'string') {
      fail(loc, 'convergenceRecord is only meaningful with an external supersedes');
    }
    if (typeof d.supersededBy === 'string') {
      if (d.status !== 'deprecated') fail(loc, 'supersededBy is set, so status must be deprecated');
      if (d.supersededBy.startsWith(config.namespace) && !byIri.has(d.supersededBy)) fail(loc, `supersededBy "${d.supersededBy}" is not in this registry`);
      if (d.supersededBy === p.iri) fail(loc, 'a term cannot supersede itself');
    }

    // Examples (PLAN §1.5 step 3): every example must be a credential the profile accepts.
    for (const ex of p.examples) {
      const eLoc = `${p.relDir}/examples/${ex.file}`;
      const c = ex.doc;
      const types = Array.isArray(c.type) ? c.type : [];
      if (!types.includes('VerifiableCredential') || !types.includes('StatementCredential')) fail(eLoc, 'type must include "VerifiableCredential" and "StatementCredential"');
      if (typeof c.issuer !== 'string' && typeof c.issuer?.id !== 'string') fail(eLoc, 'issuer is required');
      const cs = c.credentialSubject;
      if (!cs || typeof cs !== 'object') {
        fail(eLoc, 'credentialSubject is required');
        continue;
      }
      if (typeof cs.id !== 'string') fail(eLoc, 'credentialSubject.id is required');
      if (cs.predicate !== p.iri) fail(eLoc, `credentialSubject.predicate is "${cs.predicate}", expected "${p.iri}" byte-exact`);
      const kinds = objectKindOf(cs.object);
      if (kinds.length !== 1) fail(eLoc, 'credentialSubject.object must carry exactly one of id, digestMultibase, value');
      else if (!d.objectKind.includes(kinds[0])) fail(eLoc, `object kind "${kinds[0]}" is not permitted by the profile (${d.objectKind.join(', ')})`);
      else if (kinds[0] === 'value' && typeof d.objectSchema === 'string' && p.localSchemas.has(d.objectSchema)) {
        const v = p.localSchemas.get(d.objectSchema);
        if (!v(cs.object.value)) fail(eLoc, `object.value does not validate against ${d.objectSchema}: ${formatAjvErrors(v.errors)}`);
      }
      if (d.taskContextRequired) {
        if (typeof c.taskContext !== 'string') fail(eLoc, 'the profile requires taskContext');
        if (typeof c.taskDigestMultibase !== 'string') fail(eLoc, 'the profile requires taskDigestMultibase');
      }
      for (const [member, spec] of Object.entries(d.additionalMembers)) {
        if (spec.required && !(member in cs)) fail(eLoc, `the profile requires credentialSubject.${member}`);
        if (member in cs && typeof spec.schema === 'string' && p.localSchemas.has(spec.schema)) {
          const v = p.localSchemas.get(spec.schema);
          if (!v(cs[member])) fail(eLoc, `credentialSubject.${member} does not validate against ${spec.schema}: ${formatAjvErrors(v.errors)}`);
        }
      }
    }
  }

  // One identifier per concept (GOVERNANCE §5 criterion 5), checked at its weakest point:
  // two different names must not share an English label while both are live.
  const liveLabels = new Map();
  for (const p of reg.predicates) {
    if (!p.def || !p.schemaValid || p.def.status === 'deprecated') continue;
    const label = p.def.label.en.trim().toLowerCase();
    const other = liveLabels.get(label);
    if (other && other !== p.name) fail(`${p.relDir}/predicate.jsonld`, `English label "${p.def.label.en}" is already used by "${other}"`);
    liveLabels.set(label, p.name);
  }

  // Contexts: each must be a JSON-LD context document.
  for (const c of reg.contexts) {
    if (!c.doc || typeof c.doc !== 'object' || !('@context' in c.doc)) fail(`contexts/${c.file}`, 'must be a JSON-LD context document with a top-level "@context"');
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Generate
// ---------------------------------------------------------------------------

function writeFile(outDir, rel, content) {
  const file = path.join(outDir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function stableJson(obj) {
  return JSON.stringify(obj, null, 2) + '\n';
}

export function buildAcceptList(reg) {
  const predicates = {};
  for (const p of reg.predicates) {
    const d = p.def;
    const additionalMembers = {};
    for (const [k, v] of Object.entries(d.additionalMembers)) {
      additionalMembers[k] = { required: v.required, schema: v.schema ?? null };
    }
    predicates[p.iri] = {
      status: d.status,
      objectKind: d.objectKind,
      objectSchema: d.objectSchema ?? null,
      taskContextRequired: d.taskContextRequired,
      minimumIssuerScope: d.minimumIssuerScope,
      additionalMembers,
      supersededBy: d.supersededBy
    };
  }
  return {
    $schema: reg.config.acceptListSchemaUrl,
    namespace: reg.config.namespace,
    revision: reg.git.revision,
    commit: reg.git.commit,
    generatedAt: new Date().toISOString(),
    predicates
  };
}

export function buildVocab(reg) {
  return {
    '@context': reg.config.metaContextUrl,
    '@graph': reg.predicates.map((p) => {
      const { '@context': _omit, ...rest } = p.def;
      return rest;
    })
  };
}

export function generateRegistry(reg, { outDir, siteDir = path.join(REPO_ROOT, 'site') } = {}) {
  if (!outDir) throw new Error('outDir is required');
  const { config } = reg;
  const ns = config.namespacePath; // e.g. /dtg/vsc
  const ctx = config.contextPath; // e.g. /dtg/context
  const metaOut = `${config.metaPath}/${config.metaVersion}`;

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  // Site chrome: worker (tokens filled), headers, assets.
  writeFile(outDir, '_worker.js', substitute(fs.readFileSync(path.join(siteDir, '_worker.js'), 'utf8'), config));
  writeFile(outDir, '_headers', substitute(fs.readFileSync(path.join(siteDir, '_headers'), 'utf8'), config));
  for (const f of listFiles(path.join(siteDir, 'assets'))) {
    writeFile(outDir, `assets/${f}`, fs.readFileSync(path.join(siteDir, 'assets', f)));
  }

  // Meta: the definition format, published at its own URLs.
  writeFile(outDir, `${metaOut}/predicate.schema.json`, stableJson(reg.meta.predicateSchema));
  writeFile(outDir, `${metaOut}/predicate-context.jsonld`, stableJson(reg.meta.predicateContext));
  writeFile(outDir, `${metaOut}/accept-list.schema.json`, stableJson(reg.meta.acceptListSchema));

  // Predicates: byte-copies of every frozen file, plus one HTML page per URL.
  // HTML pages are `<path>.html` rather than `<path>/index.html` so the canonical
  // no-trailing-slash URL serves them without a redirect (PLAN §1.7, §2.3).
  for (const p of reg.predicates) {
    const base = `${ns}/${p.name}/${p.version}`;
    writeFile(outDir, `${base}/predicate.jsonld`, stableJson(p.def));
    for (const f of p.schemaFiles) writeFile(outDir, `${base}/${f}`, fs.readFileSync(path.join(p.dir, f)));
    for (const ex of p.examples) writeFile(outDir, `${base}/examples/${ex.file}`, fs.readFileSync(path.join(p.dir, 'examples', ex.file)));
    writeFile(outDir, `${base}.html`, render.predicatePage(reg, p));
  }
  for (const [name, versions] of groupByName(reg.predicates)) {
    writeFile(outDir, `${ns}/${name}.html`, render.versionHistoryPage(reg, name, versions));
  }
  const acceptList = buildAcceptList(reg);
  const acceptListJson = stableJson(acceptList);
  writeFile(outDir, `${ns}/accept-list.json`, acceptListJson);
  writeFile(outDir, `${ns}/accept-list.json.sha256`, sha256(acceptListJson) + '  accept-list.json\n');
  writeFile(outDir, `${ns}/vocab.jsonld`, stableJson(buildVocab(reg)));
  writeFile(outDir, `${ns}.html`, render.namespaceIndexPage(reg));

  // Contexts: byte-copies, frozen.
  for (const c of reg.contexts) {
    writeFile(outDir, `${ctx}/${c.version}.jsonld`, c.raw);
    writeFile(outDir, `${ctx}/${c.version}.html`, render.contextPage(reg, c));
  }
  writeFile(outDir, `${ctx}.html`, render.contextIndexPage(reg));

  writeFile(outDir, 'index.html', render.homePage(reg));
  writeFile(outDir, '404.html', render.notFoundPage(reg)); // load-bearing: see render.notFoundPage

  // Digest manifest, last, over everything else.
  const files = {};
  for (const rel of walk(outDir)) {
    files[rel] = sha256(fs.readFileSync(path.join(outDir, rel)));
  }
  writeFile(outDir, 'release.json', stableJson({
    revision: reg.git.revision,
    commit: reg.git.commit,
    builtAt: acceptList.generatedAt,
    namespace: config.namespace,
    files
  }));
  return { acceptList };
}

export function groupByName(predicates) {
  const m = new Map();
  for (const p of predicates) {
    if (!m.has(p.name)) m.set(p.name, []);
    m.get(p.name).push(p);
  }
  for (const list of m.values()) list.sort((a, b) => Number(a.version) - Number(b.version));
  return m;
}

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function* walk(dir, base = dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full, base);
    else yield path.relative(base, full).split(path.sep).join('/');
  }
}
