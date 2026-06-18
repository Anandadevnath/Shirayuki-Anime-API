import { Hono } from 'hono';
import { hianimeSeasonsController } from '../controllers/seasons.js';

const router = new Hono();
router.get('/', hianimeSeasonsController);
router.get('/:animeId', hianimeSeasonsController);
export default router;
