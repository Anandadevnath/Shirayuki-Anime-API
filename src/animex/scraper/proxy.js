import { axios } from '../../utils/scrapper-deps.js';
import { ANIMEX_BASE_URL, DEFAULT_UA } from './_shared.js';

const DEFAULT_REFERER = `${ANIMEX_BASE_URL}/`;

// Hosts we're willing to proxy, to avoid being turned into an open relay.
// These are the CDNs animex's pp.animex.one /sources currently serves from:
//   playlists -> hawk.24stream.xyz (hard sub), cdn.mewstream.buzz (soft sub)
//   segments  -> *.ibyteimg.com
//   subtitles -> *.lostproject.club, cdn.anizara.store
const ALLOWED_HOST_SUFFIXES = [
  '24stream.xyz',
  'mewstream.buzz',
  'ibyteimg.com',
  'lostproject.club',
  'anizara.store',
  'megaplay.buzz',
  'streamzone1.site',
];

const isAllowedHost = (urlStr) => {
  try {
    const { hostname } = new URL(urlStr);
    return ALLOWED_HOST_SUFFIXES.some(
      (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
    );
  } catch {
    return false;
  }
};

const looksLikePlaylist = (url, contentType) =>
  /\.m3u8(\?|$)/i.test(url) ||
  /mpegurl/i.test(contentType || '') ||
  /application\/x-mpegURL/i.test(contentType || '');

// Build a self-referencing proxy URL for a child resource of the playlist.
const buildProxyUrl = (basePath, absoluteUrl, referer) =>
  `${basePath}?url=${encodeURIComponent(absoluteUrl)}&ref=${encodeURIComponent(referer)}`;

// Rewrite a playlist so every URI (segments, variants, keys) is routed back
// through this proxy, preserving the referer needed by the upstream CDN.
const rewritePlaylist = (body, playlistUrl, referer, basePath) => {
  const resolve = (uri) => new URL(uri, playlistUrl).toString();

  return body
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      // Rewrite URI="..." attributes inside tags (EXT-X-KEY, EXT-X-MEDIA, I-FRAME).
      if (trimmed.startsWith('#')) {
        if (!trimmed.includes('URI="')) return line;
        return line.replace(/URI="([^"]+)"/g, (_, uri) => {
          const abs = resolve(uri);
          return `URI="${buildProxyUrl(basePath, abs, referer)}"`;
        });
      }

      // Plain resource line (segment or variant playlist).
      const abs = resolve(trimmed);
      return buildProxyUrl(basePath, abs, referer);
    })
    .join('\n');
};

export const proxyStream = async ({ url, referer, basePath }) => {
  if (!url) {
    const err = new Error('url query parameter is required');
    err.status = 400;
    throw err;
  }

  if (!isAllowedHost(url)) {
    const err = new Error('Requested host is not allowed');
    err.status = 403;
    throw err;
  }

  const upstreamReferer = referer || DEFAULT_REFERER;
  let upstreamOrigin;
  try {
    upstreamOrigin = new URL(upstreamReferer).origin;
  } catch {
    upstreamOrigin = undefined;
  }

  const upstream = await axios.get(url, {
    proxy: false,
    timeout: 30000,
    responseType: 'arraybuffer',
    maxRedirects: 5,
    validateStatus: () => true,
    headers: {
      'User-Agent': DEFAULT_UA,
      Accept: '*/*',
      Referer: upstreamReferer,
      ...(upstreamOrigin ? { Origin: upstreamOrigin } : {}),
    },
  });

  const contentType = upstream.headers['content-type'] || '';
  const status = upstream.status || 502;

  if (status >= 400) {
    const err = new Error(`Upstream responded with ${status}`);
    err.status = status === 403 ? 502 : status;
    throw err;
  }

  if (looksLikePlaylist(url, contentType)) {
    const text = Buffer.from(upstream.data).toString('utf-8');
    const rewritten = rewritePlaylist(text, url, upstreamReferer, basePath);
    return {
      kind: 'playlist',
      body: rewritten,
      contentType: 'application/vnd.apple.mpegurl',
    };
  }

  return {
    kind: 'binary',
    body: Buffer.from(upstream.data),
    contentType: contentType || 'application/octet-stream',
  };
};
