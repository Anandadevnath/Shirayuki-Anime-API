import { Hono } from 'hono';
import { hianimeSearchAdvancedController } from '../controllers/search-advanced.js';

const router = new Hono();
router.get('/', hianimeSearchAdvancedController);
export default router;
