import { load } from '../../utils/scrapper-deps.js';
import { ANIMEKAI_BASE_URL, ajaxGet } from './_shared.js';

// Autocomplete via ajax/anime/search?keyword=... -> { status, result: { html } }
export const getAnimeKaiSearchSuggestion = async ({ q } = {}) => {
  const keyword = String(q || '').trim();
  if (!keyword) {
    const err = new Error('q query parameter is required');
    err.status = 400;
    throw err;
  }

  const data = await ajaxGet(
    `/ajax/anime/search?keyword=${encodeURIComponent(keyword)}`,
    `${ANIMEKAI_BASE_URL}/`,
  );

  const html = data?.result?.html || data?.result || '';
  const $ = load(html);

  const suggestions = $('a.aitem, a.item')
    .map((_, el) => {
      const card = $(el);
      const href = card.attr('href') || null;
      const idMatch = href ? href.match(/-([a-z0-9]{6})(?:$|\?)/i) : null;
      const scoreRaw = card.find('.info span i.fa-star').parent().text().replace(/[^\d.]/g, '') || null;
      const yearRaw = card.find('.info span').last().text().trim();

      return {
        id: idMatch ? idMatch[1] : null,
        title: card.find('.title, h6').first().text().trim() || null,
        jname: card.find('.title, h6').first().attr('data-jp') || null,
        poster: card.find('img').first().attr('src') || null,
        url: href,
        rating: card.find('.info .rating').first().text().trim() || null,
        score: scoreRaw ? Number(scoreRaw) : null,
        type: card.find('.info b').last().text().trim() || null,
        year: /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : null,
      };
    })
    .get()
    .slice(0, 10);

  return { query: keyword, suggestions };
};
