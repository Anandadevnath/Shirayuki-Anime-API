import { Hono } from 'hono';
import { hianimeSearchSuggestionController } from '../controllers/search-suggestion.js';

const router = new Hono();
router.get('/', hianimeSearchSuggestionController);
export default router;
