import { getHianimeSearchSuggestion } from '../scraper/search-suggestion.js';
import { wrapController } from './_cache.js';

export const hianimeSearchSuggestionController = wrapController({
  cacheKey: (c) => `search-suggestion:${c.req.query('q') || ''}`,
  handler: (c) => getHianimeSearchSuggestion({ q: c.req.query('q') }),
});
