import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler, negotiate } from './_worker.js';

const NS = '/dtg/vsc';
const CTX = '/dtg/context';

// A stub of the Pages asset store: a map of paths to bodies, with the one
// piece of Pages behavior the worker relies on, `<path>` serving `<path>.html`.
function assets(files) {
  return {
    async fetch(req) {
      const p = new URL(req.url).pathname;
      const hit = files[p] ?? files[`${p}.html`];
      if (hit === undefined) return new Response('not found', { status: 404 });
      return new Response(hit, { status: 200 });
    }
  };
}

const FILES = {
  '/index.html': '<home>',
  '/dtg/vsc.html': '<index>',
  '/dtg/vsc/vocab.jsonld': '{"@graph":[]}',
  '/dtg/vsc/accept-list.json': '{"predicates":{}}',
  '/dtg/vsc/witnessed.html': '<history>',
  '/dtg/vsc/witnessed/1.html': '<witnessed/1>',
  '/dtg/vsc/witnessed/1/predicate.jsonld': '{"id":"witnessed/1"}',
  '/dtg/vsc/witnessed/1/witness-context.schema.json': '{}',
  '/dtg/context.html': '<contexts>',
  '/dtg/context/v1.html': '<context v1>',
  '/dtg/context/v1.jsonld': '{"@context":{}}',
  '/assets/site.css': 'body{}'
};

const handler = createHandler({ namespacePath: NS, contextPath: CTX });
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

test('trailing slash redirects to the canonical form', async () => {
  const r = await get(`${NS}/witnessed/1/`);
  assert.equal(r.status, 301);
  assert.equal(r.headers.get('location'), `https://registry.example${NS}/witnessed/1`);
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

test('a redirecting asset store is reported, not followed', async () => {
  const loopy = { ASSETS: { async fetch() { return new Response(null, { status: 308, headers: { location: '/x/' } }); } } };
  const r = await handler.fetch(new Request(`https://registry.example${NS}/witnessed/1`), loopy);
  assert.equal(r.status, 500);
});
