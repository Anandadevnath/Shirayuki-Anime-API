import { Hono } from 'hono';
import { animexScheduleController } from '../controllers/listings.js';

const router = new Hono();
router.get('/', animexScheduleController);
export default router;
