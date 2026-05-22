import { fetchPage, extractFlwItems, extractPagination } from './_shared.js';

const VALID_LETTERS = new Set([
  'all',
  '0-9',
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
]);

const normalizeLetter = (raw) => {
  if (!raw) return 'all';
  const upper = String(raw).trim().toUpperCase();
  if (VALID_LETTERS.has(upper)) return upper;
  if (upper === '09' || upper === '0_9') return '0-9';
  return 'all';
};

export const getHianimeAzlist = async ({ letter, page } = {}) => {
  const normalizedLetter = normalizeLetter(letter);
  const normalizedPage = Number(page) > 0 ? Number(page) : 1;

  const { url, $ } = await fetchPage(`/az-list/${normalizedLetter}`, {
    searchParams: { page: normalizedPage },
    referer: 'https://hianime.ad/',
  });

  return {
    source: url,
    letter: normalizedLetter,
    pagination: extractPagination($),
    results: extractFlwItems($),
  };
};
