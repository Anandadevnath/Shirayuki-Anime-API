import { Hono } from 'hono';
import { animexSearchAdvancedController } from '../controllers/listings.js';

const router = new Hono();
router.get('/', animexSearchAdvancedController);
export default router;
