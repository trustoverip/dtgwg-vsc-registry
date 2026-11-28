import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler, negotiate } from './_worker.js';

const NS = '/dtg/vsc';
const CTX = '/dtg/context';
const PUR = '/dtg/purpose';

// A stub of the Pages asset store: a map of paths to bodies, with the two
// pieces of Pages behavior the worker relies on: `<path>` serving
// `<path>.html`, and an ETag per asset that a matching If-None-Match turns
// into a bodiless 304.
function assets(files) {
  return {
    async fetch(req) {
      const p = new URL(req.url).pathname;
      const hit = p === '/' ? files['/index.html'] : files[p] ?? files[`${p}.html`];
      if (hit === undefined) return new Response('not found', { status: 404 });
      const etag = `"${hit.length}-${hit.charCodeAt(0)}"`;
      if (req.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers: { etag } });
      return new Response(hit, { status: 200, headers: { etag } });
    }
  };
}

const FILES = {
  '/index.html': '<landing>',
  '/dtg.html': '<registry home>',
  '/dtg/vsc.html': '<index>',
  '/dtg/vsc/vocab.jsonld': '{"@graph":[]}',
  '/dtg/vsc/accept-list.json': '{"predicates":{}}',
  '/dtg/vsc/witnessed.html': '<history>',
  '/dtg/vsc/witnessed/1.html': '<witnessed/1>',
  '/dtg/vsc/witnessed/1/predicate.jsonld': '{"id":"witnessed/1"}',
  '/dtg/vsc/witnessed/1/witness-context.schema.json': '{}',
  '/dtg/purpose.html': '<purposes>',
  '/dtg/purpose/vocab.jsonld': '{"@graph":["purposes"]}',
  '/dtg/purpose/purposes.json': '{"purposes":{}}',
  '/dtg/purpose/task-execution.html': '<purpose history>',
  '/dtg/purpose/task-execution/1.html': '<task-execution/1>',
  '/dtg/purpose/task-execution/1/purpose.jsonld': '{"id":"task-execution/1"}',
  '/dtg/purpose/task-execution/1/examples/hcp-grant-access.json': '{}',
  '/dtg/context.html': '<contexts>',
  '/dtg/context/v1.html': '<context v1>',
  '/dtg/context/v1.jsonld': '{"@context":{}}',
  '/assets/site.css': 'body{}'
};

const handler = createHandler({ namespacePath: NS, purposeNamespacePath: PUR, contextPath: CTX });
const env = { ASSETS: assets(FILES) };
const get = (path, accept) => handler.fetch(new Request(`https://registry.example${path}`, { headers: accept ? { accept } : {} }), env);

test('negotiate picks the best supported type', () => {
  assert.equal(negotiate(null), 'text/html');
  assert.equal(negotiate('*/*'), 'text/html');
  assert.equal(negotiate('text/html'), 'text/html');
  assert.equal(negotiate('application/ld+json'), 'application/ld+json');
  assert.equal(negotiate('application/json'), 'application/json');
  assert.equal(negotiate('application/ld+json, application/json;q=0.9'), 'application/ld+json');
  assert.equal(negotiate('application/json;q=0.9, application/ld+json;q=0.8'), 'application/json');
  assert.equal(negotiate('text/html;q=0.5, application/ld+json'), 'application/ld+json');
  assert.equal(negotiate('image/png'), 'text/html');
  assert.equal(negotiate('application/*'), 'application/ld+json');
});

test('namespace URL: html, vocab, accept-list', async () => {
  let r = await get(NS);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), '<index>');
  assert.match(r.headers.get('content-type'), /^text\/html/);
  assert.equal(r.headers.get('vary'), 'Accept');
  r = await get(NS, 'application/ld+json');
  assert.equal(await r.text(), '{"@graph":[]}');
  assert.equal(r.headers.get('content-type'), 'application/ld+json');
  r = await get(NS, 'application/json');
  assert.equal(await r.text(), '{"predicates":{}}');
  assert.equal(r.headers.get('content-type'), 'application/json');
  assert.equal(r.headers.get('cache-control'), 'public, max-age=300');
});

test('bare predicate name: html only, 406 for machines', async () => {
  let r = await get(`${NS}/witnessed`);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), '<history>');
  r = await get(`${NS}/witnessed`, 'application/ld+json');
  assert.equal(r.status, 406);
  r = await get(`${NS}/witnessed`, 'application/json');
  assert.equal(r.status, 406);
});

test('predicate IRI: html page, definition under ld+json, 406 for plain json', async () => {
  let r = await get(`${NS}/witnessed/1`);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), '<witnessed/1>');
  assert.equal(r.headers.get('link'), `<${NS}/witnessed/1/predicate.jsonld>; rel="alternate"; type="application/ld+json"`);
  assert.equal(r.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  r = await get(`${NS}/witnessed/1`, 'application/ld+json');
  assert.equal(r.status, 200);
  assert.equal(await r.text(), '{"id":"witnessed/1"}');
  assert.equal(r.headers.get('content-type'), 'application/ld+json');
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
  r = await get(`${NS}/witnessed/1`, 'application/json');
  assert.equal(r.status, 406);
});

test('explicit file paths pass through with their own media type', async () => {
  let r = await get(`${NS}/witnessed/1/predicate.jsonld`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/ld+json');
  assert.equal(r.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  r = await get(`${NS}/witnessed/1/witness-context.schema.json`, 'application/ld+json');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/json');
  r = await get('/assets/site.css');
  assert.equal(r.headers.get('content-type'), 'text/css; charset=utf-8');
});

test('context IRI: html page, document under ld+json or json', async () => {
  let r = await get(`${CTX}/v1`);
  assert.equal(await r.text(), '<context v1>');
  r = await get(`${CTX}/v1`, 'application/ld+json');
  assert.equal(await r.text(), '{"@context":{}}');
  assert.equal(r.headers.get('content-type'), 'application/ld+json');
  assert.equal(r.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  r = await get(`${CTX}/v1`, 'application/json');
  assert.equal(await r.text(), '{"@context":{}}');
  r = await get(CTX);
  assert.equal(await r.text(), '<contexts>');
});

test('the host root and the registry home are plain pages outside the negotiated prefixes', async () => {
  let r = await get('/');
  assert.equal(r.status, 200);
  assert.equal(await r.text(), '<landing>');
  assert.match(r.headers.get('content-type'), /^text\/html/);
  r = await get('/dtg');
  assert.equal(r.status, 200);
  assert.equal(await r.text(), '<registry home>');
  assert.match(r.headers.get('content-type'), /^text\/html/);
  assert.equal(r.headers.get('cache-control'), 'public, max-age=300');
  r = await get('/dtg', 'application/ld+json'); // no negotiation at the home: the page, whatever is asked for
  assert.equal(await r.text(), '<registry home>');
  r = await get('/dtg/');
  assert.equal(r.status, 301);
  assert.equal(r.headers.get('location'), 'https://registry.example/dtg');
});

test('trailing slash redirects to the canonical form', async () => {
  const r = await get(`${NS}/witnessed/1/`);
  assert.equal(r.status, 301);
  assert.equal(r.headers.get('location'), `https://registry.example${NS}/witnessed/1`);
});

test('the explicit .html form redirects to the extensionless path', async () => {
  let r = await get(`${NS}/witnessed/1.html`);
  assert.equal(r.status, 301);
  assert.equal(r.headers.get('location'), `https://registry.example${NS}/witnessed/1`);
  r = await get('/index.html');
  assert.equal(r.status, 301);
  assert.equal(r.headers.get('location'), 'https://registry.example/');
});

test('unknown paths are honest 404s, never a page', async () => {
  assert.equal((await get(`${NS}/does-not-exist/1`)).status, 404);
  assert.equal((await get(`${NS}/does-not-exist/1`, 'application/ld+json')).status, 404);
  assert.equal((await get(`${NS}/witnessed/2`)).status, 404);
  assert.equal((await get('/nothing/here')).status, 404);
});

test('only GET and HEAD', async () => {
  const r = await handler.fetch(new Request(`https://registry.example${NS}`, { method: 'POST' }), env);
  assert.equal(r.status, 405);
});

test('a cache revalidation gets 304 with the same headers as a 200, never an error', async () => {
  // A browser refresh resends the stylesheet request with If-None-Match. The
  // asset store answers 304, which must not be mistaken for a redirect.
  const fresh = await get('/assets/site.css');
  const etag = fresh.headers.get('etag');
  assert.ok(etag);
  let r = await handler.fetch(new Request('https://registry.example/assets/site.css', { headers: { 'if-none-match': etag } }), env);
  assert.equal(r.status, 304);
  assert.equal(await r.text(), '');
  assert.equal(r.headers.get('etag'), etag);
  assert.equal(r.headers.get('content-type'), 'text/css; charset=utf-8');
  assert.equal(r.headers.get('cache-control'), 'public, max-age=300');
  assert.equal(r.headers.get('vary'), 'Accept');
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
  // The same through negotiation: the 304 carries the negotiated asset's headers.
  const ld = await get(`${NS}/witnessed/1`, 'application/ld+json');
  r = await handler.fetch(new Request(`https://registry.example${NS}/witnessed/1`, { headers: { accept: 'application/ld+json', 'if-none-match': ld.headers.get('etag') } }), env);
  assert.equal(r.status, 304);
  assert.equal(r.headers.get('content-type'), 'application/ld+json');
  assert.equal(r.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  // A stale validator still gets the full asset.
  r = await handler.fetch(new Request('https://registry.example/assets/site.css', { headers: { 'if-none-match': '"stale"' } }), env);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), 'body{}');
});

test('a redirecting asset store is reported, not followed', async () => {
  const loopy = { ASSETS: { async fetch() { return new Response(null, { status: 308, headers: { location: '/x/' } }); } } };
  const r = await handler.fetch(new Request(`https://registry.example${NS}/witnessed/1`), loopy);
  assert.equal(r.status, 500);
});

test('purpose namespace URL: html, vocab, purpose list', async () => {
  let r = await get(PUR);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), '<purposes>');
  assert.match(r.headers.get('content-type'), /^text\/html/);
  assert.equal(r.headers.get('vary'), 'Accept');
  r = await get(PUR, 'application/ld+json');
  assert.equal(await r.text(), '{"@graph":["purposes"]}');
  assert.equal(r.headers.get('content-type'), 'application/ld+json');
  r = await get(PUR, 'application/json');
  assert.equal(await r.text(), '{"purposes":{}}');
  assert.equal(r.headers.get('content-type'), 'application/json');
  assert.equal(r.headers.get('cache-control'), 'public, max-age=300');
});

test('bare purpose name: html only, 406 for machines', async () => {
  let r = await get(`${PUR}/task-execution`);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), '<purpose history>');
  r = await get(`${PUR}/task-execution`, 'application/ld+json');
  assert.equal(r.status, 406);
  assert.match(await r.text(), /is not a purpose; a purpose IRI carries a version/);
  r = await get(`${PUR}/task-execution`, 'application/json');
  assert.equal(r.status, 406);
});

test('purpose IRI: html page, definition under ld+json, 406 for plain json', async () => {
  let r = await get(`${PUR}/task-execution/1`);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), '<task-execution/1>');
  assert.equal(r.headers.get('link'), `<${PUR}/task-execution/1/purpose.jsonld>; rel="alternate"; type="application/ld+json"`);
  assert.equal(r.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  r = await get(`${PUR}/task-execution/1`, 'application/ld+json');
  assert.equal(r.status, 200);
  assert.equal(await r.text(), '{"id":"task-execution/1"}');
  assert.equal(r.headers.get('content-type'), 'application/ld+json');
  r = await get(`${PUR}/task-execution/1`, 'application/json');
  assert.equal(r.status, 406);
  assert.match(await r.text(), /A purpose definition is JSON-LD/);
  r = await get(`${PUR}/task-execution/1/examples/hcp-grant-access.json`);
  assert.equal(r.headers.get('content-type'), 'application/json');
  assert.equal(r.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  r = await get(`${PUR}/task-execution/1/`);
  assert.equal(r.status, 301);
  assert.equal(r.headers.get('location'), `https://registry.example${PUR}/task-execution/1`);
  assert.equal((await get(`${PUR}/does-not-exist/1`, 'application/ld+json')).status, 404);
});

test('a handler with no purpose namespace negotiates nothing under it', async () => {
  const bare = createHandler({ namespacePath: NS, purposeNamespacePath: '', contextPath: CTX });
  const r = await bare.fetch(new Request(`https://registry.example${PUR}/task-execution`, { headers: { accept: 'application/ld+json' } }), env);
  assert.equal(r.status, 200); // a plain page, not a 406: the path is not a vocabulary here
  assert.equal(r.headers.get('link'), null);
  const p = await bare.fetch(new Request(`https://registry.example${NS}/witnessed/1`, { headers: { accept: 'application/ld+json' } }), env);
  assert.equal(await p.text(), '{"id":"witnessed/1"}');
});
