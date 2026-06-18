import { fetchPage, extractFlwItems, extractPagination } from './_shared.js';

const KNOWN_CATEGORIES = new Set([
  'most-popular',
  'most-favorite',
  'top-airing',
  'recently-updated',
  'recently-added',
  'latest-completed',
  'subbed-anime',
  'dubbed-anime',
  'movie',
  'tv',
  'ova',
  'ona',
  'special',
]);

export const getHianimeCategory = async ({ category, page } = {}) => {
  const slug = String(category || '').trim().toLowerCase();
  if (!slug) {
    throw new Error('category path parameter is required');
  }
  const normalizedPage = Number(page) > 0 ? Number(page) : 1;

  const { url, $ } = await fetchPage(`/${slug}`, {
    searchParams: { page: normalizedPage },
    referer: 'https://hianime.ad/',
  });

  return {
    source: url,
    category: slug,
    isKnown: KNOWN_CATEGORIES.has(slug),
    pagination: extractPagination($),
    results: extractFlwItems($),
  };
};
