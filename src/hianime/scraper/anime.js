import {
  fetchPage,
  parseFlwItem,
  parseNumber,
  toAbsoluteUrl,
  getAnimeId,
} from './_shared.js';

const textOf = ($el) => $el?.text()?.trim() || null;

const parseInfoBlock = ($) => {
  const info = {};

  $('.anisc-info .item').each((_, el) => {
    const $item = $(el);
    const head = textOf($item.find('.item-head').first());
    if (!head) return;
    const key = head.replace(/:$/, '').trim().toLowerCase();

    if ($item.hasClass('item-list')) {
      const values = $item
        .find('a')
        .map((__, a) => {
          const $a = $(a);
          return {
            name: textOf($a),
            slug: ($a.attr('href') || '').split('/').filter(Boolean).pop() || null,
            href: $a.attr('href') || null,
          };
        })
        .get()
        .filter((v) => v.name);
      info[key] = values;
    } else {
      const $name = $item.find('.name').first();
      const $text = $item.find('.text').first();
      info[key] = textOf($name) || textOf($text) || null;
    }
  });

  return info;
};

export const getHianimeAnimeDetails = async ({ animeId } = {}) => {
  const slug = String(animeId || '').trim();
  if (!slug) {
    throw new Error('animeId path parameter is required');
  }

  const { url, $ } = await fetchPage(`/anime/${slug}`, {
    referer: 'https://hianime.ad/',
  });

  const $title = $('.anisc-detail .film-name.d-title').first();
  const title = textOf($title);
  const jname = $title.attr('data-jp')?.trim() || null;
  const ename = $title.attr('data-en')?.trim() || null;

  const posterStyle = $('.anis-cover').first().attr('style') || '';
  const cover = (posterStyle.match(/url\(['"]?([^'")]+)['"]?\)/) || [])[1] || null;
  const poster = $('.anisc-poster img').first().attr('src') || null;

  const description = textOf($('.film-description .text').first());

  const $stats = $('.film-stats').first();
  const subCount = parseNumber(textOf($stats.find('.tick-item.tick-sub').first()));
  const dubCount = parseNumber(textOf($stats.find('.tick-item.tick-dub').first()));
  const pg = textOf($stats.find('.tick-item.tick-pg').first());
  const statItems = $stats
    .find('.item')
    .map((_, el) => textOf($(el)))
    .get()
    .filter(Boolean);
  const type = statItems[0] || null;
  const year = parseNumber(statItems[1]);

  const watchHref = $('.film-buttons a.btn-play').attr('href') || null;
  const watchUrl = toAbsoluteUrl(watchHref);

  const info = parseInfoBlock($);

  const recommended = $('h2.cat-heading')
    .filter((_, el) => $(el).text().trim().toLowerCase() === 'recommended for you')
    .first()
    .closest('section')
    .find('.flw-item')
    .map((_, el) => parseFlwItem($, el))
    .get();

  return {
    source: url,
    id: getAnimeId(`/anime/${slug}`),
    title,
    jname,
    ename,
    description,
    poster,
    cover,
    stats: {
      pg,
      type,
      year,
      sub: subCount,
      dub: dubCount,
    },
    info,
    watch: {
      href: watchHref,
      url: watchUrl,
    },
    recommended,
  };
};
