import { load } from '../../utils/scrapper-deps.js';
import {
  HIANIME_BASE_URL,
  pageGet,
  parseAnimeSlug,
} from './_shared.js';
import { extractFlwItems } from './cards.js';

// ─────────────────────────────────────────────────────────────────────────────
// Franchise seasons.
//
// hianime.at ships NO first-class "seasons" block on detail/watch pages (probed:
// there is no block_area-relation, no embedded JSON, and the theme API has no
// /related or /seasons route — only /characters). The reliable sibling source is
// the site's own search: franchise entries share a base title plus a trailing
// season marker ("Season 4", "2nd Season", "Part 2", …). So we normalise the
// current title to its base, grep the search results for entries whose title
// contains that base, and turn the matches into ordered SeasonModels.
// ─────────────────────────────────────────────────────────────────────────────

// First season/part marker in a title (boundary-safe). Covers:
//   "Season 2" "Season 2 Part 2" "2nd Season" "3rd Season" "Final Season"
//   "Part 2" "S2"
const FIRST_SEASON_MARKER =
  /(?:\bSeason\s*\d+(?:\s*[-:(]\s*\d+)?\b)|(?:\b\d+(?:st|nd|rd|th)\s*Season\b)|(?:\bS\d+\b)|(?:\bPart\s*\d+\b)|(?:\bFinal\s*Season\b)/i;

// "Foo Season 4" → "Foo"; "Franchise 2nd Season" → "Franchise"; "Foo Part 2" → "Foo".
const toBaseTitle = (title) => {
  const t = String(title || '').trim();
  if (!t) return '';
  const m = FIRST_SEASON_MARKER.exec(t);
  const base = m ? t.slice(0, m.index) : t;
  return base.replace(/[s:,;|/._-]+$/g, '').trim();
};

// Season number from a title ("Season 4"/"4th Season"/"Part 2"/"S2" → 4/2, null).
const parseSeasonNumber = (title) => {
  const t = String(title || '');
  let m;
  if ((m = t.match(/Season\s*(\d+)/i))) return Number(m[1]);
  if ((m = t.match(/\b(\d+)(?:st|nd|rd|th)\s*Season\b/i))) return Number(m[1]);
  if ((m = t.match(/\bS(\d+)\b/i))) return Number(m[1]);
  return null;
};

// Part number from a title ("Part 2" → 2). Only meaningful alongside a season;
// a bare "Part 2" gets season 1 (i.e. treated as season 1 part 2).
const parsePartNumber = (title) => {
  const m = String(title || '').match(/\bPart\s*(\d+)\b/i);
  return m ? Number(m[1]) : null;
};

const normalize = (v) =>
  String(v || '')
    .trim()
    .toLowerCase()
    // strip trailing season markers for comparison ("Blue Lock Season 2" vs "Blue Lock").
    .replace(
      /(?:\s*Season\s*\d+(?:\s*[-:.]?\s*\d+)?)|(?:\s*\d+(?:st|nd|rd|th)\s*Season)|(?:\s*S\d+)|(?:\s*Part\s*\d+)|(?:\s*Final\s*Season)/,
      '',
    )
    .replace(/[^0-9a-z]+/g, ' ');

export const getHianimeSeasons = async ({ animeId } = {}) => {
  const raw = String(animeId || '').trim();
  if (!raw) {
    const err = new Error('animeId path parameter is required (e.g. one-piece-8719)');
    err.status = 400;
    throw err;
  }
  const clean = raw.replace(/^\/+|\/+$/g, '');
  const current = parseAnimeSlug(clean);

  // 1. Resolve the current title from the detail page.
  const detailUrl = `${HIANIME_BASE_URL}/${clean}`;
  const detailHtml = await pageGet(detailUrl);
  const $ = load(detailHtml);
  const titleEl = $('h2.film-name.dynamic-name, .anisc-detail h2').first();
  const fullTitle = (titleEl.text().trim() || titleEl.attr('data-jname') || '')
    .replace(/\s+/g, ' ')
    .trim();

  const base = toBaseTitle(fullTitle);
  if (!base) {
    return { source: detailUrl, total: 0, seasons: [] };
  }

  // 2. Search the franchise base (append " Season" so results are siblings,
  //    not the first page of the whole catalogue), bounded to 2 pages.
  const keyword = `${base} Season`;
  const cards = [];
  for (let page = 1; page <= 2; page++) {
    const html = await pageGet(
      `${HIANIME_BASE_URL}/search?keyword=${encodeURIComponent(keyword)}&page=${page}`,
    );
    const $page = load(html);
    const found = extractFlwItems($page, '#main-content .flw-item');
    if (!found.length) break;
    cards.push(...found);
    if (found.length < 25) break; // last page — stop early
  }

  // 3. Keep franchise siblings (title contains base title).
  const normBase = normalize(base);
  const seen = new Set();
  const seasons = [];
  for (const card of cards) {
    if (!(card.title || card.jname)) continue;
    const hay = normalize(`${card.title} ${card.jname || ''}`);
    if (!hay.includes(normBase)) continue;
    const slugId = card.url ? String(card.url).split('/').pop() : (card.id && `${card.id}`) || '';
    if (!slugId || seen.has(slugId)) continue;
    seen.add(slugId);
    const season = parseSeasonNumber(card.title);
    const part = parsePartNumber(card.title);
    // numeric id comparison is authoritative for slug-id inputs; fall back to
    // URL equality for bare-slug inputs (defensive, rarely reached).
    const slugIdFromUrl = card.url ? String(card.url).split('/').pop() : null;
    const isCurrent = current?.id
      ? String(card.id) === String(current.id)
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

  // 4. Stable ordering by season/part (specials fall after numbered entries),
  //    then assign an explicit `order` so the frontend never has to guess.
  seasons.sort((a, b) => {
    const sa = a.season ?? 99;
    const sb = b.season ?? 99;
    if (sa !== sb) return sa - sb;
    return (a.part ?? 0) - (b.part ?? 0);
  });
  seasons.forEach((s, i) => (s.order = i));

  return { source: `${HIANIME_BASE_URL}/search?keyword=${encodeURIComponent(keyword)}`, total: seasons.length, seasons };
};
