import { Hono } from 'hono';
import { animexSearchSuggestionController } from '../controllers/listings.js';

const router = new Hono();
router.get('/', animexSearchSuggestionController);
export default router;
