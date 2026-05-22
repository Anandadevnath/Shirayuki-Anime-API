import { fetchPage, extractFlwItems, extractPagination } from './_shared.js';

export const getHianimeSearch = async ({ q, page } = {}) => {
  const keyword = String(q || '').trim();
  if (!keyword) {
    throw new Error('q query parameter is required');
  }
  const normalizedPage = Number(page) > 0 ? Number(page) : 1;

  const { url, $ } = await fetchPage('/filter', {
    searchParams: { keyword, page: normalizedPage },
    referer: 'https://hianime.ad/',
  });

  return {
    source: url,
    query: keyword,
    pagination: extractPagination($),
    results: extractFlwItems($),
  };
};
