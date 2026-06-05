import { getHianimeProducer } from '../scraper/producer.js';
import { wrapController } from './_cache.js';

export const hianimeProducerController = wrapController({
  cacheKey: (c) => `producer:${c.req.param('producer') || ''}:${c.req.query('page') || '1'}`,
  handler: (c) =>
    getHianimeProducer({ producer: c.req.param('producer'), page: c.req.query('page') }),
});
