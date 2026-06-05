import { fetchPage, extractFlwItems, extractPagination } from './_shared.js';

export const getHianimeProducer = async ({ producer, page } = {}) => {
  const slug = String(producer || '').trim().toLowerCase();
  if (!slug) {
    throw new Error('producer parameter is required');
  }

  const normalizedPage = Number(page) > 0 ? Number(page) : 1;

  const { url, $ } = await fetchPage(`/producers/${slug}`, {
    searchParams: { page: normalizedPage },
    referer: 'https://hianime.ad/',
  });

  return {
    source: url,
    producer: slug,
    pagination: extractPagination($),
    results: extractFlwItems($),
  };
};
