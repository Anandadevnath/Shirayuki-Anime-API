import { fetchPage, extractFlwItems, extractPagination } from './_shared.js';

export const getHianimeGenre = async ({ genre, page } = {}) => {
  const slug = String(genre || '').trim().toLowerCase();
  if (!slug) {
    throw new Error('genre path parameter is required');
  }
  const normalizedPage = Number(page) > 0 ? Number(page) : 1;

  const { url, $ } = await fetchPage(`/genre/${slug}`, {
    searchParams: { page: normalizedPage },
    referer: 'https://hianime.ad/',
  });

  return {
    source: url,
    genre: slug,
    pagination: extractPagination($),
    results: extractFlwItems($),
  };
};
