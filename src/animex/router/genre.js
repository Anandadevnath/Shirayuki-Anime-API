import { Hono } from 'hono';
import { animexGenreController } from '../controllers/listings.js';

const router = new Hono();
router.get('/:genre', animexGenreController);
export default router;
