import { fetchPage, extractTorrentRows, extractPagination, NYAA_BASE_URL, CATEGORIES } from './_shared.js';

const ANIME_SUBCATEGORIES = ['1_2', '1_0'];

const fetchCategoryTorrents = async (category) => {
  const { url, $ } = await fetchPage('/', {
    searchParams: { c: category, p: 1 },
    referer: NYAA_BASE_URL,
  });
  return {
    category,
    categoryLabel: CATEGORIES[category] || null,
    source: url,
    results: extractTorrentRows($, $('table.torrent-list').first()).slice(0, 25),
  };
};

export const getNyaaHome = async () => {
  const sections = await Promise.all(
    ANIME_SUBCATEGORIES.map((cat) => fetchCategoryTorrents(cat).catch((error) => ({
      category: cat,
      categoryLabel: CATEGORIES[cat] || null,
      error: error.message,
      results: [],
    }))),
  );

  const english = sections.find((s) => s.category === '1_2') || { results: [] };
  const anime = sections.find((s) => s.category === '1_0') || { results: [] };

  return {
    source: NYAA_BASE_URL,
    sections: {
      englishTranslated: english,
      anime: anime,
    },
    featured: english.results?.slice(0, 15) || [],
  };
};