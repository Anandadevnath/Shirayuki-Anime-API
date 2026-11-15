import { Hono } from 'hono';
import { nyaaPlayController } from '../controllers/play.js';

const router = new Hono();
router.get('/', nyaaPlayController);
export default router;
