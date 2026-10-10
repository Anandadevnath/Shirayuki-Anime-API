import { axios } from '../../utils/scrapper-deps.js';
import { MEGAPLAY_BASE_URL, DEFAULT_UA } from './_shared.js';

// Static allow-list covers the player and known master/key CDN hosts.
const ALLOWED_HOST_SUFFIXES = [
  'megaplay.buzz',
  'nexabloom.top',
  'broforgotsave.online',
  'eclipseharbor.space',
];

// Besides throttling, we also learn and accept the CDN host of every child
// (segment / AES key / variant) referenced by a playlist we successfully proxied.
// This covers the ever-rotating masked base domains (ex. .space) per episode
// without turning the proxy into an open relay for arbitrary hosts.
const discoveredHosts = new Set();
const noteHostsFrom = (body, playlistUrl) => {
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    try {
      discoveredHosts.add(new URL(trimmed, playlistUrl).hostname);
    } catch {}
  }
};

const isAllowedHost = (urlStr) => {
  try {
    const { hostname } = new URL(urlStr);
    return (
      ALLOWED_HOST_SUFFIXES.some(
        (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
      ) || discoveredHosts.has(hostname)
    );
  } catch {
    return false;
  }
};

const looksLikePlaylist = (url, contentType, body) =>
  /\.m3u8(\?|$)/i.test(url) ||
  /mpegurl/i.test(contentType || '') ||
  /application\/x-mpegURL/i.test(contentType || '') ||
  /^\s*#EXTM3U/.test(Buffer.from(body || ' ').subarray(0, 64).toString('utf-8'));

// Build a self-referencing proxy URL for a child resource of the playlist.
const buildProxyUrl = (basePath, absoluteUrl, referer, ext = '') => {
  const path = ext ? `${basePath}/stream${ext}` : basePath;
  return `${path}?url=${encodeURIComponent(absoluteUrl)}&ref=${encodeURIComponent(referer)}`;
};

// Rewrite a playlist so every URI (segments, variants, keys) is routed back
// through this proxy, preserving the referer needed by the upstream CDN.
const rewritePlaylist = (body, playlistUrl, referer, basePath) => {
  const resolve = (uri) => new URL(uri, playlistUrl).toString();
  // A master playlist references child variants (.m3u8); a media playlist
  // references TS segments (.ts). Detect which one we're rewriting so the
  // proxied child URLs carry a recognized extension.
  const childExt = /#EXT-X-STREAM-INF/i.test(body) ? '.m3u8' : '.ts';

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
      return buildProxyUrl(basePath, abs, referer, childExt);
    })
    .join('\n');
};

// The MegaPlay CDN obfuscates TS segments by serving them with a fake image
// content-type. TS sync bytes (0x47) repeat every 188 bytes, so a 3-point check
// reliably identifies them.
const isTransportStream = (buf) => {
  if (buf.length < 188 * 3) return false;
  return buf[0] === 0x47 && buf[188] === 0x47 && buf[376] === 0x47;
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

  const upstreamReferer = referer || `${MEGAPLAY_BASE_URL}/`;

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
    },
  });

  const contentType = upstream.headers['content-type'] || '';
  const status = upstream.status || 502;

  if (status >= 400) {
    const err = new Error(`Upstream responded with ${status}`);
    err.status = status === 403 ? 502 : status;
    throw err;
  }

  if (looksLikePlaylist(url, contentType, upstream.data)) {
    const text = Buffer.from(upstream.data).toString('utf-8');
    // Learn child hosts (variants/segments/keys) now so later requests for
    // those resources pass the allow-check even on rotating masked domains.
    noteHostsFrom(text, url);
    const rewritten = rewritePlaylist(text, url, upstreamReferer, basePath);
    return {
      kind: 'playlist',
      body: rewritten,
      contentType: 'application/vnd.apple.mpegurl',
    };
  }

  const binary = Buffer.from(upstream.data);
  const contentTypeOut =
    isTransportStream(binary) && !/^video\//i.test(contentType)
      ? 'video/mp2t'
      : contentType || 'application/octet-stream';

  return {
    kind: 'binary',
    body: binary,
    contentType: contentTypeOut,
  };
};
