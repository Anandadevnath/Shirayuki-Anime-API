import { Hono } from 'hono';
import { hianimeCategoryController } from '../controllers/category.js';

const router = new Hono();
router.get('/:category', hianimeCategoryController);
export default router;
