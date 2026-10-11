import crypto from 'crypto';
import { load, axios } from '../../utils/scrapper-deps.js';
import {
  ANIKOTO_BASE_URL,
  MEGAPLAY_BASE_URL,
  DEFAULT_UA,
  ajaxGet,
} from '../_shared.js';

// Same AES-256-CBC scheme the megal.cloud family uses (also in hianime's
// megaplay.js). Seeds lifted from the player's front-end bundle.
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

const readEmbedAttrs = async (embedUrl) => {
  const resp = await axios.get(embedUrl, {
    proxy: false,
    timeout: 20000,
    headers: {
      'User-Agent': DEFAULT_UA,
      Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
      Referer: `${ANIKOTO_BASE_URL}/`,
    },
  });

  const html = String(resp?.data ?? '');
  const attrs = {};
  for (const m of html.matchAll(/data-(id|realid|mediaid|fileversion)="([^"]*)"/g)) {
    attrs[m[1]] = m[2];
  }
  return attrs;
};

// Step 2 -> 4 of the anikoto stream chain for a single server button.
// `linkId` is the server button's data-link-id token.
export const resolveEpisodeLink = async ({ linkId, referer }) => {
  const serverData = await ajaxGet(
    `/ajax/server?get=${encodeURIComponent(linkId)}`,
    referer || `${ANIKOTO_BASE_URL}/`,
  );

  const embedUrl = serverData?.result?.url || null;
  if (!embedUrl) {
    throw new Error('Server link is expired or unavailable — retry to get a fresh one');
  }
  const skipData = serverData?.result?.skip_data || null;

  const attrs = await readEmbedAttrs(embedUrl);
  if (!attrs.id) {
    throw new Error('megaplay embed did not expose data-id');
  }

  const resp = await axios.get(`${MEGAPLAY_BASE_URL}/stream/getSources`, {
    proxy: false,
    timeout: 20000,
    params: { id: attrs.id },
    headers: {
      'User-Agent': DEFAULT_UA,
      Accept: 'application/json, text/html, */*',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: `${MEGAPLAY_BASE_URL}/`,
    },
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
    embed: embedUrl,
    embedId: attrs.id,
    mediaId: attrs.mediaid || null,
    server: payload.server ?? null,
    link: file,
    streamResolved: true,
    tracks: Array.isArray(decrypted.tracks) ? decrypted.tracks : Array.isArray(payload.tracks) ? payload.tracks : [],
    intro: skipData?.intro || payload.intro || null,
    outro: skipData?.outro || payload.outro || null,
  };
};