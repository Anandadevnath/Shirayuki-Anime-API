import { Hono } from 'hono';
import { hianimeEpisodeServersController } from '../controllers/episode-servers.js';

const router = new Hono();
router.get('/servers', hianimeEpisodeServersController);
export default router;
