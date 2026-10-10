import { axios } from '../../utils/scrapper-deps.js';
import { HIANIME_BASE_URL, DEFAULT_UA } from './_shared.js';

// The HD-3/HD-4/HD-5 servers use a different player ("vidplay"/"VidHide"  — a
// VidHide/streamtape-like host) than the megaplay family. The m3u8 is embedded
// directly in the embed page, hidden inside a dean-edwards packer-obfuscated
// script. We decode that packer and extract the `links` object.

export const decodeServerHash = (hash) => {
  if (!hash) return null;
  const decoded = Buffer.from(String(hash), 'base64').toString('utf8').trim();
  return /^https?:\/\//i.test(decoded) ? decoded : null;
};

// Decode a single dean-edwards packer script block, returning the plain text.
const unpackPacker = (code) => {
  const m = code.match(
    /^eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?return p\}\('((?:[^'\\]|\\.)*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:[^'\\]|\\.)*)'\.split\('\|'\)\)\);?$/
  );
  if (!m) return null;
  const payload = m[1];
  const radix = Number(m[2]);
  const dict = m[4].split('|');
  let out = payload;
  for (let c = dict.length - 1; c >= 0; c--) {
    if (!dict[c]) continue;
    out = out.replace(new RegExp('\\b' + c.toString(radix) + '\\b', 'g'), dict[c]);
  }
  return out;
};

// Given decoded player JS, return the preferred stream URL (absolute).
export const extractLinks = (decoded, embedUrl) => {
  const lm = decoded.match(/links\s*=\s*(\{[\s\S]*?\});/);
  if (!lm) return null;
  let links;
  try {
    links = JSON.parse(lm[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\'));
  } catch {
    return null;
  }
  // JWPlayer sources array in the config prefers: file links.hls4||links.hls3||links.hls2
  const order = [links.hls4, links.hls3, links.hls2];
  for (const candidate of order) {
    if (!candidate) continue;
    const abs = /^https?:/i.test(candidate)
      ? candidate
      : new URL(candidate, embedUrl).toString();
    return abs;
  }
  return null;
};

// Resolve a server hash into a stream descriptor for the otaku/vidplay family.
// Throws on failure — the caller (episode-sources) decides how to degrade.
export const resolveVidplay = async (hash) => {
  const embed = decodeServerHash(hash);
  if (!embed) throw new Error('server hash did not decode to an embed URL');

  const resp = await axios.get(embed, {
    proxy: false,
    timeout: 25000,
    headers: {
      'User-Agent': DEFAULT_UA,
      Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
      Referer: `${HIANIME_BASE_URL}/`,
    },
  });
  const html = String(resp?.data ?? '');

  const start = html.indexOf('eval(function(p,a,c,k,e,d)');
  if (start === -1) throw new Error('vidplay embed contained no packer script');

  const block = html.slice(start).split('</script>')[0].trim();
  const decoded = unpackPacker(block);
  if (!decoded) throw new Error('failed to decode the vidplay packer script');

  const link = extractLinks(decoded, embed);
  if (!link) throw new Error('vidplay player did not expose a stream link');

  return { embed, embedId: null, mediaId: null, server: null, link, streamResolved: true, tracks: [], intro: null, outro: null };
};
