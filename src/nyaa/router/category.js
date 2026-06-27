import { Hono } from 'hono';
import { nyaaCategoryController, nyaaCategoriesController } from '../controllers/category.js';

const router = new Hono();
router.get('/', nyaaCategoryController);
router.get('/list', nyaaCategoriesController);
export default router;