import { Hono } from 'hono';
import { animexEpisodeServersController } from '../controllers/episode-servers.js';

const router = new Hono();
router.get('/servers', animexEpisodeServersController);
export default router;
