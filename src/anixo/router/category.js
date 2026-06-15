import { Hono } from 'hono';
import { anixoCategoryController } from '../controllers/listings.js';

const router = new Hono();
router.get('/:category', anixoCategoryController);
export default router;
