import { load } from '../../utils/scrapper-deps.js';
import { ANIMEKAI_BASE_URL, pageGet } from './_shared.js';

// az-list letter values: 0-9, A-Z, "other"
const VALID_LETTERS = ['0-9', 'other', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];

const normalizeLetter = (letter) => {
  const raw = String(letter || '').trim().toUpperCase();
  if (raw === '0-9' || raw === 'OTHER' || raw === '#') return raw === '#' ? '0-9' : raw.toLowerCase() === 'other' ? 'other' : '0-9';
  if (/^[A-Z]$/.test(raw)) return raw;
  return null;
};

// Parse pagination from ul.pagination.
const parsePagination = ($, baseUrl) => {
  const items = $('.pagination .page-item');
  if (!items.length) return { currentPage: 1, hasNextPage: false, lastPage: 1, totalPages: 1 };

  const currentPage = Number($('.pagination .page-item.active').first().text().trim()) || 1;
  const pageNumbers = $('.pagination a.page-link, .pagination span.page-link')
    .map((_, el) => $(el).text().trim())
    .get()
    .filter((t) => /^\d+$/.test(t))
    .map(Number);

  // A trailing "»"/next link reveals more pages beyond the visible numbers.
  const nextHref = $('.pagination a[title*="Next"], .pagination a[rel="next"]').attr('href');
  const lastVisible = Math.max(...$('.pagination .page-item')
    .map((_, el) => Number($(el).text().trim()) || 0)
    .get(), 0);

  const hasNextPage = Boolean(nextHref) || Boolean($('.pagination .page-item').last().find('a').length);
  const totalPages = lastVisible || 1;

  return {
    currentPage: Number($('.pagination .page-item.active').text().trim()) || 1,
    hasNextPage,
    totalPages,
    totalItems: null,
  };
};

const parseCards = ($, hrefRewrite) =>
  $('.aitem')
    .map((_, el) => {
      const card = $(el);
      const titleEl = card.find('a.title, .title').first();
      const href = card.find('a.poster, a.title, a').first().attr('href') || null;
      const poster = card.find('.poster img, img').first().attr('src') || null;
      const idMatch = href ? href.match(/-([a-z0-9]{6})(?:$|\?|\/)/i) : null;
      const subEp = card.find('.info span.sub').text().replace(/\D/g, '') || null;
      const dubEp = card.find('.info span.dub').text().replace(/\D/g, '') || null;
      const score = card.find('.info .score').text().replace(/[^\d.]/g, '') || null;

      return {
        id: idMatch ? idMatch[1] : null,
        title: titleEl.text().trim() || card.find('img').attr('alt') || null,
        jname: titleEl.attr('data-jp') || null,
        poster: card.find('.poster img, img').first().attr('src') || null,
        url: href || null,
        episodes: {
          sub: subEp ? Number(subEp) : null,
          dub: dubEp ? Number(dubEp) : null,
        },
        type: card.find('.info .type b').first().text().trim() || null,
        score: score ? Number(score) : null,
        genres: card
          .find('.genres a[href*="/genre/"]')
          .map((__, a) => $(a).text().trim())
          .get()
          .filter(Boolean),
      };
    })
    .get();

export const getAnimeKaiAzList = async ({ letter, page } = {}) => {
  const raw = String(letter || '').trim();
  if (!raw) {
    const err = new Error('letter path parameter is required (0-9, A-Z, other)');
    err.status = 400;
    throw err;
  }

  const normalized = normalizeLetter(raw);
  if (!normalized) {
    const err = new Error('letter must be 0-9, a single A-Z letter, or "other"');
    err.status = 400;
    throw err;
  }

  const normalizedPage = Math.max(1, Number(page) || 1);
  const url = `${ANIMEKAI_BASE_URL}/az-list/${normalized}?page=${normalizedPage}`;
  const html = await pageGet(url, `${ANIMEKAI_BASE_URL}/home`);
  const $ = load(html);

  const results = $('.aitem')
    .map((_, el) => {
      const card = $(el);
      const titleEl = card.find('a.title, .title').first();
      const href = card.find('a.poster, a.title, a').first().attr('href') || null;
      const idMatch = href ? href.match(/-([a-z0-9]{6})(?:$|\?)/i) : null;
      const subEp = card.find('.info span.sub').text().replace(/\D/g, '') || null;
      const dubEp = card.find('.info span.dub').text().replace(/\D/g, '') || null;
      const score = card.find('.info .score').text().replace(/[^\d.]/g, '') || null;

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
        score: score ? Number(score) : null,
        genres: card
          .find('.genres a[href*="/genre/"]')
          .map((__, a) => $(a).text().trim())
          .get()
          .filter(Boolean),
      };
    })
    .get();

  return {
    source: url,
    letter: normalized,
    pagination: parsePagination($),
    results,
  };
};
