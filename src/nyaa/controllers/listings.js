import { wrapController } from './_cache.js';
import { getNyaaHome } from '../scraper/home.js';
import {
  getAnilistSchedule,
  searchAnilist,
  suggestAnilist,
  browseAnilist,
  genreAnilist,
  getAnilistDetails,
  getAnilistEpisodes,
} from '../scraper/anilist.js';
import { searchNyaa } from '../scraper/rss.js';

const page = (c) => c.req.query('page') || '1';

export const nyaaHomeController = wrapController({
  cacheKey: () => 'home',
  handler: () => getNyaaHome(),
});

export const nyaaScheduleController = wrapController({
  cacheKey: (c) => `schedule:${c.req.query('date') || 'today'}`,
  handler: (c) => getAnilistSchedule({ date: c.req.query('date') }),
});

export const nyaaSearchController = wrapController({
  cacheKey: (c) => `search:${c.req.query('q') || ''}:${page(c)}`,
  handler: (c) => searchAnilist({ q: c.req.query('q'), page: c.req.query('page') }),
});

export const nyaaSearchSuggestionController = wrapController({
  cacheKey: (c) => `search-suggestion:${c.req.query('q') || ''}`,
  handler: (c) => suggestAnilist({ q: c.req.query('q') }),
});

export const nyaaBrowseController = wrapController({
  cacheKey: (c) => `browse:${c.req.param('category')}:${page(c)}`,
  handler: (c) => browseAnilist({ category: c.req.param('category'), page: c.req.query('page') }),
});

export const nyaaGenreController = wrapController({
  cacheKey: (c) => `genre:${c.req.param('genre')}:${page(c)}`,
  handler: (c) => genreAnilist({ genre: c.req.param('genre'), page: c.req.query('page') }),
});

export const nyaaAnimeController = wrapController({
  cacheKey: (c) => `anime:${c.req.param('animeId')}`,
  handler: (c) => getAnilistDetails({ animeId: c.req.param('animeId') }),
});

export const nyaaEpisodesController = wrapController({
  cacheKey: (c) => `episodes:${c.req.param('animeId')}`,
  handler: (c) => getAnilistEpisodes({ animeId: c.req.param('animeId') }),
});

// Raw Nyaa search passthrough: /torrents?q=&c=1_2&f=0&s=seeders&o=desc&page=1
export const nyaaTorrentsController = wrapController({
  cacheKey: (c) => {
    const q = c.req.query();
    return `torrents:${q.q || ''}:${q.c || ''}:${q.f || ''}:${q.s || ''}:${q.o || ''}:${q.page || '1'}`;
  },
  handler: (c) => {
    const q = c.req.query();
    return searchNyaa({ q: q.q, c: q.c || undefined, f: q.f || undefined, s: q.s || undefined, o: q.o, page: q.page });
  },
});
