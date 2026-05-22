import { Hono } from 'hono';
import { hianimeSearchController } from '../controllers/search.js';

const router = new Hono();
router.get('/', hianimeSearchController);
export default router;
