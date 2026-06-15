import { wrapController } from './_cache.js';
import { getAnixoHomePage } from '../scraper/home.js';
import { getAnixoCategory } from '../scraper/category.js';
import { getAnixoAzList } from '../scraper/azlist.js';
import { getAnixoGenre } from '../scraper/genre.js';
import { getAnixoProducer } from '../scraper/producer.js';
import { getAnixoSchedule } from '../scraper/schedule.js';
import { getAnixoAnimeDetails } from '../scraper/anime.js';
import { getAnixoEpisodes } from '../scraper/episodes.js';
import {
  getAnixoSearch,
  getAnixoSearchAdvanced,
  getAnixoSearchSuggestion,
} from '../scraper/search.js';

export const anixoHomeController = wrapController({
  cacheKey: () => 'home',
  handler: () => getAnixoHomePage(),
});

export const anixoCategoryController = wrapController({
  cacheKey: (c) => `category:${c.req.param('category')}:${c.req.query('page') || '1'}`,
  handler: (c) =>
    getAnixoCategory({ category: c.req.param('category'), page: c.req.query('page') }),
});

export const anixoAzListController = wrapController({
  cacheKey: (c) => `azlist:${c.req.param('letter')}:${c.req.query('page') || '1'}`,
  handler: (c) => getAnixoAzList({ letter: c.req.param('letter'), page: c.req.query('page') }),
});

export const anixoGenreController = wrapController({
  cacheKey: (c) => `genre:${c.req.param('genre')}:${c.req.query('page') || '1'}`,
  handler: (c) => getAnixoGenre({ genre: c.req.param('genre'), page: c.req.query('page') }),
});

export const anixoProducerController = wrapController({
  cacheKey: (c) => `producer:${c.req.param('producer')}:${c.req.query('page') || '1'}`,
  handler: (c) =>
    getAnixoProducer({ producer: c.req.param('producer'), page: c.req.query('page') }),
});

export const anixoScheduleController = wrapController({
  cacheKey: (c) =>
    `schedule:${c.req.query('date') || 'today'}:${c.req.query('timezone') || 'UTC'}:${c.req.query('page') || '1'}`,
  handler: (c) =>
    getAnixoSchedule({
      date: c.req.query('date'),
      timezone: c.req.query('timezone'),
      page: c.req.query('page'),
    }),
});

export const anixoAnimeController = wrapController({
  cacheKey: (c) => `anime:${c.req.param('animeId')}`,
  handler: (c) => getAnixoAnimeDetails({ animeId: c.req.param('animeId') }),
});

export const anixoEpisodesController = wrapController({
  cacheKey: (c) => `episodes:${c.req.param('animeId')}:${c.req.query('page') || '1'}`,
  handler: (c) => getAnixoEpisodes({ animeId: c.req.param('animeId'), page: c.req.query('page') }),
});

export const anixoSearchController = wrapController({
  cacheKey: (c) => `search:${c.req.query('q') || ''}:${c.req.query('page') || '1'}`,
  handler: (c) => getAnixoSearch({ q: c.req.query('q'), page: c.req.query('page') }),
});

export const anixoSearchAdvancedController = wrapController({
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
    getAnixoSearchAdvanced({
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

export const anixoSearchSuggestionController = wrapController({
  cacheKey: (c) => `search-suggestion:${c.req.query('q') || ''}`,
  handler: (c) => getAnixoSearchSuggestion({ q: c.req.query('q') }),
});
