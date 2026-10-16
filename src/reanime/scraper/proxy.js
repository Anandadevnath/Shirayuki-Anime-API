import { axios } from '../../utils/scrapper-deps.js';
import { DEFAULT_UA } from '../_shared.js';
import { decryptPlaylistBody } from './flixcloud.js';

// Flixcloud CDN hosts rotate (fetch*.flixcloud.cc, vault-*.rundowncdn.top, ...).
// We allow the known families and then learn every child host referenced by a
// playlist we proxy, matching the hianime proxy's behaviour.
const ALLOWED_HOST_SUFFIXES = ['flixcloud.cc', 'rundowncdn.top'];

const discoveredHosts = new Set();
const noteHostsFrom = (body, playlistUrl) => {
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    try {
      discoveredHosts.add(new URL(trimmed, playlistUrl).hostname);
    } catch {}
  }
  // Also learn hosts referenced by URI="..." attributes (keys, audio renditions).
  for (const match of body.matchAll(/URI="([^"]+)"/g)) {
    try {
      discoveredHosts.add(new URL(match[1], playlistUrl).hostname);
    } catch {}
  }
};

const isAllowedHost = (urlStr) => {
  try {
    const { hostname } = new URL(urlStr);
    return (
      ALLOWED_HOST_SUFFIXES.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`)) ||
      discoveredHosts.has(hostname)
    );
  } catch {
    return false;
  }
};

const buildProxyUrl = (basePath, absoluteUrl, referer, ext = '', key = '') => {
  const path = ext ? `${basePath}/stream${ext}` : basePath;
  const keyParam = key ? `&key=${encodeURIComponent(key)}` : '';
  return `${path}?url=${encodeURIComponent(absoluteUrl)}&ref=${encodeURIComponent(referer)}${keyParam}`;
};

// Rewrite a (decrypted) playlist so children route back through this proxy.
// The playlist key is propagated to child playlist URLs so variant playlists
// stay decryptable when the client follows them.
const rewritePlaylist = (body, playlistUrl, referer, basePath, key = '') => {
  const resolve = (uri) => new URL(uri, playlistUrl).toString();
  const childExt = /#EXT-X-STREAM-INF/i.test(body) ? '.m3u8' : '.ts';

  return body
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      if (trimmed.startsWith('#')) {
        if (!trimmed.includes('URI="')) return line;
        return line.replace(/URI="([^"]+)"/g, (_, uri) => {
          const abs = resolve(uri);
          // Only forward the key on child playlists, not on AES key/segment URIs.
          const childKey = key && /\.m3u8(\?|$)/i.test(abs) ? key : '';
          return `URI="${buildProxyUrl(basePath, abs, referer, '', childKey)}"`;
        });
      }

      const abs = resolve(trimmed);
      const childKey = key && /\.m3u8(\?|$)/i.test(abs) ? key : '';
      return buildProxyUrl(basePath, abs, referer, childExt, childKey);
    })
    .join('\n');
};

// Proxy one flixcloud resource. Playlist bodies are base64 + XOR-obfuscated; pass
// `playlistKey` (the 32-byte WASM key as base64) to decrypt them before rewriting.
// Either way the rewritten playlist routes children back through this proxy; a
// stream URL's referer is required by the CDN and is carried in the `ref` query.
export const proxyStream = async ({ url, referer, basePath, playlistKey }) => {
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

  const upstreamReferer = referer || 'https://flixcloud.cc/';
  const looksLikePlaylist = /\.m3u8(\?|$)/i.test(url);

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

  const status = upstream.status || 502;
  if (status >= 400) {
    const err = new Error(`Upstream responded with ${status}`);
    err.status = status === 403 ? 502 : status;
    throw err;
  }

  const raw = Buffer.from(upstream.data);

  if (looksLikePlaylist) {
    let text = raw.toString('utf8');
    if (!text.trimStart().startsWith('#EXTM3U')) {
      if (!playlistKey) {
        const err = new Error('playlist is encrypted but no key was provided');
        err.status = 400;
        throw err;
      }
      text = decryptPlaylistBody(text, playlistKey);
    }
    noteHostsFrom(text, url);
    const keyB64 = playlistKey ? playlistKey.toString('base64') : '';
    const rewritten = rewritePlaylist(text, url, upstreamReferer, basePath, keyB64);
    return {
      kind: 'playlist',
      body: rewritten,
      contentType: 'application/vnd.apple.mpegurl',
    };
  }

  // Everything reaching here that is not a playlist is a media segment. Flixcloud
  // masks TS segments as images (.webp/.png) and serves a fake image content-type;
  // when the stream is AES-128 keyed the segments are ciphertext. The browser's MSE
  // rejects a non-video content-type, so always serve a video type here.
  const contentType = upstream.headers['content-type'] || '';
  const contentTypeOut = /^video\//i.test(contentType) ? contentType : 'video/mp2t';

  return { kind: 'binary', body: raw, contentType: contentTypeOut };
};
