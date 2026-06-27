import { fetchPage, extractTorrentRows, extractPagination, NYAA_BASE_URL } from './_shared.js';

const normalizeCategory = (value) => {
  const v = String(value || '1_2').trim();
  return /^[0-9]_[0-9]$/.test(v) ? v : '1_2';
};

const normalizeFilter = (value) => {
  const v = String(value || '0').trim();
  return /^[012]$/.test(v) ? v : '0';
};

export const getNyaaSearch = async ({ q, page, category, filter, sort, order } = {}) => {
  const keyword = String(q || '').trim();
  if (!keyword) {
    throw new Error('q query parameter is required');
  }
  const normalizedPage = Number(page) > 0 ? Number(page) : 1;
  const normalizedCategory = normalizeCategory(category);
  const normalizedFilter = normalizeFilter(filter);
  const sortKey = ['id', 'size', 'seeders', 'leechers', 'downloads', 'comments'].includes(sort)
    ? sort
    : null;
  const orderKey = ['asc', 'desc'].includes(String(order || '').toLowerCase())
    ? String(order).toLowerCase()
    : null;

  const searchParams = {
    q: keyword,
    c: normalizedCategory,
    f: normalizedFilter,
  };
  if (normalizedPage > 1) searchParams.p = normalizedPage;
  if (sortKey) searchParams.s = sortKey;
  if (orderKey) searchParams.o = orderKey;

  const { url, $ } = await fetchPage('/', {
    searchParams,
    referer: NYAA_BASE_URL,
  });

  const baseParams = { q: keyword, c: normalizedCategory, f: normalizedFilter };
  if (sortKey) baseParams.s = sortKey;
  if (orderKey) baseParams.o = orderKey;

  return {
    source: url,
    query: keyword,
    category: normalizedCategory,
    filter: normalizedFilter,
    sort: sortKey,
    order: orderKey,
    pagination: extractPagination($, '/', baseParams),
    results: extractTorrentRows($),
  };
};