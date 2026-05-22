import { getHianimeSchedule } from '../scraper/schedule.js';
import { wrapController } from './_cache.js';

export const hianimeScheduleController = wrapController({
  cacheKey: (c) => `schedule:${c.req.query('date') || ''}:${c.req.query('timezone') || ''}`,
  handler: (c) =>
    getHianimeSchedule({ date: c.req.query('date'), timezone: c.req.query('timezone') }),
});
