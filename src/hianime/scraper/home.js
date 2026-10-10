import { load } from '../../utils/scrapper-deps.js';
import {
  HIANIME_BASE_URL,
  pageGet,
  toAbsoluteUrl,
  parseNumber,
  parseAnimeSlug,
} from './_shared.js';
import { extractFlwItems, parseFlwItem } from './cards.js';

// #slider swiper slides -> spotlight (banner) entries.
const parseSpotlight = ($) =>
  $('#slider .swiper-slide')
    .map((_, el) => {
      const slide = $(el);
      const detail = slide.find('.deslide-item');
      const cover = detail.find('.film-poster-img').first().attr('src') || null;
      const name = detail.find('.desi-head-title').first();
      const watchHref = detail.find('a.btn-primary').first().attr('href') || null;
      const parsed = parseAnimeSlug(watchHref) || parseAnimeSlug(detail.find('a').attr('href'));

      const scdItems = [];
      detail.find('.scd-item').each((__, s) => {
        const t = $(s).text().trim();
        if (t) scdItems.push(t);
      });

      return {
        id: parsed?.id || null,
        title: name.text().trim() || null,
        jname: name.attr('data-jname') || name.attr('data-en') || null,
        banner: toAbsoluteUrl(cover),
        type: scdItems.find((s) => /^(TV|MOVIE|OVA|ONA|SPECIAL)$/i.test(s)) || null,
        duration: scdItems.find((s) => /^\d+m$/.test(s)) || null,
        releaseDate: scdItems.find((s) => /^[A-Z][a-z]{2} \d{1,2}, \d{4}$/.test(s)) || null,
        quality: detail.find('.quality').first().text().trim() || null,
        episodes: {
          total: parseNumber(detail.find('.tick-eps').first().text()),
          sub: parseNumber(detail.find('.tick-sub').first().text()),
          dub: parseNumber(detail.find('.tick-dub').first().text()),
        },
        description: detail.find('.desi-description').first().text().trim() || null,
        url: watchHref ? toAbsoluteUrl(watchHref) : null,
      };
    })
    .get();

// #trending-home swiper -> ranked trending items (number + film-title + poster).
const parseTrending = ($) =>
  $('#trending-home .swiper-slide .item')
    .map((_, el) => {
      const item = $(el);
      const href = item.find('a.film-poster').first().attr('href') || null;
      const parsed = parseAnimeSlug(href);
      const titleEl = item.find('.film-title, .dynamic-name').first();
      const img = item.find('.film-poster-img').first();
      return {
        rank: parseNumber(item.find('.number span').first().text()),
        id: parsed?.id || null,
        title: titleEl.text().trim() || img.attr('alt') || null,
        jname: titleEl.attr('data-jname') || titleEl.attr('data-en') || null,
        poster: toAbsoluteUrl(img.attr('data-src') || img.attr('src')),
        url: href ? toAbsoluteUrl(href) : null,
      };
    })
    .get();

// #anime-featured blocks -> { headerName: [items] } (Top Airing, Top Upcoming...).
const parseFeaturedBlocks = ($) => {
  const blocks = {};
  $('#anime-featured .anif-block').each((_, el) => {
    const block = $(el);
    const name = block.find('.anif-block-header').first().text().trim();
    const items = extractFlwItems($, '.anif-block-ul li');
    if (name && items.length) blocks[name] = items;
  });
  return blocks;
};

// #top-viewed-day/week/month chart items -> ranked lists keyed by tab.
const parseTopViewedCharts = ($) => {
  const charts = {};
  $('.anif-block-chart').each((_, el) => {
    const chart = $(el);
    const id = chart.attr('id') || '';
    const label = id.replace('top-viewed-', '');
    const items = chart
      .find('li')
      .map((__, liNode) => {
        const li = $(liNode);
        const a = li.find('a').first();
        const href = a.attr('href') || null;
        const parsed = parseAnimeSlug(href);
        const titleEl = a.find('.dynamic-name, .film-name').first();
        const img = a.find('.film-poster-img').first();
        return {
          rank: parseNumber(li.find('.film-number, .film-number-wrap').first().text()),
          id: parsed?.id || null,
          title: titleEl.text().trim() || img.attr('alt') || null,
          jname: titleEl.attr('data-jname') || titleEl.attr('data-en') || null,
          poster: toAbsoluteUrl(img.attr('data-src') || img.attr('src')),
          url: href ? toAbsoluteUrl(href) : null,
        };
      })
      .get()
      .filter((r) => r.id || r.title);
    if (label && items.length) charts[label] = items;
  });
  return charts;
};

// Generic `.block_area` sections carrying flw-item grids (Latest Episode,
// New On HiAnime, ...). Keyed by the stripped cat-heading text.
const parseSections = ($) => {
  const sections = {};
  $('#main-content .block_area').each((_, el) => {
    const area = $(el);
    const heading = area.find('.cat-heading').first().text().trim();
    const items = area
      .find('.flw-item')
      .map(parseFlwItem($))
      .get()
      .filter((r) => r.id || r.title);
    if (heading && items.length) {
      sections[heading] = items;
    }
  });
  return sections;
};

export const getHianimeHomePage = async () => {
  const html = await pageGet(`${HIANIME_BASE_URL}/home`);
  const $ = load(html);

  return {
    source: `${HIANIME_BASE_URL}/home`,
    spotlight: parseSpotlight($),
    trending: parseTrending($),
    featured: parseFeaturedBlocks($),
    topViewed: parseTopViewedCharts($),
    sections: parseSections($),
  };
};
