import { getHianimeAzlist } from '../scraper/azlist.js';
import { wrapController } from './_cache.js';

export const hianimeAzlistController = wrapController({
  cacheKey: (c) => {
    const letter = c.req.param('letter') || 'all';
    const page = c.req.query('page') || '1';
    return `azlist:${letter}:${page}`;
  },
  handler: (c) => {
    const letter = c.req.param('letter');
    const page = c.req.query('page');
    return getHianimeAzlist({ letter, page });
  },
});
