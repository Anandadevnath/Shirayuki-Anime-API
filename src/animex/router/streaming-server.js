import { Hono } from 'hono';
import { animexEpisodeSourcesController } from '../controllers/episode-sources.js';

const animexEpisodeSourcesRouter = new Hono();

animexEpisodeSourcesRouter.get('/', animexEpisodeSourcesController);

export default animexEpisodeSourcesRouter;
