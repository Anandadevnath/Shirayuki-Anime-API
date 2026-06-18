import { fetchPage, extractFlwItems, extractPagination } from './_shared.js';

const ROMAN = {
  ii: 2,
  iii: 3,
  iv: 4,
  v: 5,
  vi: 6,
  vii: 7,
  viii: 8,
  ix: 9,
  x: 10,
};

// Lowercase, drop punctuation/diacritic noise, collapse whitespace.
const normalize = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Strip trailing season/part/ordinal/type markers to get the franchise root.
const deriveBase = (normalized) => {
  let base = normalized;
  const strippers = [
    /\s+(part|cour)\s+\d+$/,
    /\s+\d+(st|nd|rd|th)?\s+season$/,
    /\s+season\s+\d+$/,
    /\s+(the\s+)?final\s+season$/,
    /\s+season$/,
    /\s+(specials?|ova|ona|movies?|film|tv)$/,
    /\s+(ii|iii|iv|v|vi|vii|viii|ix|x)$/,
  ];

  let changed = true;
  while (changed) {
    changed = false;
    for (const re of strippers) {
      const next = base.replace(re, '');
      if (next !== base && next.trim()) {
        base = next.trim();
        changed = true;
      }
    }
  }

  return base || normalized;
};

const seasonNumber = (normalized) => {
  if (/\bfinal\s+season\b/.test(normalized)) return 100;

  const ordinal = normalized.match(/\b(\d+)(?:st|nd|rd|th)\s+season\b/);
  if (ordinal) return Number(ordinal[1]);

  const explicit = normalized.match(/\bseason\s+(\d+)\b/);
  if (explicit) return Number(explicit[1]);

  const roman = normalized.match(/\s(ii|iii|iv|v|vi|vii|viii|ix|x)$/);
  if (roman) return ROMAN[roman[1]];

  return 1;
};

const partNumber = (normalized) => {
  const match = normalized.match(/\b(?:part|cour)\s+(\d+)\b/);
  return match ? Number(match[1]) : 0;
};

const TYPE_WEIGHT = {
  tv: 0,
  ona: 1,
  ova: 2,
  movie: 3,
  special: 4,
};

const typeWeight = (type) => {
  const key = String(type || '').trim().toLowerCase();
  return TYPE_WEIGHT[key] ?? 5;
};

// A candidate belongs to the franchise when its normalized title starts with
// the base, respecting a word boundary (so "naruto" never matches "narutaru").
const belongsToFranchise = (candidateNorm, base) => {
  if (candidateNorm === base) return true;
  return candidateNorm.startsWith(`${base} `);
};

export const getHianimeSeasons = async ({ title, animeId, maxPages = 5 } = {}) => {
  const seed = String(title || '').trim() || String(animeId || '').replace(/-/g, ' ').trim();
  if (!seed) {
    throw new Error('title or animeId query parameter is required');
  }

  const base = deriveBase(normalize(seed));
  const currentId = animeId ? String(animeId).trim() : null;

  const seen = new Set();
  const collected = [];
  let source = null;
  const pageCap = Math.min(Math.max(Number(maxPages) || 1, 1), 10);

  for (let page = 1; page <= pageCap; page += 1) {
    const { url, $ } = await fetchPage('/filter', {
      searchParams: { keyword: base, page },
      referer: 'https://hianime.ad/',
    });
    if (!source) source = url;

    const items = extractFlwItems($);
    for (const item of items) {
      if (!item.id || seen.has(item.id)) continue;
      seen.add(item.id);
      collected.push(item);
    }

    const { hasNextPage } = extractPagination($);
    if (!hasNextPage || items.length === 0) break;
  }

  const seasons = collected
    .filter((item) => {
      const candidateNorm = normalize(item.title || item.ename || item.id);
      return belongsToFranchise(candidateNorm, base);
    })
    .map((item) => {
      const norm = normalize(item.title || item.ename || item.id);
      return {
        ...item,
        isCurrent: currentId ? item.id === currentId : false,
        season: seasonNumber(norm),
        part: partNumber(norm),
      };
    })
    .sort((a, b) => {
      const wa = typeWeight(a.type);
      const wb = typeWeight(b.type);
      if (wa !== wb) return wa - wb;
      if (a.season !== b.season) return a.season - b.season;
      if (a.part !== b.part) return a.part - b.part;
      return (a.title || '').localeCompare(b.title || '');
    })
    .map((item, index) => ({ order: index + 1, ...item }));

  return {
    source,
    query: seed,
    base,
    total: seasons.length,
    seasons,
  };
};
