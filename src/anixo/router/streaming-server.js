import { Hono } from 'hono';
import { anixoEpisodeSourcesController } from '../controllers/episode-sources.js';

const anixoEpisodeSourcesRouter = new Hono();

anixoEpisodeSourcesRouter.get('/', anixoEpisodeSourcesController);

export default anixoEpisodeSourcesRouter;
