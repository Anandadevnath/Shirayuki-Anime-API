import { load } from '../../utils/scrapper-deps.js';
import { ANIKOTO_BASE_URL, pageGet, parseAnimeSlug } from '../_shared.js';

const digits = (value) => {
  const n = Number(String(value || '').replace(/\D/g, ''));
  return Number.isFinite(n) ? n : null;
};

// Search results use the same grid-card as home (.ani.items .item).
const parseSearchCard = ($) => (_, el) => {
  const card = $(el);
  const titleEl = card.find('.name.d-title, .name.d-title').first();
  const img = card.find('img').first();
  const hrefs = [];
  card.find('a[href*="/watch/"]').each((_, a) => hrefs.push($(a).attr('href')));
  const href = hrefs[0] || null;
  const watchUrl = href ? href.replace(/\/ep-\d+.*$/, '') : null;
  const parsed = parseAnimeSlug(watchUrl);
  const left = card.find('.meta .inner .left, .meta .left');
  const ep = (sel) => digits(left.find(sel).text());

  const genres = card
    .find('.genre a[href*="/genre/"]')
    .map((__, a) => $(a).text().trim())
    .get()
    .filter(Boolean);

  return {
    id: card.find('[data-tip]').first().attr('data-tip') || null,
    title: titleEl.text().trim() || img.attr('alt') || null,
    jname: titleEl.attr('data-jp') || null,
    poster: img.attr('src') || null,
    url: watchUrl,
    episodes: {
      sub: ep('.ep-status.sub'),
      dub: ep('.ep-status.dub'),
      total: ep('.ep-status.total'),
    },
    type: (card.find('.meta .right').text().trim() || '').trim() || null,
    genres,
    slug: parsed?.slug || null,
    animeId: parsed?.animeId || null,
  };
};

// Bootstrap-style pagination (.pagination). Current page is marked .active,
// Next/Last links carry rel="next"/rel="last" (or title="Next"/"Last").
const parsePagination = ($, fallbackPage = 1) => {
  const pag = $('.pre-pagination .pagination, .pagination').first();
  const items = pag.find('.page-item');
  if (!items.length) {
    return { currentPage: fallbackPage, hasNextPage: false, totalPages: 1 };
  }

  const currentPage = Number(pag.find('.page-item.active').first().text().trim()) || fallbackPage;
  const hasNextPage =
    pag.find('a[rel="next"]').length > 0 ||
    pag.find('a[title="Next" i]').length > 0;

  let totalPages = 0;
  pag.find('.page-item').each((_, el) => {
    const n = Number($(el).text().trim());
    if (Number.isFinite(n) && n > totalPages) totalPages = n;
  });
  const lastHref =
    pag.find('a[rel="last"]').attr('href') ||
    pag.find('a[title="Last" i]').attr('href');
  if (lastHref) {
    const m = lastHref.match(/page=(\d+)/i);
    if (m) totalPages = Math.max(totalPages, Number(m[1]));
  }
  if (hasNextPage) totalPages = Math.max(totalPages, currentPage + 1);

  return { currentPage, hasNextPage, totalPages };
};

export const getAnikotoSearch = async ({ q, page } = {}) => {
  const keyword = String(q || '').trim();
  if (!keyword) {
    const err = new Error('q query parameter is required');
    err.status = 400;
    throw err;
  }

  const normalizedPage = Math.max(1, Number(page) || 1);
  const params = new URLSearchParams({ keyword });
  if (normalizedPage > 1) params.set('page', String(normalizedPage));

  const url = `${ANIKOTO_BASE_URL}/filter?${params.toString()}`;
  const html = await pageGet(url, `${ANIKOTO_BASE_URL}/`);
  const $ = load(html);

  return {
    source: url,
    query: keyword,
    pagination: parsePagination($, normalizedPage),
    results: $('.ani.items .item').map(parseSearchCard($)).get(),
  };
};

// No dedicated autocomplete endpoint (404) — reuse the filter page top results.
export const getAnikotoSearchSuggestion = async ({ q } = {}) => {
  const keyword = String(q || '').trim();
  if (!keyword) {
    const err = new Error('q query parameter is required');
    err.status = 400;
    throw err;
  }

  const url = `${ANIKOTO_BASE_URL}/filter?keyword=${encodeURIComponent(keyword)}`;
  const html = await pageGet(url, `${ANIKOTO_BASE_URL}/`);
  const $ = load(html);

  const suggestions = $('.ani.items .item')
    .map(parseSearchCard($))
    .get()
    .slice(0, 10)
    .map((it) => ({
      id: it.id,
      title: it.title,
      jname: it.jname,
      poster: it.poster,
      url: it.url,
      type: it.type,
      episodes: it.episodes,
    }));

  return { query: keyword, suggestions };
};