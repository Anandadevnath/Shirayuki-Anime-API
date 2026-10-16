import crypto from 'crypto';
import { axios } from '../../utils/scrapper-deps.js';
import { DEFAULT_UA } from '../_shared.js';

// Flixcloud is the embed host reanime resolves to (https://flixcloud.cc/e/<id>?v=N).
// Its player encrypts the stream descriptors and the playlist bodies. To get a
// plain .m3u8 server-side we replay the player's own resolution, all of which is
// deterministic and does NOT depend on the browser's IP:
//
//   1. The embed HTML carries an `obfuscation_seed` and a `w_payload` WASM module.
//   2. Several field NAMES (for the frag/iv/token/key-fragment slots) are derived by
//      repeatedly SHA-256 hashing the seed; the seeded names are looked up in the page.
//   3. The seed + token select an encrypted URL blob (`E`) and a key fragment (`V`)
//      from GET /api/m3u8/<token>.
//   4. The WASM module mixes the three fragments (page frag, page key-frag, server V)
//      seeded by the first 8 hex chars of the seed; the result feeds PBKDF2 ->
//      XOR-with-seed -> SHA-256, and that key AES-256-CBC decrypts `E` into the m3u8 URL.
//   5. hls.js (a patched build) XORs the fetched playlist body against a second WASM
//      key exported via `_c()` (exposed in the page as window.__pk).
//
// The m3u8 JWT in the decrypted URL is bound to the requesting IP; because we fetch
// it from our own server those bytes come back for us, so the playlist *is* proxyable.

const sha256hex = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const toBytes = (b64) => Buffer.from(String(b64), 'base64');

// Derive the obfuscated field names that index the page's crypto container.
const deriveFieldNames = async (seed) => {
  let e = seed;
  for (let i = 0; i < 3; i++) e = await sha256hex(e + i);
  let a = e;
  for (let i = 0; i < 3; i++) a = await sha256hex(a + i);
  return {
    videoField: `vf_${e.slice(0, 8)}`,
    keyField: `kf_${e.slice(8, 16)}`,
    ivField: `ivf_${e.slice(16, 24)}`,
    containerName: `cd_${e.slice(24, 32)}`,
    arrayName: `ad_${e.slice(32, 40)}`,
    objectName: `od_${e.slice(40, 48)}`,
    tokenField: `${e.slice(48, 64)}_${e.slice(56, 64)}`,
    keyFrag2Field: `${a.slice(0, 16)}_${a.slice(16, 24)}`,
  };
};

// Object keys in the page payload are sometimes bare, sometimes double-quoted.
// Match either form: `name:"value"` and `"name":"value"`.
const readStringField = (haystack, name) => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = haystack.match(new RegExp(`(?:"${escaped}"|${escaped})\\s*:\\s*"([^"]+)"`));
  return match ? match[1] : null;
};

export const readEmbedPayload = async (embedUrl) => {
  const { data } = await axios.get(embedUrl, {
    proxy: false,
    timeout: 20000,
    headers: {
      'User-Agent': DEFAULT_UA,
      Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
      Referer: 'https://flixcloud.cc/',
    },
  });

  const html = String(data || '');
  const seed = (html.match(/obfuscation_seed:"([^"]+)"/) || [])[1];
  const wasmB64 = (html.match(/w_payload:"([^"]+)"/) || [])[1];
  if (!seed || !wasmB64) throw new Error('flixcloud embed did not expose obfuscation data');

  const fields = await deriveFieldNames(seed);

  const fragment1 = readStringField(html, fields.keyField);
  const iv = readStringField(html, fields.ivField);
  const token = readStringField(html, fields.tokenField);
  const keyFragment2 = readStringField(html, fields.keyFrag2Field);
  if (!fragment1 || !iv || !token || !keyFragment2) {
    throw new Error('flixcloud embed is missing required crypto fields');
  }

  return { seed, wasmB64, fragment1, iv, token, keyFragment2, fields };
};

// Combine the three fragments via the page WASM module.
const mixKeyFragments = async ({ wasmB64, seed, fragment1, keyFragment2, serverFragment }) => {
  const { instance } = await WebAssembly.instantiate(toBytes(wasmB64), {});
  const exports = instance.exports;
  const memory = exports.memory;
  if (memory.buffer.byteLength === 0) memory.grow(1);
  const view = new Uint8Array(memory.buffer);

  const frag1 = toBytes(fragment1);
  const frag2 = toBytes(keyFragment2);
  const frag3 = toBytes(serverFragment);

  // Layout mirrors the player: 1000-byte reserved slot, then the three fragments.
  const frag1Len = frag1.length;
  const off1 = 1000;
  const off2 = off1 + frag1Len;
  const off3 = off2 + frag1Len;
  const outOff = off3 + frag1Len;

  view.set(frag1, off1);
  view.set(frag2, off2);
  view.set(frag3, off3);

  exports._s(parseInt(seed.substring(0, 8), 16));
  exports._r(off1, off2, off3, outOff, frag1Len);

  const mixed = Buffer.from(view.subarray(outOff, outOff + frag1Len));
  // Second WASM export exposes the patched-hls.js playlist XOR key (window.__pk).
  const playlistKeyOff = exports._c();
  const playlistKey = Buffer.from(
    new Uint8Array(memory.buffer).slice(playlistKeyOff, playlistKeyOff + 32),
  );

  return { mixed, playlistKey };
};

const decryptUrlBlob = async ({ mixed, seed, iv, encryptedUrl }) => {
  const derived = await new Promise((resolve, reject) =>
    crypto.pbkdf2(mixed, Buffer.from(seed), 1000, 32, 'sha256', (err, key) =>
      err ? reject(err) : resolve(Buffer.from(key)),
    ),
  );
  for (let i = 0; i < 32; i++) derived[i] ^= seed.charCodeAt(i % seed.length);
  const aesKey = crypto.createHash('sha256').update(derived).digest();

  const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, toBytes(iv));
  const plain = Buffer.concat([decipher.update(toBytes(encryptedUrl)), decipher.final()]);
  return plain.toString('utf8');
};

// Fetch the token endpoint and pull the two per-session parts selected by the seed.
const fetchTokenParts = async (token) => {
  const vidKey = (await sha256hex(`${token}vid`)).substring(0, 10);
  const keyKey = (await sha256hex(`${token}key`)).substring(0, 10);

  const { data } = await axios.get(`https://flixcloud.cc/api/m3u8/${token}`, {
    proxy: false,
    timeout: 20000,
    headers: {
      'User-Agent': DEFAULT_UA,
      Accept: 'application/json, */*',
      Referer: 'https://flixcloud.cc/',
    },
  });

  if (!data || typeof data !== 'object') throw new Error('flixcloud token endpoint returned no payload');
  const encryptedUrl = data[vidKey];
  const serverFragment = data[keyKey];
  if (!encryptedUrl || !serverFragment) throw new Error('flixcloud token payload missing key parts');
  return { encryptedUrl, serverFragment };
};

// Decrypt a playlist body: base64 -> XOR against the repeating WASM playlist key.
export const decryptPlaylistBody = (body, playlistKey) => {
  const cipher = toBytes(String(body).trim());
  const out = Buffer.alloc(cipher.length);
  for (let i = 0; i < cipher.length; i++) out[i] = cipher[i] ^ playlistKey[i % playlistKey.length];
  return out.toString('utf8');
};

// Full resolution: embed page -> real, server-fetchable .m3u8 (plaintext playlist).
export const resolveFlixcloud = async (embedUrl) => {
  const payload = await readEmbedPayload(embedUrl);
  const { encryptedUrl, serverFragment } = await fetchTokenParts(payload.token);
  const { mixed, playlistKey } = await mixKeyFragments({
    wasmB64: payload.wasmB64,
    seed: payload.seed,
    fragment1: payload.fragment1,
    keyFragment2: payload.keyFragment2,
    serverFragment,
  });
  const m3u8Url = await decryptUrlBlob({
    mixed,
    seed: payload.seed,
    iv: payload.iv,
    encryptedUrl,
  });
  if (!/^https?:\/\//i.test(m3u8Url) || !m3u8Url.includes('.m3u8')) {
    throw new Error('flixcloud decryption produced an invalid m3u8 url');
  }
  return { url: m3u8Url, playlistKey };
};

// Fetch the resolved playlist and return its decrypted master text.
export const fetchDecryptedPlaylist = async (m3u8Url, playlistKey, referer = 'https://flixcloud.cc/') => {
  const { data } = await axios.get(m3u8Url, {
    proxy: false,
    timeout: 30000,
    responseType: 'arraybuffer',
    maxRedirects: 5,
    headers: {
      'User-Agent': DEFAULT_UA,
      Accept: '*/*',
      Referer: referer,
    },
  });
  return decryptPlaylistBody(Buffer.from(data).toString('utf8'), playlistKey);
};
