import { getNyaaSearchSuggestions } from '../scraper/search-suggestion.js';
import { wrapController } from './_cache.js';

export const nyaaSearchSuggestionController = wrapController({
  cacheKey: (c) =>
    `search-suggestion:${c.req.query('q') || ''}:${c.req.query('limit') || '10'}`,
  handler: (c) =>
    getNyaaSearchSuggestions({
      q: c.req.query('q'),
      limit: c.req.query('limit'),
    }),
});