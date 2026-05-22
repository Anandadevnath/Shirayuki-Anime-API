import {
  fetchPage,
  parseFlwItem,
  extractPosterFromImg,
  toAbsoluteUrl,
  getAnimeId,
  parseNumber,
} from './_shared.js';

const extractTrending = ($) => {
  return $('#trending-home .swiper-slide')
    .map((_, el) => {
      const $slide = $(el);
      const $titleEl = $slide.find('.film-title').first();
      const $linkEl = $slide.find('a.film-poster').first();
      const href = $linkEl.attr('href')?.trim() || null;
      const $img = $slide.find('.film-poster img').first();

      return {
        rank: parseNumber($slide.find('.number span').first().text()),
        id: getAnimeId(href),
        title: $titleEl.text().trim() || null,
        jname: $titleEl.attr('data-jp')?.trim() || null,
        ename: $titleEl.attr('data-en')?.trim() || null,
        href,
        url: toAbsoluteUrl(href),
        poster: extractPosterFromImg($img),
      };
    })
    .get()
    .filter((item) => item.id);
};

const extractLatestEpisodes = ($) => {
  const section = $('h2.cat-heading')
    .filter((_, el) => $(el).text().trim().toLowerCase() === 'latest episode')
    .first()
    .closest('section');

  return section
    .find('.flw-item')
    .map((_, el) => parseFlwItem($, el))
    .get();
};

const extractEstimatedSchedule = ($) => {
  return $('#schedule .table_schedule-list li')
    .map((_, el) => {
      const $li = $(el);
      const $link = $li.find('a.tsl-link').first();
      const href = $link.attr('href')?.trim() || null;
      const $time = $li.find('.time').first();
      const $name = $li.find('.film-name').first();
      const episodeText = $li.find('.fd-play button').first().text().trim();

      return {
        id: getAnimeId(href),
        title: $name.text().trim() || null,
        jname: $name.attr('data-jp')?.trim() || null,
        ename: $name.attr('data-en')?.trim() || null,
        href,
        url: toAbsoluteUrl(href),
        episodeNumber: parseNumber(episodeText),
        airingTime: $time.attr('data-time') || null,
        time: $time.text().trim() || null,
      };
    })
    .get()
    .filter((item) => item.id);
};

const extractTop10 = ($) => {
  const result = { day: [], week: [], month: [] };

  const tabSelectors = [
    ['day', '#top-viewed-day'],
    ['week', '#top-viewed-week'],
    ['month', '#top-viewed-month'],
  ];

  for (const [key, selector] of tabSelectors) {
    result[key] = $(selector)
      .find('li.item-top')
      .map((_, el) => {
        const $li = $(el);
        const $link = $li.find('.film-name a').first();
        const href = $link.attr('href')?.trim() || null;
        const $img = $li.find('.film-poster img').first();
        const subText = $li.find('.tick-item.tick-sub').first().text().trim();
        const dubText = $li.find('.tick-item.tick-dub').first().text().trim();

        return {
          rank: parseNumber($li.find('.film-number span').first().text()),
          id: getAnimeId(href),
          title: $link.text().trim() || null,
          jname: $link.attr('data-jp')?.trim() || null,
          ename: $link.attr('data-en')?.trim() || null,
          href,
          url: toAbsoluteUrl(href),
          poster: extractPosterFromImg($img),
          episodes: {
            sub: parseNumber(subText),
            dub: parseNumber(dubText),
          },
        };
      })
      .get()
      .filter((item) => item.id);
  }

  return result;
};

const extractGenres = ($) => {
  const section = $('h2.cat-heading')
    .filter((_, el) => $(el).text().trim().toLowerCase() === 'genres')
    .first()
    .closest('section');

  return section
    .find('a[href*="/genres/"], a[href*="/genre/"]')
    .map((_, el) => {
      const $a = $(el);
      const href = $a.attr('href')?.trim() || null;
      const slug = href?.split('/').filter(Boolean).pop() || null;
      return {
        name: $a.text().trim() || null,
        slug,
        href,
        url: toAbsoluteUrl(href),
      };
    })
    .get()
    .filter((g) => g.slug);
};

export const getHianimeHomePage = async () => {
  const { url, $ } = await fetchPage('/home', { referer: 'https://hianime.ad/' });

  return {
    source: url,
    trending: extractTrending($),
    latestEpisodes: extractLatestEpisodes($),
    estimatedSchedule: extractEstimatedSchedule($),
    top10: extractTop10($),
    genres: extractGenres($),
  };
};
