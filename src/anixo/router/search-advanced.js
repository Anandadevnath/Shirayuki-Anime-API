import { Hono } from 'hono';
import { anixoSearchAdvancedController } from '../controllers/listings.js';

const router = new Hono();
router.get('/', anixoSearchAdvancedController);
export default router;
