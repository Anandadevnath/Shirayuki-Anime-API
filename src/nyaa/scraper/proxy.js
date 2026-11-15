import env from '../../config/env.js';

export const NYAA_PROXY_PATH = '/api/v2/nyaa/proxy';
const UPSTREAM_TIMEOUT_MS = 60000; // worker holds index.m3u8 up to STREAM_READY_TIMEOUT_MS (50s)

export const buildProxyUrl = (apiOrigin, url) => `${apiOrigin}${NYAA_PROXY_PATH}?url=${encodeURIComponent(url)}`;

/** Point every segment line of a worker playlist back through this API's proxy. */
export const rewritePlaylist = (text, playlistUrl, apiOrigin) =>
  text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return line;
      return buildProxyUrl(apiOrigin, new URL(trimmed, playlistUrl).href);
    })
    .join('\n');

/** Only the stream worker's /stream/ files may be proxied, never arbitrary hosts. */
export const isWorkerStreamUrl = (url, workerOrigin = env.STREAM_ORIGIN) => {
  try {
    const parsed = new URL(url);
    return parsed.origin === new URL(workerOrigin).origin && parsed.pathname.startsWith('/stream/');
  } catch {
    return false;
  }
};

/**
 * Fetch one worker URL (playlist, segment or subs) and return a Response for the client.
 * @param {{ url: string, apiOrigin: string }} p
 */
export const proxyWorkerFile = async ({ url, apiOrigin }) => {
  const upstream = await fetch(url, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  const headers = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' };
  const retryAfter = upstream.headers.get('retry-after');
  if (retryAfter) headers['Retry-After'] = retryAfter;
  const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
  if (upstream.ok && contentType.includes('mpegurl')) {
    const body = rewritePlaylist(await upstream.text(), url, apiOrigin);
    return new Response(body, { status: 200, headers: { ...headers, 'Content-Type': contentType } });
  }
  return new Response(upstream.body, { status: upstream.status, headers: { ...headers, 'Content-Type': contentType } });
};
