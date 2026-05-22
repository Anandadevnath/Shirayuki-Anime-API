import { axios } from '../../utils/scrapper-deps.js';

const JIKAN_BASE = 'https://api.jikan.moe/v4';
const ANISKIP_BASE = 'https://api.aniskip.com/v2';

const malIdCache = new Map();
const skipCache = new Map();
const SKIP_TTL_MS = 60 * 60 * 1000;

const cleanTitleForSearch = (raw) => {
  if (!raw) return '';
  return String(raw)
    .replace(/\(.*?\)/g, ' ')
    .replace(/[:!?.,'"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const normalizeForCompare = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const pickBestMatch = (results, queryNormalized) => {
  if (!Array.isArray(results) || !results.length) return null;

  for (const r of results) {
    const titles = Array.isArray(r.titles) ? r.titles : [];
    const allTitles = [r.title, r.title_english, r.title_japanese, ...titles.map((t) => t?.title)];
    if (allTitles.some((t) => normalizeForCompare(t) === queryNormalized)) {
      return r.mal_id;
    }
  }

  return results[0]?.mal_id || null;
};

const jikanSearch = async (q, type) => {
  const params = { q, limit: 5, order_by: 'members', sort: 'desc' };
  if (type) params.type = type;
  try {
    const resp = await axios.get(`${JIKAN_BASE}/anime`, {
      params,
      proxy: false,
      timeout: 10000,
    });
    return Array.isArray(resp?.data?.data) ? resp.data.data : [];
  } catch {
    return [];
  }
};

export const resolveMalId = async (animeId, title) => {
  if (!animeId) return null;
  if (malIdCache.has(animeId)) return malIdCache.get(animeId);

  const candidates = [title, animeId.replace(/-/g, ' ')]
    .map(cleanTitleForSearch)
    .filter(Boolean);

  for (const q of candidates) {
    const queryNormalized = normalizeForCompare(q);

    for (const type of ['tv', null]) {
      const results = await jikanSearch(q, type);
      const malId = pickBestMatch(results, queryNormalized);
      if (malId) {
        malIdCache.set(animeId, malId);
        return malId;
      }
    }
  }

  malIdCache.set(animeId, null);
  return null;
};

export const getSkipTimes = async (malId, episodeNumber) => {
  if (!malId || !episodeNumber) return { intro: null, outro: null };

  const cacheKey = `${malId}:${episodeNumber}`;
  const cached = skipCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.value;
  }

  const url = `${ANISKIP_BASE}/skip-times/${malId}/${episodeNumber}?types[]=op&types[]=ed&episodeLength=0`;

  let intro = null;
  let outro = null;

  try {
    const resp = await axios.get(url, { proxy: false, timeout: 10000 });
    const payload = resp?.data || {};
    const results = Array.isArray(payload.results) ? payload.results : [];

    for (const r of results) {
      const interval = r?.interval;
      if (!interval) continue;
      const start = Number(interval.startTime) || 0;
      const end = Number(interval.endTime) || 0;
      if (r.skipType === 'op') intro = { start, end };
      else if (r.skipType === 'ed') outro = { start, end };
    }
  } catch {
    // swallow — leave intro/outro null
  }

  const value = { intro, outro };
  skipCache.set(cacheKey, { value, expiresAt: Date.now() + SKIP_TTL_MS });
  return value;
};
