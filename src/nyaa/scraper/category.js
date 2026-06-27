import { fetchPage, extractTorrentRows, extractPagination, NYAA_BASE_URL, CATEGORIES } from './_shared.js';

const normalizeCategory = (value) => {
  const v = String(value || '1_2').trim();
  return /^[0-9]_[0-9]$/.test(v) ? v : '1_2';
};

const normalizeFilter = (value) => {
  const v = String(value || '0').trim();
  return /^[012]$/.test(v) ? v : '0';
};

export const getNyaaCategory = async ({ category, page, filter, query } = {}) => {
  const normalizedCategory = normalizeCategory(category);
  const normalizedFilter = normalizeFilter(filter);
  const normalizedPage = Number(page) > 0 ? Number(page) : 1;

  const searchParams = {
    c: normalizedCategory,
    f: normalizedFilter,
  };
  if (query) searchParams.q = String(query).trim();
  if (normalizedPage > 1) searchParams.p = normalizedPage;

  const { url, $ } = await fetchPage('/', {
    searchParams,
    referer: NYAA_BASE_URL,
  });

  return {
    source: url,
    category: normalizedCategory,
    categoryLabel: CATEGORIES[normalizedCategory] || null,
    filter: normalizedFilter,
    query: query ? String(query).trim() : null,
    pagination: extractPagination($),
    results: extractTorrentRows($),
  };
};