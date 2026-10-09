import { load } from '../../utils/scrapper-deps.js';
import { ANIMEKAI_BASE_URL, pageGet, HOME_WIDGETS } from './_shared.js';

// Parse a grid card (.aitem) shared by home widgets, az-list and filter pages.
const parseCard = ($) => (_, el) => {
  const card = $(el);
  const titleEl = card.find('a.title, .title').first();
  const poster = card.find('.poster img, img').first().attr('src') || null;
  const href = card.find('a.poster, a.title, a').first().attr('href') || null;

  // info spans: .sub -> sub episodes, .dub -> dub episodes, plain <b> -> total/type
  const subEp = card.find('.info span.sub').text().replace(/\D/g, '') || null;
  const dubEp = card.find('.info span.dub').text().replace(/\D/g, '') || null;
  const infoBs = card.find('.info b').map((_, b) => $(b).text().trim()).get();
  const score = card.find('.info .score').text().replace(/[^\d.]/g, '') || null;
  const type = card.find('.info .type b').first().text().trim() || infoBs[infoBs.length - 1] || null;
  const totalEp = card.find('.info span b').first().text().trim() || null;

  const genres = card
    .find('.genres a[href*="/genre/"]')
    .map((_, a) => $(a).text().trim())
    .get()
    .filter(Boolean);

  const animeHref = href ? href.replace('/watch/', '/anime/').replace(/\/ep-\d+.*$/, '') : null;
  const idMatch = animeHref ? animeHref.match(/-([a-z0-9]{6})(?:$|\?)/i) : null;

  return {
    id: idMatch ? idMatch[1] : null,
    title: titleEl.text().trim() || card.find('img').attr('alt') || null,
    jname: titleEl.attr('data-jp') || null,
    poster,
    url: animeHref,
    episodes: { sub: subEp ? Number(subEp) : null, dub: dubEp ? Number(dubEp) : null },
    type,
    totalEpisodes: totalEp && /^\d+$/.test(totalEp) ? Number(totalEp) : null,
    score: score ? Number(score) : null,
    genres,
  };
};

// Spotlight slides from #featuredSwiper on the home page.
const parseSpotlight = ($, origin) =>
  $('#featuredSwiper .swiper-slide')
    .map((_, el) => {
      const slide = $(el);
      const style = slide.attr('style') || '';
      const art = slide.attr('data-art') || style.match(/--hero-art:\s*url\('([^']+)'\)/)?.[1] || null;
      const poster =
        style.match(/--hero-poster:\s*url\('([^']+)'\)/)?.[1] ||
        slide.find('.poster img').attr('src') ||
        null;

      const watchHref = slide.find('a.watch-btn').attr('href') || null;
      const idMatch = watchHref ? watchHref.match(/-([a-z0-9]{6})(?:$|\/)/i) : null;

      const mics = {};
      slide.find('.mics > div').each((__, d) => {
        const label = $(d).find('div').first().text().trim().toLowerCase();
        mics[label || 'misc'] = $(d).find('span').text().trim() || null;
      });

      return {
        id: idMatch ? idMatch[1] : null,
        title: slide.find('.title, .d-title').first().text().trim() || null,
        jname: slide.find('.title, .d-title').first().attr('data-jp') || null,
        banner: art,
        poster,
        description: slide.find('.desc').first().text().trim() || null,
        type: slide.find('.info b').last().text().trim() || null,
        rating: mics.rating || null,
        releaseYear: mics.release ? Number(mics.release) || mics.release : null,
        quality: mics.quality || null,
        url: watchHref ? watchHref.replace('/watch/', '/anime/').replace(/\/ep-\d+.*$/, '') : null,
      };
    })
    .get();

// Generic widget fetch: ajax/home/widget/{slug}?page=N returns { status, result: html }.
const fetchWidget = async (widget, page) => {
  const res = await pageGet(
    `${ANIMEKAI_BASE_URL}/ajax/home/widget/${widget}?page=${page}`,
    `${ANIMEKAI_BASE_URL}/home`,
  );
  const html = typeof res === 'string' ? res : res?.result;
  if (!html) return [];
  const $ = load(html);
  return $('.aitem').map(parseCard($)).get();
};

export const getAnimeKaiHomePage = async () => {
  const homeHtml = await pageGet(`${ANIMEKAI_BASE_URL}/home`);
  const $ = load(homeHtml);

  const spotlight = parseSpotlight($, ANIMEKAI_BASE_URL);

  // Primary rows come from widgets; fall back to the on-page #recent-update grid.
  const [trending, topAiring, mostPopular, latestEpisode, completed] = await Promise.all([
    fetchWidget('trending', 1),
    fetchWidget('top-airing', 1),
    fetchWidget('most-popular', 1),
    fetchWidget('latest-episode', 1),
    fetchWidget('completed', 1),
  ]);

  let recentlyUpdated = $('#recent-update .aitem').map(parseCard($)).get();
  if (!recentlyUpdated.length) {
    recentlyUpdated = await fetchWidget('recently-updated', 1);
  }

  return {
    source: `${ANIMEKAI_BASE_URL}/home`,
    spotlight,
    trending,
    topAiring,
    mostPopular,
    latestEpisode,
    completed,
    recentlyUpdated,
  };
};

export { HOME_WIDGETS };
