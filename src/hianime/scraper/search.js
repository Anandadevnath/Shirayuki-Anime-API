import { load } from '../../utils/scrapper-deps.js';
import { HIANIME_BASE_URL, pageGet } from './_shared.js';
import { extractFlwItems, extractPagination } from './cards.js';

// Results always live in the #main-content film grid.
const listResults = ($) =>
  $('.film_list-wrap .flw-item').length
    ? extractFlwItems($, '.film_list-wrap .flw-item')
    : extractFlwItems($, '#main-content .flw-item');

// Generic listing fetch: path is the relative page URL (e.g. /search, /az-list, /most-popular).
const fetchListing = async ({ path, queryPage }) => {
  const url = `${HIANIME_BASE_URL}${path}`;
  const html = await pageGet(url);
  const $ = load(html);
  const results = listResults($);
  const heading = $('#main-content .cat-heading').first().text().trim() || null;
  return {
    source: url,
    heading,
    results,
    pagination: extractPagination($, queryPage),
  };
};

export const getHianimeSearch = async ({ q, page } = {}) => {
  const keyword = String(q || '').trim();
  if (!keyword) {
    const err = new Error('q query parameter is required');
    err.status = 400;
    throw err;
  }
  const queryPage = Math.max(1, Number(page) || 1);
  const params = new URLSearchParams({ keyword, page: String(queryPage) });
  return fetchListing({ path: `/search?${params.toString()}`, queryPage });
};

// Curated lists under a top-level path (/az-list, /tv, /movie, /most-popular,
// /top-airing, /upcoming). Mirrors animekai's az-list surface.
export const getHianimeBrowse = async ({ category, page } = {}) => {
  const clean = String(category || '').trim().replace(/^\/+|\/+$/g, '');
  if (!clean) {
    const err = new Error('category path parameter is required (e.g. az-list, most-popular, tv)');
    err.status = 400;
    throw err;
  }
  const queryPage = Math.max(1, Number(page) || 1);
  return fetchListing({ path: `/${clean}?page=${queryPage}`, queryPage });
};

export const getHianimeGenre = async ({ genre, page } = {}) => {
  const clean = String(genre || '').trim().replace(/^\/+|\/+$/g, '');
  if (!clean) {
    const err = new Error('genre path parameter is required');
    err.status = 400;
    throw err;
  }
  const queryPage = Math.max(1, Number(page) || 1);
  return fetchListing({ path: `/genre/${clean}?page=${queryPage}`, queryPage });
};
