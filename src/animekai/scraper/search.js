import { load } from '../../utils/scrapper-deps.js';
import { ANIMEKAI_BASE_URL, pageGet, parseAnimeSlug } from './_shared.js';

// Shared grid-card parser for az-list and filter pages.
const parseGridCard = ($) => (_, el) => {
  const card = $(el);
  const titleEl = card.find('a.title, .title').first();
  const href = card.find('a.poster, a.title, a').first().attr('href') || null;
  const idMatch = href ? href.match(/-([a-z0-9]{6})(?:$|\?)/i) : null;
  const subEp = card.find('.info span.sub').text().replace(/\D/g, '') || null;
  const dubEp = card.find('.info span.dub').text().replace(/\D/g, '') || null;
  const scoreRaw = card.find('.info .score').text().replace(/[^\d.]/g, '') || null;

  return {
    id: idMatch ? idMatch[1] : null,
    title: titleEl.text().trim() || card.find('img').attr('alt') || null,
    jname: titleEl.attr('data-jp') || null,
    poster: card.find('.poster img, img').first().attr('src') || null,
    url: href,
    episodes: {
      sub: subEp ? Number(subEp) : null,
      dub: dubEp ? Number(dubEp) : null,
    },
    type: card.find('.info .type b').first().text().trim() || null,
    score: scoreRaw ? Number(scoreRaw) : null,
    genres: card
      .find('.genres a[href*="/genre/"]')
      .map((__, a) => $(a).text().trim())
      .get()
      .filter(Boolean),
  };
};

// Pagination uses Bootstrap-style page-items. The site marks the current page
// with .active and Next/Last links with rel="next"/rel="last". On out-of-range
// pages (page > real last) there is no .active and no rel="next"/"last" at all,
// so the requested page number is used as the currentPage fallback.
const parsePagination = ($, fallbackPage = 1) => {
  const items = $('.pagination .page-item');
  if (!items.length) {
    return { currentPage: fallbackPage, hasNextPage: false, totalPages: 1 };
  }

  const currentPage =
    Number($('.pagination .page-item.active').first().text().trim()) || fallbackPage;

  // rel="next" only exists while more pages follow; it disappears on the last
  // page and on out-of-range pages.
  const hasNextPage = $('.pagination a[rel="next"]').length > 0;

  // True last page from the rel="last" link, else the highest visible number.
  let totalPages = 0;
  $('.pagination .page-item').each((_, el) => {
    const n = Number($(el).text().trim());
    if (Number.isFinite(n) && n > totalPages) totalPages = n;
  });
  const lastHref = $('.pagination a[rel="last"]').attr('href');
  if (lastHref) {
    const m = lastHref.match(/page=(\d+)/i);
    if (m) totalPages = Math.max(totalPages, Number(m[1]));
  }
  if (hasNextPage) totalPages = Math.max(totalPages, currentPage + 1);

  return { currentPage, hasNextPage, totalPages };
};

// Grid cards live in #list-items. Selecting a bare .aitem also matches the
// "Top Rated" sidebar cards (a.aitem.side-item), which have no poster, href,
// type or genres and must not appear as results.
const listResults = ($) => $('#list-items .aitem').map(parseGridCard($)).get();


export const getAnimeKaiAzList = async ({ letter, page } = {}) => {
  const raw = String(letter || '').trim();
  if (!raw) {
    const err = new Error('letter path parameter is required (0-9, A-Z, other)');
    err.status = 400;
    throw err;
  }

  const up = raw.toUpperCase();
  let normalized;
  if (up === '0-9' || up === '#') normalized = '0-9';
  else if (up === 'OTHER') normalized = 'other';
  else if (/^[A-Z]$/.test(up)) normalized = up;
  else {
    const err = new Error('letter must be 0-9, a single A-Z letter, or "other"');
    err.status = 400;
    throw err;
  }

  const normalizedPage = Math.max(1, Number(page) || 1);
  const url = `${ANIMEKAI_BASE_URL}/az-list/${normalized}?page=${normalizedPage}`;
  const html = await pageGet(url, `${ANIMEKAI_BASE_URL}/home`);
  const $ = load(html);

  return {
    source: url,
    letter: normalized,
    pagination: parsePagination($, normalizedPage),
    results: listResults($),
  };
};

export const getAnimeKaiSearch = async ({ q, page } = {}) => {
  const keyword = String(q || '').trim();
  if (!keyword) {
    const err = new Error('q query parameter is required');
    err.status = 400;
    throw err;
  }

  const normalizedPage = Math.max(1, Number(page) || 1);
  const url = `${ANIMEKAI_BASE_URL}/filter?keyword=${encodeURIComponent(keyword)}&page=${normalizedPage}`;
  const html = await pageGet(url, `${ANIMEKAI_BASE_URL}/home`);
  const $ = load(html);

  const totalRaw = $('.list-count').first().text().replace(/[^\d]/g, '');

  return {
    source: url,
    query: keyword,
    total: totalRaw ? Number(totalRaw) : null,
    pagination: parsePagination($, normalizedPage),
    results: listResults($),
  };
};

// Advanced search maps onto AnimeKai's /filter query params.
// A single execution given normalized filter values. Reused so we can relax
// (drop) filters and re-query when a strict combination yields no results.
const runAdvancedFilter = async ({
  keyword,
  types,
  genres,
  season,
  year,
  statuses,
  sort,
  languages,
  page,
}) => {
  const params = new URLSearchParams();
  params.set('page', String(page));
  if (keyword) params.set('keyword', keyword);
  types.forEach((t) => params.append('term_type[]', t));
  genres.forEach((g) => params.append('genre[]', g));
  statuses.forEach((s) => params.append('status[]', s));
  if (Number(season) > 0) params.set('season[]', String(Number(season)));
  if (Number(year) > 0) params.set('year[]', String(Number(year)));
  if (sort) params.set('sort', sort);
  languages.forEach((l) => params.append('language[]', l));

  const url = `${ANIMEKAI_BASE_URL}/filter?${params.toString()}`;
  const html = await pageGet(url, `${ANIMEKAI_BASE_URL}/home`);
  const $ = load(html);

  const totalRaw = $('.list-count').first().text().replace(/[^\d]/g, '');

  return {
    source: url,
    query: keyword || null,
    filters: {
      types,
      genres,
      season: Number(season) > 0 ? Number(season) : null,
      year: Number(year) > 0 ? Number(year) : null,
      status: statuses,
      sort: sort || null,
      language: languages,
    },
    total: totalRaw ? Number(totalRaw) : null,
    pagination: parsePagination($, page),
    results: listResults($),
  };
};

export const getAnimeKaiSearchAdvanced = async ({
  q,
  type,
  genres,
  season,
  year,
  status,
  sort,
  language,
  page,
} = {}) => {
  const normalizedPage = Math.max(1, Number(page) || 1);

  const keyword = String(q || '').trim();

  const VALID_TYPES = ['movie', 'music', 'ona', 'ova', 'special', 'tv', 'tv-short', 'tv-special'];
  const types = String(type || '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter((t) => VALID_TYPES.includes(t));

  const GENRES_IN = String(genres || '')
    .split(',')
    .map((g) => g.trim().toLowerCase())
    .filter(Boolean);

  const VALID_STATUS = ['finished-airing', 'currently-airing', 'not-yet-aired'];
  const statuses = String(status || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => VALID_STATUS.includes(s));

  const VALID_SORTS = [
    'default',
    'latest-updated',
    'latest-added',
    'score',
    'name-az',
    'release-date',
    'most-viewed',
    'number_of_episodes',
  ];
  const sortVal = String(sort || '').toLowerCase();
  const sortClean = VALID_SORTS.includes(sortVal) ? sortVal : null;

  const VALID_LANGS = ['sub', 'dub'];
  const languages = String(language || '')
    .split(',')
    .map((l) => l.trim().toLowerCase())
    .filter((l) => VALID_LANGS.includes(l));

  const seasonVal = Number(season) > 0 ? Number(season) : null;
  const yearVal = Number(year) > 0 ? Number(year) : null;

  const base = {
    keyword,
    types,
    genres: GENRES_IN,
    season: seasonVal,
    year: yearVal,
    sort: sortClean,
    languages,
    page: normalizedPage,
  };

  // 1) Run the strict query with every requested filter.
  let out = await runAdvancedFilter({ ...base, statuses });

  // 2) Auto-relax: if the strict combination yields nothing but a status filter
  //    was applied, re-run WITHOUT the status filter (the most common cause of a
  //    contradictory "no results" — e.g. a finished title marked currently-airing)
  //    and mark the response with fallback:true so callers know filters were relaxed.
  let fallback = false;
  if (out.results.length === 0 && statuses.length > 0) {
    fallback = true;
    out = await runAdvancedFilter({ ...base, statuses: [] });
  }

  return { ...out, fallback };
};
