import { Hono } from 'hono';
import { hianimeEpisodeSourcesController } from '../controllers/episode-sources.js';

const router = new Hono();
router.get('/', hianimeEpisodeSourcesController);
export default router;
