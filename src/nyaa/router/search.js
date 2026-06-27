import { Hono } from 'hono';
import { nyaaSearchController } from '../controllers/search.js';

const router = new Hono();
router.get('/', nyaaSearchController);
export default router;