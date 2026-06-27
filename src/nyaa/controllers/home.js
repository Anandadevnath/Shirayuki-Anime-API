import { getNyaaHome } from '../scraper/home.js';
import { wrapController } from './_cache.js';

export const nyaaHomeController = wrapController({
  cacheKey: () => 'home',
  handler: () => getNyaaHome(),
});