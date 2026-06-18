import {
  fetchPage,
  parseFlwItem,
  parseNumber,
  toAbsoluteUrl,
  getAnimeId,
  extractPosterFromImg,
} from './_shared.js';
import { getHianimeSeasons } from './seasons.js';

const textOf = ($el) => $el?.text()?.trim() || null;

const extractTrending = ($) => {
  const $section = $('.cat-heading')
    .filter((_, el) => $(el).text().trim().toLowerCase() === 'trending')
    .first()
    .closest('section, .block_area');

  return $section
    .find('.cbox-list li, ul li')
    .map((_, el) => {
      const $li = $(el);
      const $link = $li.find('.film-name a').first();
      const href = $link.attr('href')?.trim() || null;
      if (!href) return null;
      const $img = $li.find('.film-poster img').first();
      const subText = $li.find('.tick-item.tick-sub').first().text().trim();
      const dubText = $li.find('.tick-item.tick-dub').first().text().trim();
      const type =
        $li
          .find('.fd-infor .tick')
          .clone()
          .children()
          .remove()
          .end()
          .text()
          .trim() || null;

      return {
        id: getAnimeId(href),
        title: textOf($link),
        jname: $link.attr('data-jp')?.trim() || null,
        ename: $link.attr('data-en')?.trim() || null,
        href,
        url: toAbsoluteUrl(href),
        poster: extractPosterFromImg($img),
        type,
        episodes: {
          sub: parseNumber(subText),
          dub: parseNumber(dubText),
        },
      };
    })
    .get()
    .filter((item) => item && item.id);
};

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

  const seasons = await getHianimeSeasons({ title, animeId: slug, maxPages: 1 })
    .then((res) => res.seasons)
    .catch(() => []);

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
    trending: extractTrending($),
    seasons,
  };
};
