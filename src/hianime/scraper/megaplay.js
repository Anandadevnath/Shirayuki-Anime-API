import crypto from 'crypto';
import { axios } from '../../utils/scrapper-deps.js';
import { MEGAPLAY_BASE_URL, HIANIME_BASE_URL, DEFAULT_UA } from './_shared.js';

// AES key/iv seeds lifted from https://megaplay.buzz/lib/newclient.min.js — the
// player decrypts the getSources `enc` field with these using AES-256-CBC.
const AES_KEY_SEED = "i?LMTAx0Q6,:}50U";
const AES_IV_SEED = "W0;27ToaUpl_P%'c";

const toKeyBytes = (seed, length) => {
  const buf = Buffer.alloc(length);
  Buffer.from(String(seed), 'utf8').copy(buf, 0, 0, length);
  return buf;
};

const KEY = toKeyBytes(AES_KEY_SEED, 32);
const IV = toKeyBytes(AES_IV_SEED, 16);

// The `enc` payload is base64url without padding.
const fromBase64Url = (value) =>
  Buffer.from(String(value).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

export const decryptPayload = (enc) => {
  const decipher = crypto.createDecipheriv('aes-256-cbc', KEY, IV);
  const plain = Buffer.concat([decipher.update(fromBase64Url(enc)), decipher.final()]);
  return JSON.parse(plain.toString('utf8'));
};

// data-hash on each server entry is base64 of the full megaplay embed URL.
export const decodeServerHash = (hash) => {
  if (!hash) return null;
  const decoded = Buffer.from(String(hash), 'base64').toString('utf8').trim();
  return /^https?:\/\//i.test(decoded) ? decoded : null;
};

const megaplayHeaders = (referer) => ({
  'User-Agent': DEFAULT_UA,
  Accept: 'application/json, text/html, */*',
  'X-Requested-With': 'XMLHttpRequest',
  Referer: referer || `${MEGAPLAY_BASE_URL}/`,
});

const readEmbedAttrs = async (embedUrl) => {
  const resp = await axios.get(embedUrl, {
    proxy: false,
    timeout: 20000,
    headers: {
      'User-Agent': DEFAULT_UA,
      Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
      Referer: `${HIANIME_BASE_URL}/`,
    },
  });

  const html = String(resp?.data ?? '');
  const attrs = {};
  for (const m of html.matchAll(/data-(id|realid|mediaid|fileversion)="([^"]*)"/g)) {
    attrs[m[1]] = m[2];
  }
  return attrs;
};

// Resolve a base64 server hash all the way to a stream descriptor.
// Throws on every failure path — callers decide how to degrade.
export const resolveMegaplay = async (hash) => {
  const embed = decodeServerHash(hash);
  if (!embed) {
    throw new Error('server hash did not decode to an embed URL');
  }

  const attrs = await readEmbedAttrs(embed);
  if (!attrs.id) {
    throw new Error('megaplay embed did not expose data-id');
  }

  const resp = await axios.get(`${MEGAPLAY_BASE_URL}/stream/getSources`, {
    proxy: false,
    timeout: 20000,
    params: { id: attrs.id },
    headers: megaplayHeaders(),
  });

  const payload = resp?.data;
  if (!payload || typeof payload !== 'object') {
    throw new Error('getSources returned a non-object payload');
  }

  let decrypted = null;
  if (payload.enc) {
    try {
      decrypted = decryptPayload(payload.enc);
    } catch {
      throw new Error('failed to decrypt the getSources payload');
    }
  } else {
    throw new Error('getSources response missing enc field');
  }

  const file = decrypted?.file || null;
  if (!file) {
    throw new Error('decrypted payload did not contain a stream file');
  }

  return {
    embed,
    embedId: attrs.id,
    mediaId: attrs.mediaid || null,
    server: payload.server ?? null,
    link: file,
    streamResolved: true,
    tracks: Array.isArray(payload.tracks) ? payload.tracks : [],
    intro: payload.intro ?? null,
    outro: payload.outro ?? null,
  };
};
