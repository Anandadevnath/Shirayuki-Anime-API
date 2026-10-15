import { load } from '../../utils/scrapper-deps.js';
import {
  HIANIME_BASE_URL,
  pageGet,
  parseAnimeSlug,
} from './_shared.js';
import { extractFlwItems } from './cards.js';

// ─────────────────────────────────────────────────────────────────────────────
// Franchise seasons (serial 1, 2, 3, …).
//
// hianime.at ships NO first-class "seasons" block on detail/watch pages (probed:
// there is no block_area-relation, no embedded JSON, and the theme API has no
// /related or /seasons route — only /characters). The reliable sibling source is
// the site's own search: franchise entries share a base title plus a trailing
// season marker ("Season 4", "2nd Season", "3rd Season", "Final Season", …).
//
// Hardening vs the naive fuzzy match:
//  - search the PLAIN base as well ("… Season" keyword hides the base = Season 1);
//  - drop spin-offs / subtitled extras ("…: Vigilantes Season 2",
//    "… Season 2: Hero Notebook") via a strict base-prefix + marker remainder test;
//  - read the season number from the URL slug first (…-season-N-… is authoritative,
//    e.g. "My Hero Academia 2" → my-hero-academia-season-2-1031); the visible title
//    is only a fallback ("2nd Season", "S2", …).
// ─────────────────────────────────────────────────────────────────────────────

// Tidy: lowercase, collapse non-alphanumerics to single spaces.
const tidy = (v) =>
  String(v || '')
    .toLowerCase()
    .replace(/[^0-9a-z]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

// "Foo Season 4" → "Foo"; "Franchise 2nd Season" → "Franchise"; "Foo Part 2" → "Foo".
export const toBaseTitle = (title) => {
  const t = String(title || '').trim();
  if (!t) return '';
  const m = t.match(
    /(?:\bSeason\s*\d+(?:\s*[-:(]\s*\d+)?\b)|(?:\b\d+(?:st|nd|rd|th)\s*Season\b)|(?:\bS\d+\b)|(?:\bPart\s*\d+\b)|(?:\bFinal\s*Season\b)/i,
  );
  const base = m ? t.slice(0, m.index) : t;
  return base.replace(/[s:,;|/._-]+$/g, '').trim();
};

// Season number from the URL slug: "my-hero-academia-season-2-1031" → 2.
// Requires a trailing dash so "…-final-season-56" isn't seen as "season 56".
const parseSlugSeason = (slug) => {
  const m = String(slug || '').match(/-season-(\d+)-/i);
  return m ? Number(m[1]) : null;
};

// Season number from the visible title (fallback): "Season 4"/"4th Season"/"S2".
const parseTitleSeason = (title) => {
  const t = String(title || '');
  let m;
  if ((m = t.match(/Season\s*(\d+)/i))) return Number(m[1]);
  if ((m = t.match(/\b(\d+)(?:st|nd|rd|th)\s*Season\b/i))) return Number(m[1]);
  if ((m = t.match(/\bS(\d+)\b/i))) return Number(m[1]);
  return null;
};

// Part number from a title ("Part 2" → 2); a bare "Part 2" is season 1 part 2.
const parsePartNumber = (title) => {
  const m = String(title || '').match(/\bPart\s*(\d+)\b/i);
  return m ? Number(m[1]) : null;
};

// True when the title is exactly `<base>` OR `<base>` + a pure season marker.
// Anything extra (spin-offs, subtitled specials, movies) is rejected:
//   ✓ "My Hero Academia", "My Hero Academia 2", "… 5th Season",
//     "… Season 6", "… 2nd Season", "… Final Season", "… S2"
//   ✗ "My Hero Academia: Vigilantes Season 2", "… Season 2: Hero Notebook"
const isPureSeasonTitle = (title, base) => {
  const t = tidy(title);
  const b = tidy(base);
  if (!t || !b) return false;
  const tWords = t.split(' ');
  const bWords = b.split(' ');
  if (tWords.length < bWords.length) return false;
  for (let i = 0; i < bWords.length; i++) {
    if (tWords[i] !== bWords[i]) return false;
  }
  const remainder = tWords.slice(bWords.length).join(' ');
  if (!remainder) return true; // the exact base entry (Season 1)
  return /^(?:season\s*\d+|s\d+|\d+(?:st|nd|rd|th)\s*season|\d+|part\s*\d+|season\s*\d+\s+part\s*\d+|final\s*season)$/i.test(
    remainder,
  );
};

// Season number for a card, or null to keep-and-sort-last ("Final Season").
// Slug is authoritative; title is the fallback; the exact base is Season 1.
const seasonOf = (card, base) => {
  if (!isPureSeasonTitle(card.title, base)) return null;
  const slug = card.url ? String(card.url).split('/').pop() : '';
  const fromSlug = parseSlugSeason(slug);
  if (fromSlug != null) return fromSlug;
  const fromTitle = parseTitleSeason(card.title);
  if (fromTitle != null) return fromTitle;
  if (tidy(card.title) === tidy(base)) return 1; // the base = Season 1
  if (/final\s*season/i.test(card.title)) return null; // keep, sort last
  return null;
};

export const parseAnimeFullTitle = ($) => {
  const titleEl = $('h2.film-name.dynamic-name, .anisc-detail h2').first();
  return (titleEl.text().trim() || titleEl.attr('data-jname') || '')
    .replace(/\s+/g, ' ')
    .trim();
};

export const getHianimeSeasons = async ({ animeId } = {}) => {
  const raw = String(animeId || '').trim();
  if (!raw) {
    const err = new Error('animeId path parameter is required (e.g. one-piece-1)');
    err.status = 400;
    throw err;
  }
  const clean = raw.replace(/^\/+|\/+$/g, '');
  const detailUrl = `${HIANIME_BASE_URL}/${clean}`;
  const detailHtml = await pageGet(detailUrl);
  const $ = load(detailHtml);
  const fullTitle = parseAnimeFullTitle($);
  return searchFranchiseSeasons({ fullTitle, clean, detailUrl });
};

// Shared franchise discovery. Callers who already hold the detail page may
// skip the re-fetch by providing fullTitle + clean + detailUrl directly.
export const searchFranchiseSeasons = async ({ fullTitle, clean, detailUrl }) => {
  const base = toBaseTitle(fullTitle);
  if (!base) {
    return { source: detailUrl, total: 0, seasons: [] };
  }

  // Search the plain base (so the base = Season 1 is found) and the base +
  // " Season" (so numbered siblings surface), bounded to 2 pages, dedup by slug.
  const cards = [];
  const seen = new Set();
  for (const keyword of [base, `${base} Season`]) {
    for (let page = 1; page <= 2; page++) {
      const html = await pageGet(
        `${HIANIME_BASE_URL}/search?keyword=${encodeURIComponent(keyword)}&page=${page}`,
      );
      const $page = load(html);
      const found = extractFlwItems($page, '#main-content .flw-item');
      if (!found.length) break;
      for (const card of found) {
        const slugId = card.url ? String(card.url).split('/').pop() : (card.id && `${card.id}`) || '';
        if (!slugId || seen.has(slugId)) continue;
        seen.add(slugId);
        cards.push(card);
      }
      if (found.length < 25) break; // last page — stop early
    }
  }

  // Keep only pure franchise seasons and order serially 1, 2, 3, …
  const seasons = [];
  for (const card of cards) {
    if (!isPureSeasonTitle(card.title, base)) continue; // spin-off / movie / subtitled extra
    const season = seasonOf(card, base); // numeric, or null for a kept "Final Season"
    const slugId = card.url ? String(card.url).split('/').pop() : (card.id && `${card.id}`) || '';
    if (!slugId) continue;
    const part = parsePartNumber(card.title);
    const slugIdFromUrl = card.url ? String(card.url).split('/').pop() : null;
    const isCurrent = currentIdOf(clean)
      ? String(card.id) === String(currentIdOf(clean))
      : !!slugIdFromUrl && slugIdFromUrl === (clean.split('/').pop() || '');
    seasons.push({
      id: slugId,
      title: card.title,
      jname: card.jname,
      poster: card.poster,
      type: card.type,
      episodes: card.episodes,
      year: null,
      isCurrent,
      season,
      part,
      order: null,
    });
  }

  // Stable ordering by season/part; entries without a parsed number (e.g. an
  // unnumbered "Final Season", season 99) fall after the numbered ones, then
  // assign an explicit `order` so the frontend never has to guess.
  seasons.sort((a, b) => {
    const sa = a.season ?? 99;
    const sb = b.season ?? 99;
    if (sa !== sb) return sa - sb;
    return (a.part ?? 0) - (b.part ?? 0);
  });
  seasons.forEach((s, i) => (s.order = i));

  return {
    source: `${HIANIME_BASE_URL}/search?keyword=${encodeURIComponent(base)}`,
    keyword: base,
    base,
    total: seasons.length,
    seasons,
  };
};

// Numeric id extracted from a slug-id ("one-piece-1" → "1"); null when bare slug.
const currentIdOf = (clean) => parseAnimeSlug(clean)?.id || null;
