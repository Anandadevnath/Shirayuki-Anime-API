import { wrapController } from './_cache.js';
import { getAnimeKaiHomePage } from '../scraper/home.js';
import { getAnimeKaiAzList, getAnimeKaiSearch, getAnimeKaiSearchAdvanced } from '../scraper/search.js';
import { getAnimeKaiSearchSuggestion } from '../scraper/search-suggestion.js';
import { getAnimeKaiAnimeDetails, getAnimeKaiEpisodes } from '../scraper/anime.js';
import { getAnimeKaiSchedule } from '../scraper/schedule.js';

export const animekaiHomeController = wrapController({
  cacheKey: () => 'home',
  handler: () => getAnimeKaiHomePage(),
});

export const animekaiAzListController = wrapController({
  cacheKey: (c) => `azlist:${c.req.param('letter')}:${c.req.query('page') || '1'}`,
  handler: (c) => getAnimeKaiAzList({ letter: c.req.param('letter'), page: c.req.query('page') }),
});

export const animekaiSearchController = wrapController({
  cacheKey: (c) => `search:${c.req.query('q') || ''}:${c.req.query('page') || '1'}`,
  handler: (c) => getAnimeKaiSearch({ q: c.req.query('q'), page: c.req.query('page') }),
});

export const animekaiSearchAdvancedController = wrapController({
  cacheKey: (c) =>
    [
      'search-advanced',
      c.req.query('q') || '',
      c.req.query('type') || '',
      c.req.query('genres') || '',
      c.req.query('season') || '',
      c.req.query('year') || '',
      c.req.query('status') || '',
      c.req.query('sort') || '',
      c.req.query('language') || '',
      c.req.query('page') || '1',
    ].join(':'),
  handler: (c) =>
    getAnimeKaiSearchAdvanced({
      q: c.req.query('q'),
      type: c.req.query('type'),
      genres: c.req.query('genres'),
      season: c.req.query('season'),
      year: c.req.query('year'),
      status: c.req.query('status'),
      sort: c.req.query('sort'),
      language: c.req.query('language'),
      page: c.req.query('page'),
    }),
});

export const animekaiSearchSuggestionController = wrapController({
  cacheKey: (c) => `search-suggestion:${c.req.query('q') || ''}`,
  handler: (c) => getAnimeKaiSearchSuggestion({ q: c.req.query('q') }),
});

export const animekaiAnimeController = wrapController({
  cacheKey: (c) => `anime:${c.req.param('animeId')}`,
  handler: (c) => getAnimeKaiAnimeDetails({ animeId: c.req.param('animeId') }),
});

export const animekaiEpisodesController = wrapController({
  cacheKey: (c) => `episodes:${c.req.param('animeId')}`,
  handler: (c) => getAnimeKaiEpisodes({ animeId: c.req.param('animeId') }),
});

export const animekaiScheduleController = wrapController({
  cacheKey: (c) => `schedule:${c.req.query('date') || 'today'}`,
  handler: (c) => getAnimeKaiSchedule({ date: c.req.query('date') }),
});
