import { Hono } from 'hono';
import { anikuroEpisodeSourcesController } from '../controllers/episode-sources.js';

const anikuroEpisodeSourcesRouter = new Hono();

anikuroEpisodeSourcesRouter.get('/', anikuroEpisodeSourcesController);

export default anikuroEpisodeSourcesRouter;
