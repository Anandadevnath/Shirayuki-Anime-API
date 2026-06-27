import { getNyaaStreamInfo } from '../scraper/stream.js';
import { wrapController } from './_cache.js';

// Default to transcoding so HEVC/AV1 sources play in any browser. Opt out
// with ?transcode=0 for clients that want the raw byte-range stream.
const wantsTranscode = (c) => c.req.query('transcode') !== '0';

export const nyaaStreamController = wrapController({
  cacheKey: (c) =>
    `stream:${c.req.query('torrentId') || ''}:${c.req.query('ep') || ''}:${wantsTranscode(c) ? 'tc' : 'raw'}`,
  handler: (c) =>
    getNyaaStreamInfo({
      torrentId: c.req.query('torrentId'),
      ep: c.req.query('ep'),
      baseUrl: new URL(c.req.url).origin,
      transcode: wantsTranscode(c),
    }),
});