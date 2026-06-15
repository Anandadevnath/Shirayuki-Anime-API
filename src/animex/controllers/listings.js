import { wrapController } from './_cache.js';
import { getAnimexHomePage } from '../scraper/home.js';
import { getAnimexCategory } from '../scraper/category.js';
import { getAnimexAzList } from '../scraper/azlist.js';
import { getAnimexGenre } from '../scraper/genre.js';
import { getAnimexProducer } from '../scraper/producer.js';
import { getAnimexSchedule } from '../scraper/schedule.js';
import { getAnimexAnimeDetails } from '../scraper/anime.js';
import { getAnimexEpisodes } from '../scraper/episodes.js';
import {
  getAnimexSearch,
  getAnimexSearchAdvanced,
  getAnimexSearchSuggestion,
} from '../scraper/search.js';

export const animexHomeController = wrapController({
  cacheKey: () => 'home',
  handler: () => getAnimexHomePage(),
});

export const animexCategoryController = wrapController({
  cacheKey: (c) => `category:${c.req.param('category')}:${c.req.query('page') || '1'}`,
  handler: (c) =>
    getAnimexCategory({ category: c.req.param('category'), page: c.req.query('page') }),
});

export const animexAzListController = wrapController({
  cacheKey: (c) => `azlist:${c.req.param('letter')}:${c.req.query('page') || '1'}`,
  handler: (c) => getAnimexAzList({ letter: c.req.param('letter'), page: c.req.query('page') }),
});

export const animexGenreController = wrapController({
  cacheKey: (c) => `genre:${c.req.param('genre')}:${c.req.query('page') || '1'}`,
  handler: (c) => getAnimexGenre({ genre: c.req.param('genre'), page: c.req.query('page') }),
});

export const animexProducerController = wrapController({
  cacheKey: (c) => `producer:${c.req.param('producer')}:${c.req.query('page') || '1'}`,
  handler: (c) =>
    getAnimexProducer({ producer: c.req.param('producer'), page: c.req.query('page') }),
});

export const animexScheduleController = wrapController({
  cacheKey: (c) =>
    `schedule:${c.req.query('date') || 'today'}:${c.req.query('timezone') || 'UTC'}:${c.req.query('page') || '1'}`,
  handler: (c) =>
    getAnimexSchedule({
      date: c.req.query('date'),
      timezone: c.req.query('timezone'),
      page: c.req.query('page'),
    }),
});

export const animexAnimeController = wrapController({
  cacheKey: (c) => `anime:${c.req.param('animeId')}`,
  handler: (c) => getAnimexAnimeDetails({ animeId: c.req.param('animeId') }),
});

export const animexEpisodesController = wrapController({
  cacheKey: (c) => `episodes:${c.req.param('animeId')}:${c.req.query('page') || '1'}`,
  handler: (c) => getAnimexEpisodes({ animeId: c.req.param('animeId'), page: c.req.query('page') }),
});

export const animexSearchController = wrapController({
  cacheKey: (c) => `search:${c.req.query('q') || ''}:${c.req.query('page') || '1'}`,
  handler: (c) => getAnimexSearch({ q: c.req.query('q'), page: c.req.query('page') }),
});

export const animexSearchAdvancedController = wrapController({
  cacheKey: (c) =>
    [
      'search-advanced',
      c.req.query('q') || '',
      c.req.query('type') || '',
      c.req.query('genres') || '',
      c.req.query('season') || '',
      c.req.query('year') || '',
      c.req.query('page') || '1',
    ].join(':'),
  handler: (c) =>
    getAnimexSearchAdvanced({
      q: c.req.query('q'),
      type: c.req.query('type'),
      genres: c.req.query('genres'),
      season: c.req.query('season'),
      year: c.req.query('year'),
      status: c.req.query('status'),
      sort: c.req.query('sort'),
      page: c.req.query('page'),
    }),
});

export const animexSearchSuggestionController = wrapController({
  cacheKey: (c) => `search-suggestion:${c.req.query('q') || ''}`,
  handler: (c) => getAnimexSearchSuggestion({ q: c.req.query('q') }),
});
