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

const parsePagination = ($) => {
  const items = $('.pagination .page-item');
  if (!items.length) {
    return { currentPage: 1, hasNextPage: false, totalPages: 1 };
  }

  const currentPage = Number($('.pagination .page-item.active').first().text().trim()) || 1;

  // The "»" last item is a next link when it contains an anchor.
  const lastItem = $('.pagination .page-item').last();
  const hasNextPage = lastItem.find('a').length > 0;

  // Highest plain-numbered page visible.
  let totalPages = currentPage;
  $('.pagination .page-item').each((_, el) => {
    const n = Number($(el).text().trim());
    if (Number.isFinite(n) && n > totalPages) totalPages = n;
  });
  if (hasNextPage) totalPages = Math.max(totalPages, currentPage + 1);

  return { currentPage, hasNextPage, totalPages };
};

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
    pagination: parsePagination($),
    results: $('.aitem').map(parseGridCard($)).get(),
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
    pagination: parsePagination($),
    results: $('.aitem').map(parseGridCard($)).get(),
  };
};

// Advanced search maps onto AnimeKai's /filter query params.
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
  const params = new URLSearchParams();
  params.set('page', String(normalizedPage));

  const keyword = String(q || '').trim();
  if (keyword) params.set('keyword', keyword);

  const VALID_TYPES = ['movie', 'music', 'ona', 'ova', 'special', 'tv', 'tv-short', 'tv-special'];
  const typeList = String(type || '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter((t) => VALID_TYPES.includes(t));
  typeList.forEach((t) => params.append('term_type[]', t));

  const genreList = String(genres || '')
    .split(',')
    .map((g) => g.trim().toLowerCase())
    .filter(Boolean);
  genreList.forEach((g) => params.append('genre[]', g));

  const VALID_STATUS = ['finished-airing', 'currently-airing', 'not-yet-aired'];
  const statusList = String(status || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => VALID_STATUS.includes(s));
  statusList.forEach((s) => params.append('status[]', s));

  if (Number(season) > 0) params.set('season[]', String(Number(season)));
  if (Number(year) > 0) params.set('year[]', String(Number(year)));

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
  if (sortVal && VALID_SORTS.includes(sortVal)) params.set('sort', sortVal);

  const VALID_LANGS = ['sub', 'dub'];
  const langList = String(language || '')
    .split(',')
    .map((l) => l.trim().toLowerCase())
    .filter((l) => VALID_LANGS.includes(l));
  langList.forEach((l) => params.append('language[]', l));

  const url = `${ANIMEKAI_BASE_URL}/filter?${params.toString()}`;
  const html = await pageGet(url, `${ANIMEKAI_BASE_URL}/home`);
  const $ = load(html);

  const totalRaw = $('.list-count').first().text().replace(/[^\d]/g, '');

  return {
    source: url,
    query: keyword || null,
    filters: {
      types: typeList,
      genres: genreList,
      season: Number(season) > 0 ? Number(season) : null,
      year: Number(year) > 0 ? Number(year) : null,
      status: statusList,
      sort: VALID_SORTS.includes(sortVal) ? sortVal : null,
      language: langList,
    },
    total: totalRaw ? Number(totalRaw) : null,
    pagination: parsePagination($),
    results: $('.aitem').map(parseGridCard($)).get(),
  };
};
