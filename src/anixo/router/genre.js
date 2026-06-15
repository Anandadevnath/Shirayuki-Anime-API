import { Hono } from 'hono';
import { anixoGenreController } from '../controllers/listings.js';

const router = new Hono();
router.get('/:genre', anixoGenreController);
export default router;
