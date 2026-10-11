import { load, axios } from '../utils/scrapper-deps.js';

export const ANIKOTO_BASE_URL = 'https://anikototv.to';
export const MEGAPLAY_BASE_URL = 'https://megaplay.buzz';
export const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export const pageHeaders = (referer) => ({
  'User-Agent': DEFAULT_UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  Referer: referer || `${ANIKOTO_BASE_URL}/`,
});

export const ajaxHeaders = (referer) => ({
  'User-Agent': DEFAULT_UA,
  Accept: 'application/json, text/javascript, */*; q=0.01',
  'X-Requested-With': 'XMLHttpRequest',
  Referer: referer || `${ANIKOTO_BASE_URL}/`,
});

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
  const { data } = await axios.get(`${ANIKOTO_BASE_URL}${path}`, {
    proxy: false,
    timeout: 20000,
    headers: ajaxHeaders(referer),
  });
  return data;
};

// Helper to turn a possibly-relative url (image, link) into an absolute one.
export const toAbsoluteUrl = (value, base = ANIKOTO_BASE_URL) => {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  try {
    return new URL(value, base).toString();
  } catch {
    return value;
  }
};

export const parseNumber = (value) => {
  const n = Number(String(value || '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

// Anikoto anime identifiers are the watch page slug, e.g. "naruto-eybxz" or
// "black-clover-season-2". Accepts full URLs, /watch/ paths, bare slugs, and
// optionall splits the trailing base-36 id out of the slug.
export const parseAnimeSlug = (raw) => {
  const clean = String(raw || '')
    .split('#')[0]
    .split('?')[0]
    .replace(/^https?:\/\/[^/]+\//, '')
    .replace(/^\/+|\/+$/g, '')
    .replace(/^(watch|anime|filter|genre|az-list)\//, '');
  if (!clean) return null;
  const m = clean.match(/^(.*)-([a-z0-9]{4,6})$/i);
  if (m && m[1]) return { slug: m[1], animeId: m[2] };
  return { slug: clean, animeId: null };
};

export const normalizeCategory = (category) => {
  const value = String(category || 'sub').toLowerCase().trim();
  return value === 'dub' || value === 'd' ? 'dub' : 'sub';
};

// Server names on the media selector: HD-1, HD-2, Vidstream-1, Vidstream-2, ...
export const normalizeServerName = (server) => {
  const raw = String(server || '').trim();
  if (!raw) return null;
  return raw.replace(/^server\s*\d*$/i, (m) => m).trim();
};

export const buildWatchUrl = (slug, episode) =>
  `${ANIKOTO_BASE_URL}/watch/${slug}${episode ? `/ep-${episode}` : ''}`;