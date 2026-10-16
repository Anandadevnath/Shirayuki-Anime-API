import { Hono } from 'hono';
import { reanimeEpisodeSourcesController } from '../controllers/episode-sources.js';

const router = new Hono();
router.get('/', reanimeEpisodeSourcesController);
export default router;
