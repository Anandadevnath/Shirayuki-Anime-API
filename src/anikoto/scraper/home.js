import { load } from '../../utils/scrapper-deps.js';
import { ANIKOTO_BASE_URL, pageGet, parseAnimeSlug } from '../_shared.js';

const digits = (value) => {
  const n = Number(String(value || '').replace(/\D/g, ''));
  return Number.isFinite(n) ? n : null;
};

// Shared grid-card parser for .ani.items .item (home rows, search results, etc).
const parseGridCard = ($) => (_, el) => {
  const card = $(el);
  const titleEl = card.find('.name.d-title, .d-title').first();
  const img = card.find('img').first();
  const hrefs = [];
  card.find('a[href*="/watch/"]').each((_, a) => hrefs.push($(a).attr('href')));
  const href = hrefs[0] || null;
  const watchUrl = href ? href.replace(/\/ep-\d+.*$/, '') : null;

  const left = card.find('.meta .inner .left, .meta .left');
  const ep = (sel) => digits(left.find(sel).text());

  const parsed = parseAnimeSlug(watchUrl);

  return {
    id: card.find('[data-tip]').first().attr('data-tip') || null,
    title: titleEl.text().trim() || img.attr('alt') || null,
    jname: titleEl.attr('data-jp') || null,
    poster: img.attr('src') || null,
    url: watchUrl,
    episodes: {
      sub: ep('.ep-status.sub'),
      dub: ep('.ep-status.dub'),
      total: ep('.ep-status.total'),
    },
    type: (card.find('.meta .right').text().trim() || '').trim() || null,
    slug: parsed?.slug || null,
    animeId: parsed?.animeId || null,
  };
};

// Parse a .item inside .top-tables (new-release / new-added / completed cards).
const parseTopTableCard = ($) => (_, el) => {
  const card = $(el);
  const titleEl = card.find('.name.d-title').first();
  const img = card.find('img').first();
  const href = card.find('a[href*="/watch/"]').attr('href') || card.find('a[href*="/watch/"]').first().attr('href') || null;
  const watchUrl = href ? href.replace(/\/ep-\d+.*$/, '') : null;

  const dots = card
    .find('.meta .dot')
    .map((__, d) => $(d).text().trim())
    .get()
    .filter(Boolean);
  const dateDot = dots.find((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)) || null;
  const type = dots.find((d) => d !== dateDot) || null;
  const parsed = parseAnimeSlug(watchUrl);
  const epWrap = card.find('.ep-wrap');

  return {
    id: card.find('[data-tip]').first().attr('data-tip') || null,
    title: titleEl.text().trim() || img.attr('alt') || null,
    jname: titleEl.attr('data-jp') || null,
    poster: img.attr('src') || null,
    url: watchUrl,
    episodes: {
      sub: digits(epWrap.find('.ep-status.sub').text()),
      dub: digits(epWrap.find('.ep-status.dub').text()),
    },
    type,
    releaseDate: dateDot,
    slug: parsed?.slug || null,
    animeId: parsed?.animeId || null,
  };
};

// Parse a rank item inside the #top-anime sidebar (Day/Week/Month tabs).
const parseTopAnimeCard = ($) => (_, el) => {
  const card = $(el);
  const titleEl = card.find('.tx .name.d-title, .name.d-title').first();
  const img = card.find('img').first();
  const href = card.find('a[href*="/watch/"]').first().attr('href') || null;
  const watchUrl = href ? href.replace(/\/ep-\d+.*$/, '') : null;

  const rankRaw = (card.attr('class') || '').match(/rank(\d+)/);
  const rank = rankRaw ? Number(rankRaw[1]) : null;
  const dots = card
    .find('.tx .meta .dot')
    .map((__, d) => $(d).text().trim())
    .get()
    .filter(Boolean);
  const type = dots[0] || null;
  const parsed = parseAnimeSlug(watchUrl);

  return {
    id: card.find('[data-tip]').first().attr('data-tip') || null,
    rank,
    title: titleEl.text().trim() || img.attr('alt') || null,
    jname: titleEl.attr('data-jp') || null,
    poster: img.attr('src') || null,
    url: watchUrl,
    episodes: {
      sub: digits(card.find('.tx .ep-status.sub').text()),
      dub: digits(card.find('.tx .ep-status.dub').text()),
    },
    type,
    slug: parsed?.slug || null,
    animeId: parsed?.animeId || null,
    bg: (card.find('.bg').attr('style') || '').match(/url\(['"]?([^'")]+)['"]?\)/)?.[1] || null,
  };
};

// #hotest hero carousel slides.
const parseSpotlight = ($) =>
  $('#hotest .swiper-slide')
    .map((_, el) => {
      const slide = $(el);
      const href = slide.find('.ak-btns a.btn').attr('href') || null;
      const watchUrl = href ? href.replace(/\/ep-\d+.*$/, '') : null;
      const parsed = parseAnimeSlug(watchUrl);
      const detail = {};
      slide.find('.ak-detail .it').each((__, span) => {
        const $span = $(span);
        const cls = $span.find('i').attr('class') || '';
        const val = $span.clone().children().remove().end().text().trim();
        if (/calendar/i.test(cls)) detail.releaseYear = /^\d{4}$/.test(val) ? Number(val) : val || null;
        else if (/star/i.test(cls)) detail.rating = val || null;
        else if (val) detail.type = val;
      });
      return {
        id: null,
        title: slide.find('.ak-title').text().trim() || null,
        jname: slide.find('.ak-title').attr('data-jp') || null,
        poster: slide.find('.cover img').attr('src') || null,
        description: slide.find('.ak-desc').text().trim() || null,
        url: watchUrl,
        tag: slide.find('.ak-sub').text().trim() || null,
        slug: parsed?.slug || null,
        animeId: parsed?.animeId || null,
        ...detail,
      };
    })
    .get();

export const getAnikotoHomePage = async () => {
  const homeHtml = await pageGet(`${ANIKOTO_BASE_URL}/home`, `${ANIKOTO_BASE_URL}/home`);
  const $ = load(homeHtml);

  const spotlight = parseSpotlight($);
  const latestEpisode = $('#recent-update .ani.items .item').map(parseGridCard($)).get();
  const upcoming = $('#upcoming-anime .ani.items .item').map(parseGridCard($)).get();

  const topTables = {};
  $('.top-tables section.top-table').each((_, sec) => {
    const name = ($(sec).attr('data-name') || '').trim();
    if (!name) return;
    topTables[name] = $(sec).find('.item').map(parseTopTableCard($)).get();
  });

  const topAnime = {};
  $('#top-anime .tab-content').each((_, pane) => {
    const name = ($(pane).attr('data-name') || '').trim();
    if (!name) return;
    topAnime[name] = $(pane).find('.item').map(parseTopAnimeCard($)).get();
  });

  const isMovie = (it) => /movie/i.test(it.type || '');
  const moviesOnly = (list) => {
    const movies = (list || []).filter(isMovie);
    return movies.length ? movies : list || [];
  };

  return {
    source: `${ANIKOTO_BASE_URL}/home`,
    spotlight,
    latestEpisode,
    upcoming,
    // .top-tables rows
    newRelease: topTables['new-release'] || [],
    recentlyAdded: topTables['new-added'] || [],
    latestCompleted: topTables['completed'] || [],
    // #top-anime sidebar (Day / Week / Month)
    mostViewedToday: topAnime.day || [],
    topAiring: topAnime.week || [],
    mostFavorite: topAnime.month || [],
    // derived
    popularMovies: moviesOnly(upcoming),
    recentlyAddedMovies: moviesOnly(topTables['new-added'] || []),
    recommendedForYou: [],
    topSubbed: [],
    topDubbed: [],
  };
};
