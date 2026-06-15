import { Hono } from 'hono';
import { animexCategoryController } from '../controllers/listings.js';

const router = new Hono();
router.get('/:category', animexCategoryController);
export default router;
