import { Hono } from 'hono';
import { hianimeGenreController } from '../controllers/genre.js';

const router = new Hono();
router.get('/:genre', hianimeGenreController);
export default router;
