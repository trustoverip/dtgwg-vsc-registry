#!/usr/bin/env node
// Registry build.
//
//   npm run validate   node scripts/build-registry.mjs --validate-only
//   npm run build      node scripts/build-registry.mjs            → dist/
//
// Options: --root <dir> (default: repository root), --config <file>
// (default: <root>/registry.config.json), --out <dir> (default: <root>/dist).
// The work is in scripts/lib/registry.mjs; this file is the command line.
import path from 'node:path';
import { loadRegistry, validateRegistry, generateRegistry, REPO_ROOT } from './lib/registry.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};

const root = path.resolve(opt('--root', REPO_ROOT));
const configFile = path.resolve(opt('--config', path.join(root, 'registry.config.json')));
const outDir = path.resolve(opt('--out', path.join(root, 'dist')));
const validateOnly = flag('--validate-only');

let reg;
try {
  reg = loadRegistry({ root, configFile });
} catch (e) {
  console.error(`error: ${e.message}`);
  process.exit(2);
}

const errors = validateRegistry(reg);
const n = reg.predicates.length;
if (errors.length) {
  console.error(`\n${errors.length} problem${errors.length === 1 ? '' : 's'} in ${n} predicate version${n === 1 ? '' : 's'}:\n`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.error('');
  process.exit(1);
}
console.log(`✓ ${n} predicate version${n === 1 ? '' : 's'}, ${reg.contexts.length} context${reg.contexts.length === 1 ? '' : 's'} valid (${reg.config.namespace})`);

if (!validateOnly) {
  const { acceptList } = generateRegistry(reg, { outDir });
  console.log(`✓ generated ${path.relative(process.cwd(), outDir) || '.'} (revision ${acceptList.revision}, ${Object.keys(acceptList.predicates).length} accept-list entries)`);
}
