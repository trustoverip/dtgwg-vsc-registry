#!/usr/bin/env node
// Scaffold a predicate version folder:  npm run new-predicate -- <name> [<n>]
// Writes predicates/<name>/<n>/{predicate.jsonld, profile.md, examples/example.json}
// with every required member present and marked TODO, so the validator's
// first run lists exactly what is left to write.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, NAME_RE, VERSION_RE } from './lib/config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [name, versionArg = '1'] = process.argv.slice(2);
if (!name || !NAME_RE.test(name)) {
  console.error('usage: npm run new-predicate -- <name> [<n>]   (name: lowercase, hyphenated, e.g. presented)');
  process.exit(2);
}
if (!VERSION_RE.test(versionArg)) {
  console.error(`version "${versionArg}" must be a positive integer`);
  process.exit(2);
}
const config = loadConfig(path.join(ROOT, 'registry.config.json'));
const n = Number(versionArg);
const dir = path.join(ROOT, 'predicates', name, versionArg);
if (fs.existsSync(dir)) {
  console.error(`${path.relative(ROOT, dir)} already exists`);
  process.exit(1);
}
const iri = `${config.namespace}${name}/${n}`;

const def = {
  '@context': config.metaContextUrl,
  id: iri,
  type: 'Predicate',
  name,
  version: n,
  status: 'draft',
  label: { en: name.replace(/-/g, ' ') },
  definition: { en: 'TODO: what the statement means, in one sentence (the issuer ... the subject ...).' },
  classification: 'evidence',
  weighedBy: 'TODO: who is expected to weigh this statement.',
  objectKind: ['id'],
  subjectObjectRelationship: null,
  additionalMembers: {},
  taskContextRequired: false,
  minimumIssuerScope: null,
  issuer: 'TODO: who may issue the statement.',
  establishes: 'TODO: what a successful verification establishes.',
  doesNotEstablish: ['TODO: what it explicitly does not establish.'],
  definedIn: null,
  governedBy: config.governedBy,
  supersedes: n > 1 ? `${config.namespace}${name}/${n - 1}` : null,
  supersededBy: null
};

fs.mkdirSync(path.join(dir, 'examples'), { recursive: true });
fs.writeFileSync(path.join(dir, 'predicate.jsonld'), JSON.stringify(def, null, 2) + '\n');
fs.writeFileSync(path.join(dir, 'profile.md'), `## Why its own predicate\n\nTODO: what this predicate says that no existing term says, and why a verifier reading it learns which question was answered.\n\n## Notes\n\nTODO, or delete this section.\n`);
fs.writeFileSync(path.join(dir, 'examples', 'example.json'), JSON.stringify({
  '@context': ['https://www.w3.org/ns/credentials/v2', `${config.contextBase}v1`],
  type: ['VerifiableCredential', 'DTGCredential', 'StatementCredential'],
  issuer: 'did:example:issuer',
  validFrom: new Date().toISOString().slice(0, 10) + 'T00:00:00Z',
  credentialSubject: { id: 'did:example:subject', predicate: iri, object: { id: 'did:example:object' } },
  proof: { '//': '...' }
}, null, 2) + '\n');
console.log(`created ${path.relative(ROOT, dir)}/ for ${iri}\nnext: fill the TODOs, then \`docker compose run --rm validate\``);
