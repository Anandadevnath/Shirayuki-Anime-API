import { axios } from '../../utils/scrapper-deps.js';
import { HIANIME_BASE_URL, DEFAULT_UA } from './_shared.js';

// The hianime "ZokoAnime" server points at a custom player (zokoanime.video).
// The embed page exposes the stream config as an obfuscated base64 blob in
// window.__P; the player's own core/obfuscate.js decodes it by XOR-ing the
// payload bytes against a static key before JSON.parse.
const ZOKO_EMBED_RE = /zokoanime\.video/i;
export const ZOKOANIME_BASE_URL = 'https://zokoanime.video/';

// Obfuscation key from https://zokoanime.video/core/obfuscate.js
const OBF_KEY = 'otaku-embed-v1';

export const isZokoAnimeEmbed = (embed) =>
  /^https?:\/\//i.test(embed || '') && ZOKO_EMBED_RE.test(embed);

// Node mirror of the player's `xor()`: charCode XOR against the repeating key,
// operating on a binary/latin-1 string (matches atob() -> btoa() semantics).
const xorText = (input) => {
  let out = '';
  for (let i = 0; i < input.length; i += 1) {
    out += String.fromCharCode(
      input.charCodeAt(i) ^ OBF_KEY.charCodeAt(i % OBF_KEY.length),
    );
  }
  return out;
};

/**
 * Fetch a zokoanime embed page and deobfuscate its streaming config:
 *   window.__P = base64( XOR( utf8( JSON ) ) )
 * Throws on every failure path — callers decide how to degrade.
 */
export const readZokoAnimeConfig = async (embed) => {
  const resp = await axios.get(embed, {
    proxy: false,
    timeout: 20000,
    headers: {
      'User-Agent': DEFAULT_UA,
      Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
      Referer: `${HIANIME_BASE_URL}/`,
    },
  });

  const html = String(resp?.data ?? '');
  const match = html.match(/window\.__P\s*=\s*(['"])([\s\S]*?)\1/);
  if (!match) {
    throw new Error('zokoanime embed did not expose window.__P');
  }

  const binary = Buffer.from(match[2], 'base64').toString('latin1');
  const decoded = xorText(binary);
  const json = Buffer.from(decoded, 'latin1').toString('utf8');
  return JSON.parse(json);
};

/**
 * Resolve a zokoanime embed URL all the way to a stream descriptor.
 * Returns { link: master.m3u8, tracks: vtt subtitles, intro/outro, referer }.
 * Throws on failure — the caller (episode-sources) decides how to degrade.
 */
export const resolveZokoAnime = async (embed) => {
  const config = await readZokoAnimeConfig(embed);
  const link = config?.src || null;
  if (!link) {
    throw new Error('zokoanime config did not contain a stream src');
  }

  const skip = config.skip || {};
  const tracks = Array.isArray(config.subtitles)
    ? config.subtitles.map((s) => ({
        file: s?.src || null,
        label: s?.label || s?.lang || 'Subtitle',
        kind: 'captions',
        default: !!s?.default,
      }))
    : [];

  return {
    embed,
    embedId: config.video_id != null ? String(config.video_id) : null,
    mediaId: null,
    server: null,
    link,
    streamResolved: true,
    tracks: tracks.filter((t) => t.file),
    intro: skip.intro || null,
    outro: skip.outro || null,
    // The CDN gates the m3u8 (and every segment) behind this exact origin —
    // the API's /proxy and the frontend's /api/stream must forward it.
    referer: ZOKOANIME_BASE_URL,
  };
};
