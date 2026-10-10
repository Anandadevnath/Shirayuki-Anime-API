import { load } from '../../utils/scrapper-deps.js';
import { HIANIME_BASE_URL, pageGet, parseAnimeSlug, toAbsoluteUrl } from './_shared.js';

// Autocomplete: fetch the keyword search page and return a compact list of the
// top matching titles. HiAnime has no public JSON suggestion endpoint, so we
// reuse the (paginated) search results and slice the first page.
export const getHianimeSearchSuggestion = async ({ q } = {}) => {
  const keyword = String(q || '').trim();
  if (!keyword) {
    const err = new Error('q query parameter is required');
    err.status = 400;
    throw err;
  }

  const url = `${HIANIME_BASE_URL}/search?keyword=${encodeURIComponent(keyword)}`;
  const html = await pageGet(url);
  const $ = load(html);

  const suggestions = $('#main-content .flw-item')
    .map((_, el) => {
      const card = $(el);
      const href = card.find('.film-poster a').attr('href') || null;
      const { id } = parseAnimeSlug(href) || {};
      const name = card.find('.dynamic-name').first();
      const img = card.find('.film-poster-img').first();
      return {
        id,
        title: name.text().trim() || img.attr('alt') || null,
        jname: name.attr('data-jname') || name.attr('data-en') || null,
        poster: toAbsoluteUrl(img.attr('data-src') || img.attr('src')),
        type: card.find('.fd-infor .fdi-item').first().text().trim() || null,
        url: href ? toAbsoluteUrl(href) : null,
      };
    })
    .get()
    .filter((s) => s.id || s.title)
    .slice(0, 10);

  return { query: keyword, suggestions };
};
