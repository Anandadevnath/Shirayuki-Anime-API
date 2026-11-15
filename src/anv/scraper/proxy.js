import { anvGetRaw, getSessionCookie, httpError, ANV_BASE_URL } from '../_shared.js';
import { looksLikePlaylist, rewritePlaylist, isTransportStream } from '../../hianime/scraper/proxy.js';

const ANV_HOST = new URL(ANV_BASE_URL).hostname;

// Only anv's own /stream/* paths: keeps the proxy from being an open relay.
const isAllowed = (urlStr) => {
  try {
    const { protocol, hostname, pathname } = new URL(urlStr);
    return protocol === 'https:' && hostname === ANV_HOST && pathname.startsWith('/stream/');
  } catch {
    return false;
  }
};

export const proxyAnvStream = async ({ url, basePath }) => {
  if (!isAllowed(url)) throw httpError('Requested url is not an anv stream url', 403);

  // Every /stream URL (master, variants, segments, subtitles) needs the session cookie.
  const upstream = await anvGetRaw(url, await getSessionCookie());
  if (upstream.status === 403) {
    throw httpError('anv stream token rejected (expired or session rotated) — refetch episode sources', 502);
  }
  if (upstream.status >= 400) throw httpError(`Upstream responded with ${upstream.status}`, upstream.status);

  const contentType = upstream.headers['content-type'] || '';
  if (looksLikePlaylist(url, contentType, upstream.data)) {
    const text = Buffer.from(upstream.data).toString('utf-8');
    return {
      body: rewritePlaylist(text, url, `${ANV_BASE_URL}/`, basePath),
      contentType: 'application/vnd.apple.mpegurl',
    };
  }

  // Segments are real MPEG-TS disguised with fake extensions/content-types
  // (file.jpg → image/jpeg, file.html, file.js ...).
  const binary = Buffer.from(upstream.data);
  const sniffed = isTransportStream(binary)
    ? 'video/mp2t'
    : binary.subarray(0, 6).toString('utf-8') === 'WEBVTT' // <track> rejects non-text/vtt
      ? 'text/vtt; charset=utf-8'
      : null;
  return { body: binary, contentType: sniffed || contentType || 'application/octet-stream' };
};
