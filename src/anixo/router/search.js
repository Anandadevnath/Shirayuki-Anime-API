import { Hono } from 'hono';
import { anixoSearchController } from '../controllers/listings.js';

const router = new Hono();
router.get('/', anixoSearchController);
export default router;
