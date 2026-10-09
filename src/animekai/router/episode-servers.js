import { Hono } from 'hono';
import { animekaiEpisodeServersController } from '../controllers/episode-servers.js';

const router = new Hono();
router.get('/servers', animekaiEpisodeServersController);
export default router;
