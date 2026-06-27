import { getNyaaEpisodeSources } from '../scraper/episode-sources.js';
import { wrapController } from './_cache.js';

// Default to transcoding so HEVC/AV1 sources play in any browser. Opt out
// with ?transcode=0 for clients that want the raw byte-range stream.
const wantsTranscode = (c) => c.req.query('transcode') !== '0';

export const nyaaEpisodeSourcesController = wrapController({
  cacheKey: (c) =>
    `episode-sources:${c.req.query('torrentId') || ''}:${c.req.query('ep') || '1'}:${wantsTranscode(c) ? 'tc' : 'raw'}`,
  handler: (c) =>
    getNyaaEpisodeSources({
      torrentId: c.req.query('torrentId'),
      ep: c.req.query('ep'),
      baseUrl: new URL(c.req.url).origin,
      transcode: wantsTranscode(c),
    }),
});