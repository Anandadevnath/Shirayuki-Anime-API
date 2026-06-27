import { fetchPage, NYAA_BASE_URL } from './_shared.js';

export const getNyaaSearchSuggestions = async ({ q, limit = 10 } = {}) => {
  const keyword = String(q || '').trim();
  if (!keyword) {
    throw new Error('q query parameter is required');
  }

  const { url, $ } = await fetchPage('/', {
    searchParams: { q: keyword, c: '1_2', f: '0' },
    referer: NYAA_BASE_URL,
  });

  const titles = new Set();
  $('table.torrent-list tbody tr').each((_, el) => {
    const $row = $(el);
    const $titleAnchor = $row.find('td').eq(1).find('a').not('.comments').first();
    const title = $titleAnchor.attr('title') || $titleAnchor.text().trim();
    if (title) titles.add(title);
  });

  const suggestions = Array.from(titles).slice(0, Math.max(1, Number(limit) || 10));

  return {
    source: url,
    query: keyword,
    suggestions,
  };
};