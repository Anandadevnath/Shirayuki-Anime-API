// Build the *public* origin/scheme for URLs this API generates.
//
// On Vercel (and any reverse-proxy deployment) the Node server sees a plain-HTTP
// request on a local socket — so `new URL(c.req.url).protocol` is `http:`, even
// though browsers reach the site over `https:`. Any absolute URL built from that
// becomes a blocked mixed-content link (hls.js `manifestLoadError` / networkError).
//
// Prefer the standard forwarded headers (sent by Vercel / Cloudflare / nginx),
// falling back to what the Node runtime actually observed.

const forwardHeaderList = (value) =>
  String(value || '')
    .split(',')[0]
    .trim();

/**
 * Return the public origin (scheme://host, no trailing slash) for a request.
 */
export const getRequestOrigin = (c) => {
  const reqUrl = new URL(c.req.url);

  const rawProto = forwardHeaderList(c.req.header('x-forwarded-proto'));
  const proto = rawProto || reqUrl.protocol.replace(':', '');

  const rawHost =
    forwardHeaderList(c.req.header('x-forwarded-host')) ||
    forwardHeaderList(c.req.header('host'));
  const host = rawHost || reqUrl.host;

  return `${proto}://${host}`;
};

/**
 * Return the request's full public URL (path + query), re-based onto the
 * forwarded scheme/host if the edge said so.
 */
export const getPublicUrl = (c) => {
  const url = new URL(c.req.url);
  const origin = getRequestOrigin(c);
  return `${origin}${url.pathname}${url.search}`;
};
