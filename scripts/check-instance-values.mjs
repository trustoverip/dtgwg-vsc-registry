#!/usr/bin/env node
// The "two files" guarantee (README, "Running your own registry"): the only
// places an instance-specific value is written are registry.config.json and
// wrangler.toml. Everything under the tooling paths must get the namespace,
// host and site name from the config, so a fork changes one file.
//
// Scans the tooling paths for the configured host and site name. Registry
// content (predicates/, contexts/) and documentation legitimately carry the
// namespace and are not scanned.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './lib/config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = loadConfig(path.join(ROOT, 'registry.config.json'));

const SCAN = ['scripts', 'site', 'meta', 'infra', '.github/workflows', 'package.json', 'Dockerfile', 'compose.yaml'];
const SKIP = new Set(['scripts/test/fixtures']); // fixtures carry their own example instance
const NEEDLES = [config.host, config.siteName].filter(Boolean);

const hits = [];
for (const rel of SCAN) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) continue;
  for (const file of fs.statSync(full).isDirectory() ? walk(full) : [full]) {
    const r = path.relative(ROOT, file).split(path.sep).join('/');
    if ([...SKIP].some((s) => r.startsWith(s + '/'))) continue;
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const n of NEEDLES) if (line.includes(n)) hits.push(`${r}:${i + 1}: contains "${n}"`);
    });
  }
}

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.name === 'node_modules') continue;
    if (e.isDirectory()) yield* walk(full);
    else yield full;
  }
}

if (hits.length) {
  console.error('\ninstance-specific values outside registry.config.json / wrangler.toml:\n');
  for (const h of hits) console.error(`  ✗ ${h}`);
  console.error('\nRead them from registry.config.json (scripts/lib/config.mjs) or use a {{token}} the build substitutes.\n');
  process.exit(1);
}
console.log(`✓ no instance-specific value outside registry.config.json (checked ${NEEDLES.map((n) => JSON.stringify(n)).join(', ')})`);
