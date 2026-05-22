import { getHianimeHomePage } from '../scraper/home.js';
import { wrapController } from './_cache.js';

export const hianimeHomeController = wrapController({
  cacheKey: () => 'home',
  handler: () => getHianimeHomePage(),
});
