// Registry instance configuration.
//
// registry.config.json is the one place this registry is named. Everything
// that needs an IRI prefix, a host or a site label reads it from here, and
// source files that must carry one (the meta-schema, the worker, templates)
// use `{{token}}` placeholders that `substitute()` fills at build time. That
// is what lets a community fork the repository, change one file, and run its
// own registry (README, "Running your own registry"); check-instance-values
// verifies that nothing else in the tooling hardcodes a value.
import fs from 'node:fs';

const REQUIRED_STRINGS = ['namespace', 'contextBase', 'metaBase', 'siteUrl', 'siteName', 'maintainer', 'repository'];
const HTTPS_PREFIXES = ['namespace', 'contextBase', 'metaBase', 'siteUrl'];

export const META_VERSION = 'v1';

function stripTrailingSlash(p) {
  return p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p;
}

export function loadConfig(file) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`cannot read registry config ${file}: ${e.message}`);
  }
  return parseConfig(raw, file);
}

export function parseConfig(raw, where = 'registry.config.json') {
  for (const k of REQUIRED_STRINGS) {
    if (typeof raw[k] !== 'string' || raw[k].length === 0) {
      throw new Error(`${where}: "${k}" is required and must be a non-empty string`);
    }
  }
  if (!('governedBy' in raw) || (raw.governedBy !== null && typeof raw.governedBy !== 'string')) {
    throw new Error(`${where}: "governedBy" is required (null for a working-group registry, a URL for a community one)`);
  }
  let origin = null;
  for (const k of HTTPS_PREFIXES) {
    let u;
    try {
      u = new URL(raw[k]);
    } catch {
      throw new Error(`${where}: "${k}" is not a URL`);
    }
    if (u.protocol !== 'https:') throw new Error(`${where}: "${k}" must be https`);
    if (u.search || u.hash) throw new Error(`${where}: "${k}" must carry no query or fragment`);
    if (!raw[k].endsWith('/')) throw new Error(`${where}: "${k}" must end with "/" (it is a prefix)`);
    if (u.hostname.startsWith('www.')) throw new Error(`${where}: "${k}" must not use a www. host; identifiers are compared byte-exact`);
    if (origin === null) origin = u.origin;
    else if (u.origin !== origin) throw new Error(`${where}: "${k}" must share the origin ${origin}; one registry is one site`);
  }
  const ns = new URL(raw.namespace);
  return Object.freeze({
    ...raw,
    metaVersion: META_VERSION,
    origin,
    host: ns.host,
    namespacePath: stripTrailingSlash(ns.pathname),
    contextPath: stripTrailingSlash(new URL(raw.contextBase).pathname),
    metaPath: stripTrailingSlash(new URL(raw.metaBase).pathname),
    metaContextUrl: `${raw.metaBase}${META_VERSION}/predicate-context.jsonld`,
    metaSchemaUrl: `${raw.metaBase}${META_VERSION}/predicate.schema.json`,
    acceptListSchemaUrl: `${raw.metaBase}${META_VERSION}/accept-list.schema.json`
  });
}

/** Replace every `{{token}}` with the config value of that name. Unknown tokens are an error. */
export function substitute(text, cfg) {
  return text.replace(/\{\{([A-Za-z]+)\}\}/g, (m, key) => {
    const v = cfg[key];
    if (typeof v !== 'string') throw new Error(`unknown template token {{${key}}}`);
    return v;
  });
}

/** The slug and version grammars of GOVERNANCE.md §2.1, shared by every script. */
export const NAME_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
export const VERSION_RE = /^[1-9][0-9]*$/;
