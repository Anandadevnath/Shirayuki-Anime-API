import { load, axios } from '../../utils/scrapper-deps.js';

export const HIANIME_BASE_URL = 'https://hianime.dk';
export const MEGAPLAY_BASE_URL = 'https://megaplay.buzz';
export const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export const pageHeaders = (referer) => ({
  'User-Agent': DEFAULT_UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  Referer: referer || `${HIANIME_BASE_URL}/`,
});

export const ajaxHeaders = (referer) => ({
  'User-Agent': DEFAULT_UA,
  Accept: 'application/json, text/javascript, */*; q=0.01',
  'X-Requested-With': 'XMLHttpRequest',
  Referer: referer || `${HIANIME_BASE_URL}/`,
});

// Absolute URL helper — image/src values are relative on some pages.
export const toAbsoluteUrl = (value, base = HIANIME_BASE_URL) => {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  try {
    return new URL(value, base).toString();
  } catch {
    return value;
  }
};

export const pageGet = async (url, referer) => {
  const { data } = await axios.get(url, {
    proxy: false,
    timeout: 25000,
    maxRedirects: 5,
    headers: pageHeaders(referer),
  });
  return data;
};

export const ajaxGet = async (path, referer) => {
  const { data } = await axios.get(`${HIANIME_BASE_URL}${path}`, {
    proxy: false,
    timeout: 20000,
    headers: ajaxHeaders(referer),
  });
  return data;
};

export const parseNumber = (value) => {
  const n = Number(String(value || '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : null;
};

// "one-piece-8719" -> { slug: "one-piece", id: "8719" }
// Accepts full URLs, leading slash, bare slug-animeId or bare numeric id.
export const parseAnimeSlug = (raw) => {
  const clean = String(raw || '')
    .split('#')[0]
    .split('?')[0]
    .replace(/^https?:\/\/[^/]+\//, '')
    .replace(/^\/+|\/+$/g, '');
  if (!clean) return null;
  const m = clean.match(/(?:^|\/)([^/]+)-(\d+)$/);
  if (m) return { slug: m[1], id: m[2] };
  if (/^\d+$/.test(clean)) return { slug: null, id: clean };
  return { slug: clean, id: null };
};

// Map a query value to a Hianime server name. Defaults to HD-1.
// Accepts HD-1..HD-5 (both with/without dash) and returns the canonical name,
// or falls back to HD-1 when the value is empty/unrecognized.
export const normalizeServerName = (server) => {
  const raw = String(server || 'HD-1').replace(/\s+/g, '').toUpperCase();
  const n = (raw.match(/^HD-?(\d+)$/) || [])[1];
  const num = n && Number(n) >= 1 && Number(n) <= 5 ? Number(n) : 1;
  return `HD-${num}`;
};

export const normalizeCategory = (category) => {
  const value = String(category || 'sub').toLowerCase().trim();
  return value === 'dub' || value === 'd' ? 'dub' : 'sub';
};

