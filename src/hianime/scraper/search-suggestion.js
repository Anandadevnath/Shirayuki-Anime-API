import {
  fetchPage,
  extractPosterFromImg,
  getAnimeId,
  toAbsoluteUrl,
} from './_shared.js';

export const getHianimeSearchSuggestion = async ({ q } = {}) => {
  const keyword = String(q || '').trim();
  if (!keyword) {
    throw new Error('q query parameter is required');
  }

  const { url, $ } = await fetchPage('/filter', {
    searchParams: { keyword },
    referer: 'https://hianime.ad/',
    xhr: true,
  });

  const suggestions = $('a.nav-item')
    .map((_, el) => {
      const $a = $(el);
      const href = $a.attr('href')?.trim() || null;
      const $name = $a.find('.film-name').first();
      const $img = $a.find('.film-poster img').first();
      const infoText = $a.find('.film-infor').first().text().trim() || null;

      return {
        id: getAnimeId(href),
        title: $name.text().trim() || null,
        jname: $name.attr('data-jname')?.trim() || null,
        aliases: $a.find('.alias-name').first().text().trim() || null,
        href,
        url: toAbsoluteUrl(href),
        poster: extractPosterFromImg($img),
        info: infoText,
      };
    })
    .get()
    .filter((item) => item.id);

  return {
    source: url,
    query: keyword,
    suggestions,
  };
};
