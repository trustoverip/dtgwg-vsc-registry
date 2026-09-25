// HTML rendering for the published site. Plain server-side templates: no
// framework, no client-side routing, every page complete as served, so the
// registry reads with curl and archives cleanly.
import { marked } from 'marked';
import { groupByName } from './registry.mjs';

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function layout(reg, { title, body, alternates = [], crumbs = [] }) {
  const { config } = reg;
  const alt = alternates.map((a) => `<link rel="alternate" type="${esc(a.type)}" href="${esc(a.href)}">`).join('\n    ');
  const nav = [
    { href: '/', text: config.siteName },
    { href: config.namespacePath, text: 'Predicates' },
    { href: config.contextPath, text: 'Contexts' },
    { href: `${config.metaPath}/${config.metaVersion}/predicate.schema.json`, text: 'Definition format' }
  ];
  const crumbHtml = crumbs.length ? `<nav class="crumbs" aria-label="Breadcrumb">${crumbs.map((c) => (c.href ? `<a href="${esc(c.href)}">${esc(c.text)}</a>` : `<span>${esc(c.text)}</span>`)).join(' <span class="sep">/</span> ')}</nav>` : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${esc(title)} · ${esc(config.siteName)}</title>
    <link rel="stylesheet" href="/assets/site.css">
    ${alt}
</head>
<body>
<header class="site">
    <nav aria-label="Site">${nav.map((n) => `<a href="${esc(n.href)}">${esc(n.text)}</a>`).join('')}</nav>
</header>
<main>
${crumbHtml}
${body}
</main>
<footer class="site">
    <p>${esc(config.maintainer)}. Source and issues: <a href="${esc(config.repository)}">${esc(config.repository)}</a>. Revision <code>${esc(reg.git.revision)}</code> (<code>${esc(reg.git.commit.slice(0, 7))}</code>).</p>
</footer>
</body>
</html>
`;
}

function statusBadge(status) {
  return `<span class="status status-${esc(status)}">${esc(status)}</span>`;
}

function langTable(map) {
  return `<table class="lang"><tbody>${Object.entries(map).map(([lang, text]) => `<tr><th lang="${esc(lang)}">${esc(lang)}</th><td lang="${esc(lang)}">${esc(text)}</td></tr>`).join('')}</tbody></table>`;
}

function link(url) {
  return url ? `<a href="${esc(url)}"><code>${esc(url)}</code></a>` : '<em>none</em>';
}

export function homePage(reg) {
  const { config } = reg;
  const body = `
<h1>${esc(config.siteName)}</h1>
<p>Predicates for the Verifiable Statement Credential (VSC) of the <a href="https://github.com/trustoverip/dtgwg-cred-spec">DTG Credentials Core Specification</a>. A predicate is an absolute IRI that a verifier accepts by configuration; every predicate here resolves to its definition at that IRI.</p>
<dl class="resources">
  <dt><a href="${esc(config.namespacePath)}">${esc(config.namespace)}</a></dt>
  <dd>The predicate namespace: ${reg.predicates.length} published term${reg.predicates.length === 1 ? '' : 's'}. Machine-readable at the same URL: <code>Accept: application/ld+json</code> for the vocabulary graph, <code>Accept: application/json</code> for the <a href="${esc(config.namespacePath)}/accept-list.json">accept-list</a> verifiers import.</dd>
  <dt><a href="${esc(config.contextPath)}">${esc(config.contextBase)}</a></dt>
  <dd>Frozen JSON-LD contexts for credentials, one per version.</dd>
  <dt><a href="${esc(config.metaPath)}/${esc(config.metaVersion)}/predicate.schema.json">${esc(config.metaBase)}${esc(config.metaVersion)}/</a></dt>
  <dd>The definition format: the JSON Schema every predicate definition validates against, its JSON-LD context, and the accept-list schema.</dd>
</dl>
<p>Rules for admission, versioning and review are in <a href="${esc(config.repository)}/blob/main/GOVERNANCE.md">GOVERNANCE.md</a>. Released archives with digests and provenance are on the <a href="${esc(config.repository)}/releases">releases page</a>.</p>
`;
  return layout(reg, { title: 'Home', body });
}

export function namespaceIndexPage(reg) {
  const { config } = reg;
  const groups = [...groupByName(reg.predicates)];
  const rows = groups.flatMap(([name, versions]) => versions.map((p) => `<tr>
  <td><a href="${esc(config.namespacePath)}/${esc(name)}/${esc(p.version)}"><code>${esc(name)}/${esc(p.version)}</code></a></td>
  <td>${esc(p.def.label.en)}</td>
  <td>${statusBadge(p.def.status)}</td>
  <td>${esc(p.def.classification)}</td>
  <td>${p.def.objectKind.map((k) => `<code>${esc(k)}</code>`).join(' ')}</td>
  <td>${p.def.taskContextRequired ? 'required' : 'optional'}</td>
</tr>`));
  const body = `
<h1>Predicates</h1>
<p>Namespace <code>${esc(config.namespace)}</code>. Each row is one immutable term; a predicate IRI is <code>${esc(config.namespace)}&lt;name&gt;/&lt;n&gt;</code>, compared byte-exact. The bare <code>&lt;name&gt;</code> path is a documentation page, never a predicate.</p>
<p>Machine-readable: <a href="${esc(config.namespacePath)}/vocab.jsonld"><code>vocab.jsonld</code></a> (the whole graph) and <a href="${esc(config.namespacePath)}/accept-list.json"><code>accept-list.json</code></a> (for verifier configuration; <a href="${esc(config.namespacePath)}/accept-list.json.sha256">sha256</a>), also served at this URL under content negotiation.</p>
${rows.length ? `<table class="index"><thead><tr><th>Term</th><th>Label</th><th>Status</th><th>Kind</th><th>Object</th><th>taskContext</th></tr></thead><tbody>${rows.join('')}</tbody></table>` : '<p><em>No predicates are published yet.</em></p>'}
`;
  return layout(reg, {
    title: 'Predicates',
    body,
    crumbs: [{ href: '/', text: 'Home' }, { text: 'Predicates' }],
    alternates: [
      { type: 'application/ld+json', href: `${config.namespacePath}/vocab.jsonld` },
      { type: 'application/json', href: `${config.namespacePath}/accept-list.json` }
    ]
  });
}

export function versionHistoryPage(reg, name, versions) {
  const { config } = reg;
  const rows = versions.map((p) => `<tr>
  <td><a href="${esc(config.namespacePath)}/${esc(name)}/${esc(p.version)}"><code>${esc(p.iri)}</code></a></td>
  <td>${statusBadge(p.def.status)}</td>
  <td>${esc(p.def.since ?? '')}</td>
  <td>${esc(p.def.deprecatedOn ?? '')}</td>
  <td>${p.def.supersededBy ? link(p.def.supersededBy) : ''}</td>
</tr>`);
  const body = `
<h1><code>${esc(name)}</code></h1>
<p class="notice">This page is the version history of <code>${esc(name)}</code>. <strong><code>${esc(config.namespace)}${esc(name)}</code> is not a predicate</strong> and must not appear in a credential; each version below is its own immutable term, and there is no compatibility between versions.</p>
<table class="index"><thead><tr><th>Term</th><th>Status</th><th>Since</th><th>Deprecated</th><th>Superseded by</th></tr></thead><tbody>${rows.join('')}</tbody></table>
`;
  return layout(reg, { title: name, body, crumbs: [{ href: '/', text: 'Home' }, { href: config.namespacePath, text: 'Predicates' }, { text: name }] });
}

export function predicatePage(reg, p) {
  const { config } = reg;
  const d = p.def;
  const base = `${config.namespacePath}/${p.name}/${p.version}`;
  const members = Object.entries(d.additionalMembers);
  const examples = p.examples.map((ex) => `<h3><code>examples/${esc(ex.file)}</code></h3><pre><code>${esc(JSON.stringify(ex.doc, null, 2))}</code></pre>`).join('\n');
  const lifecycle = [
    d.since ? `Since ${esc(d.since)}.` : '',
    d.deprecatedOn ? `Deprecated on ${esc(d.deprecatedOn)}.` : '',
    d.supersedes ? `Supersedes ${link(d.supersedes)}.` : '',
    d.supersededBy ? `Superseded by ${link(d.supersededBy)}.` : '',
    d.convergenceRecord ? `Convergence record: ${link(d.convergenceRecord)}.` : ''
  ].filter(Boolean).join(' ');
  const body = `
<h1><code>${esc(p.name)}/${esc(p.version)}</code> ${statusBadge(d.status)}</h1>
<p class="iri">Predicate IRI, exact bytes: <code id="iri">${esc(p.iri)}</code></p>
<p>Machine-readable: <a href="${esc(base)}/predicate.jsonld"><code>predicate.jsonld</code></a>, also served at this URL with <code>Accept: application/ld+json</code>. Definition format: <a href="${esc(config.metaSchemaUrl)}"><code>predicate.schema.json</code></a>.</p>
${lifecycle ? `<p class="lifecycle">${lifecycle}</p>` : ''}

<h2>Definition</h2>
<table class="def"><tbody>
<tr><th>Label</th><td>${langTable(d.label)}</td></tr>
<tr><th>Meaning</th><td>${langTable(d.definition)}</td></tr>
<tr><th>Classification</th><td>${esc(d.classification)}${d.weighedBy ? `; weighed by: ${esc(d.weighedBy)}` : ''}</td></tr>
<tr><th>Object</th><td>${d.objectKind.map((k) => `<code>${esc(k)}</code>`).join(', ')}${d.objectSchema ? `; schema ${link(d.objectSchema)}` : ''}${d.objectSchemaDelegated ? '; the shape of <code>value</code> is defined by the governing community' : ''}</td></tr>
<tr><th>Subject–object relationship</th><td>${d.subjectObjectRelationship ? esc(d.subjectObjectRelationship) : '<em>none required</em>'}</td></tr>
<tr><th>Additional members</th><td>${members.length ? `<ul>${members.map(([k, v]) => `<li><code>${esc(k)}</code> (${v.required ? 'REQUIRED' : 'OPTIONAL'})${v.description ? `: ${esc(v.description)}` : ''}${v.schema ? `; schema ${link(v.schema)}` : ''}</li>`).join('')}</ul>` : '<em>none</em>'}</td></tr>
<tr><th><code>taskContext</code></th><td>${d.taskContextRequired ? 'REQUIRED, with <code>taskDigestMultibase</code>' : 'OPTIONAL'}</td></tr>
<tr><th>Minimum issuer scope</th><td>${d.minimumIssuerScope ? `<code>${esc(d.minimumIssuerScope)}</code>` : '<em>unconstrained</em>'}</td></tr>
<tr><th>Issuer</th><td>${esc(d.issuer)}</td></tr>
<tr><th>Verification establishes</th><td>${esc(d.establishes)}</td></tr>
<tr><th>Verification does not establish</th><td><ul>${d.doesNotEstablish.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></td></tr>
<tr><th>Defined in</th><td>${link(d.definedIn)}</td></tr>
<tr><th>Governed by</th><td>${d.governedBy ? link(d.governedBy) : '<em>the working group that maintains this registry</em>'}</td></tr>
${d.seeAlso?.length ? `<tr><th>See also (informative)</th><td>${d.seeAlso.map(link).join('<br>')}</td></tr>` : ''}
</tbody></table>
<p class="bound">The type-level bound of the specification's <em>What Verification Establishes</em> applies in full: a statement attests; it never confers representation, authority, membership, admission, governed status or task completion.</p>

${p.profileMd ? `<h2>Profile</h2>\n<div class="profile">${marked.parse(p.profileMd)}</div>` : ''}
${examples ? `<h2>Examples</h2>\n${examples}` : ''}
<p class="updated">Last changed ${esc(p.updated)}.</p>
`;
  return layout(reg, {
    title: `${p.name}/${p.version}`,
    body,
    crumbs: [{ href: '/', text: 'Home' }, { href: config.namespacePath, text: 'Predicates' }, { href: `${config.namespacePath}/${p.name}`, text: p.name }, { text: p.version }],
    alternates: [{ type: 'application/ld+json', href: `${base}/predicate.jsonld` }]
  });
}

export function contextIndexPage(reg) {
  const { config } = reg;
  const rows = reg.contexts.map((c) => `<tr><td><a href="${esc(config.contextPath)}/${esc(c.version)}"><code>${esc(config.contextBase)}${esc(c.version)}</code></a></td><td>${esc(c.updated)}</td></tr>`);
  const body = `
<h1>Contexts</h1>
<p>JSON-LD contexts that credentials list. A published context never changes; additions are made under a new version IRI. Each is served at its IRI with <code>Accept: application/ld+json</code> and at <code>&lt;IRI&gt;.jsonld</code>.</p>
${rows.length ? `<table class="index"><thead><tr><th>Context</th><th>Published</th></tr></thead><tbody>${rows.join('')}</tbody></table>` : '<p><em>No contexts are published yet.</em></p>'}
`;
  return layout(reg, { title: 'Contexts', body, crumbs: [{ href: '/', text: 'Home' }, { text: 'Contexts' }] });
}

export function contextPage(reg, c) {
  const { config } = reg;
  const iri = `${config.contextBase}${c.version}`;
  const body = `
<h1>Context <code>${esc(c.version)}</code></h1>
<p class="iri">Context IRI, exact bytes: <code>${esc(iri)}</code></p>
<p>Frozen: this document will not change. Implementations are encouraged to bundle a copy; the released archives carry it with a digest.</p>
<pre><code>${esc(c.raw)}</code></pre>
`;
  return layout(reg, {
    title: `Context ${c.version}`,
    body,
    crumbs: [{ href: '/', text: 'Home' }, { href: config.contextPath, text: 'Contexts' }, { text: c.version }],
    alternates: [{ type: 'application/ld+json', href: `${config.contextPath}/${c.version}.jsonld` }]
  });
}

/**
 * The not-found page. Its presence at dist/404.html is load-bearing: without
 * it, Cloudflare Pages answers an unknown path with index.html and a 200 (the
 * single-page-app fallback), and a mistyped predicate IRI would resolve to a
 * page instead of failing. With it, Pages serves this page with a 404.
 */
export function notFoundPage(reg) {
  const { config } = reg;
  const body = `
<h1>Not found</h1>
<p>There is nothing at this URL. A predicate IRI has the form <code>${esc(config.namespace)}&lt;name&gt;/&lt;n&gt;</code>; the published terms are listed at <a href="${esc(config.namespacePath)}">${esc(config.namespacePath)}</a>.</p>
<p>If you followed a predicate IRI from a credential and arrived here, the term is not published by this registry. A verifier configured against this registry rejects such a credential, as the specification's <em>Predicate Handling</em> requires.</p>
`;
  return layout(reg, { title: 'Not found', body });
}
