import { getNyaaAnimeAllSources } from '../scraper/anime-all-sources.js';
import { wrapController } from './_cache.js';

const wantsTranscode = (c) => c.req.query('transcode') !== '0';

export const nyaaAnimeAllSourcesController = wrapController({
  cacheKey: (c) => {
    const id = c.req.param('torrentId') || '';
    const category = c.req.query('category') || 'sub';
    const maxPages = c.req.query('pages') || '3';
    const transcodeKey = wantsTranscode(c) ? 'tc' : 'raw';
    return `anime-all-sources:${id}:${category}:${maxPages}:${transcodeKey}`;
  },
  handler: (c) =>
    getNyaaAnimeAllSources({
      torrentId: c.req.param('torrentId'),
      baseUrl: new URL(c.req.url).origin,
      category: c.req.query('category'),
      transcode: wantsTranscode(c),
      maxPages: c.req.query('pages'),
    }),
});
