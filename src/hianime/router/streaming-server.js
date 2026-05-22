import { Hono } from 'hono';
import { hianimeEpisodeSourcesController } from '../controllers/episode-sources.js';

const hianimeEpisodeSourcesRouter = new Hono();

hianimeEpisodeSourcesRouter.get('/', hianimeEpisodeSourcesController);

export default hianimeEpisodeSourcesRouter;
