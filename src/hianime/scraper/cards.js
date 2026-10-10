import { HIANIME_BASE_URL, toAbsoluteUrl, parseNumber, parseAnimeSlug } from './_shared.js';

// Parse a standard HiAnime `.flw-item` card (used across home, search, browse,
// genre, category, seasons pages). Falls back to a bare `<a class="film-poster">`.
export const parseFlwItem = ($) => (_, el) => {
  const $item = $(el);
  const $poster = $item.find('.film-poster a, .film-poster-ahref').first();
  const href = $poster.attr('href') || $item.find('.film-name a').attr('href') || null;
  const { slug, id } = parseAnimeSlug(href) || {};
  const $img = $item.find('.film-poster-img').first();
  const $name = $item.find('.dynamic-name').first();

  const type = $item.find('.fd-infor .fdi-item').first().text().trim() || null;
  const duration = $item.find('.fd-infor .fdi-item.fdi-duration').first().text().trim() || null;

  return {
    id: id || $poster.attr('data-id') || null,
    title: $name.text().trim() || $img.attr('alt') || null,
    jname: $name.attr('data-jname') || null,
    poster: toAbsoluteUrl($img.attr('data-src') || $img.attr('src')),
    type,
    duration,
    episodes: {
      sub: parseNumber($item.find('.tick-item.tick-sub').first().text()),
      dub: parseNumber($item.find('.tick-item.tick-dub').first().text()),
      total: parseNumber($item.find('.tick-item.tick-eps').first().text()),
    },
    url: href ? toAbsoluteUrl(href) : null,
  };
};

// Extract film items from a selector context.
export const extractFlwItems = ($, selector) =>
  $(selector)
    .map(parseFlwItem($))
    .get()
    .filter((r) => r.id || r.title);

// Pagination on HiAnime uses Bootstrap-style page-items. The current page is
// marked .active and Next/Last links carry a `next`/`last` page-link (hianime.at
// uses title="Next"/title="Last" links, hianime.dk used rel="next"/rel="last").
export const extractPagination = ($, queryPage = 1) => {
  const currentPage =
    Number($('.pagination .page-item.active').first().text().trim()) || Number(queryPage) || 1;
  const hasNextPage =
    $('.pagination a[title="Next"], .pagination a[rel="next"]').length > 0;

  let totalPages = 0;
  $('.pagination .page-item').each((_, el) => {
    const n = Number($(el).text().trim());
    if (Number.isFinite(n) && n > totalPages) totalPages = n;
  });

  // Only consider the top-level pagination nav (search/browse pages).
  const lastHref =
    $('.pagination a[title="Last"]').attr('href') ||
    $('.pagination a[rel="last"]').attr('href');
  if (lastHref) {
    const m = lastHref.match(/page=(\d+)/i);
    if (m) totalPages = Math.max(totalPages, Number(m[1]));
  }
  if (hasNextPage) totalPages = Math.max(totalPages, currentPage + 1);
  if (!totalPages) totalPages = currentPage;

  return { currentPage, hasNextPage, totalPages };
};
