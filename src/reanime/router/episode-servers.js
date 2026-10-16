import { Hono } from 'hono';
import { reanimeEpisodeServersController } from '../controllers/episode-servers.js';

const router = new Hono();
router.get('/servers', reanimeEpisodeServersController);
export default router;
