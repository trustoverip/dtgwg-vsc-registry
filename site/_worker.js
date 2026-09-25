// Cloudflare Pages advanced-mode worker for the registry.
//
// Every request enters here. Three jobs, in order:
//   1. canonical form: a trailing slash redirects to the form without one, so
//      exactly one string for each term ever appears in a credential;
//   2. content negotiation at the namespace URLs (PLAN §1.7 table): the same
//      URL serves a person the HTML page and a machine the JSON-LD;
//   3. response headers: media type, Vary, CORS, immutable caching for frozen
//      artifacts.
// Everything else is handed to the asset store unchanged, so a missing file is
// an honest 404 and never a shell page.
//
// `{{namespacePath}}` and `{{contextPath}}` are filled from
// registry.config.json when the build copies this file into dist/. Do not edit
// dist/_worker.js. `createHandler` takes the paths as arguments so the tests
// can run the source file directly.

const NAME = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const VERSION = /^[1-9][0-9]*$/;
const CONTEXT_VERSION = /^v[1-9][0-9]*$/;

const HTML = 'text/html';
const LD = 'application/ld+json';
const JSON_ = 'application/json';
const SUPPORTED = [HTML, LD, JSON_];

/**
 * Pick the representation the client prefers among the ones we serve.
 * RFC 9110 §12.5.1: highest q wins; a more specific match beats a wildcard.
 * No header, or nothing we serve, means HTML (Trust Tasks SPEC §6.2 rule).
 */
export function negotiate(acceptHeader) {
  if (!acceptHeader) return HTML;
  let best = null;
  for (const part of acceptHeader.split(',')) {
    const [rawType, ...params] = part.trim().split(';');
    const type = rawType.trim().toLowerCase();
    if (!type) continue;
    let q = 1;
    for (const p of params) {
      const [k, v] = p.trim().split('=');
      if (k === 'q') q = Number(v);
    }
    if (!(q > 0)) continue;
    for (const s of SUPPORTED) {
      const [sMajor] = s.split('/');
      let specificity;
      if (type === s) specificity = 3;
      else if (type === `${sMajor}/*`) specificity = 2;
      else if (type === '*/*') specificity = 1;
      else continue;
      if (!best || q > best.q || (q === best.q && specificity > best.specificity)) best = { type: s, q, specificity };
    }
  }
  return best ? best.type : HTML;
}

function notAcceptable(msg) {
  return new Response(msg + '\n', { status: 406, headers: { 'Content-Type': 'text/plain; charset=utf-8', Vary: 'Accept' } });
}

export function createHandler({ namespacePath = '{{namespacePath}}', contextPath = '{{contextPath}}' } = {}) {
  const ns = namespacePath;
  const ctx = contextPath;
  const frozenRe = new RegExp(`^(${escapeRe(ns)}/[a-z][a-z0-9-]*/[1-9][0-9]*(/|\\.html$|$)|${escapeRe(ctx)}/v[1-9][0-9]*(\\.|$))`);

  return {
    async fetch(request, env) {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method Not Allowed\n', { status: 405, headers: { Allow: 'GET, HEAD' } });
      }
      const url = new URL(request.url);
      const path = url.pathname;

      // 1. Canonical form.
      if (path.length > 1 && path.endsWith('/')) {
        return Response.redirect(url.origin + path.replace(/\/+$/, '') + url.search, 301);
      }

      // 2. Negotiation. `target` is the asset to fetch; `type` the media type to declare.
      const want = negotiate(request.headers.get('accept'));
      let target = path;
      let type = null;

      if (path === ns) {
        if (want === LD) { target = `${ns}/vocab.jsonld`; type = LD; }
        else if (want === JSON_) { target = `${ns}/accept-list.json`; type = JSON_; }
      } else if (path.startsWith(ns + '/')) {
        const seg = path.slice(ns.length + 1).split('/');
        if (seg.length === 1 && NAME.test(seg[0])) {
          // The bare name is documentation, never a term (GOVERNANCE §2.2).
          if (want !== HTML) return notAcceptable(`${url.origin}${path} is not a predicate; a predicate IRI carries a version: ${path}/<n>`);
        } else if (seg.length === 2 && NAME.test(seg[0]) && VERSION.test(seg[1])) {
          if (want === LD) { target = `${path}/predicate.jsonld`; type = LD; }
          else if (want === JSON_) return notAcceptable('A predicate definition is JSON-LD; request Accept: application/ld+json');
        }
      } else if (path.startsWith(ctx + '/')) {
        const seg = path.slice(ctx.length + 1);
        if (CONTEXT_VERSION.test(seg) && want !== HTML) { target = `${path}.jsonld`; type = LD; }
      }

      // 3. Fetch. `redirect: 'manual'` so a redirect from the asset store (which
      // would loop through this worker) surfaces as an error instead.
      const assetReq = new Request(url.origin + target, { method: request.method, headers: request.headers, redirect: 'manual' });
      const res = await env.ASSETS.fetch(assetReq);
      if (res.status >= 300 && res.status < 400) {
        return new Response(`Asset layout error: ${target} redirected (${res.status}). The build must emit <path>.html, not <path>/index.html.\n`, { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
      if (!res.ok) return res;

      const headers = new Headers(res.headers);
      headers.set('Vary', 'Accept');
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('X-Content-Type-Options', 'nosniff');
      const declared = type ?? typeFromPath(target);
      if (declared) headers.set('Content-Type', declared === HTML ? 'text/html; charset=utf-8' : declared);
      headers.set('Cache-Control', frozenRe.test(target) ? 'public, max-age=31536000, immutable' : 'public, max-age=300');
      if (type === null && declared === HTML && path.startsWith(ns + '/')) {
        const seg = path.slice(ns.length + 1).split('/');
        if (seg.length === 2 && NAME.test(seg[0]) && VERSION.test(seg[1])) headers.set('Link', `<${path}/predicate.jsonld>; rel="alternate"; type="application/ld+json"`);
      }
      return new Response(res.body, { status: res.status, headers });
    }
  };
}

function typeFromPath(p) {
  if (p.endsWith('.jsonld')) return LD;
  if (p.endsWith('.json')) return JSON_;
  if (p.endsWith('.sha256')) return 'text/plain; charset=utf-8';
  if (p.endsWith('.css')) return 'text/css; charset=utf-8';
  if (p.endsWith('.html') || !/\.[a-z0-9]+$/i.test(p)) return HTML;
  return null;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

export default createHandler();
