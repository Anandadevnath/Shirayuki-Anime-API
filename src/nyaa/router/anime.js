import { Hono } from 'hono';
import { nyaaAnimeController } from '../controllers/anime.js';
import { nyaaEpisodesController } from '../controllers/episodes.js';
import { nyaaAnimeAllSourcesController } from '../controllers/anime-all-sources.js';

const router = new Hono();
router.get('/:id', nyaaAnimeController);
router.get('/:torrentId/all-sources', nyaaAnimeAllSourcesController);
router.get('/:animeId/episodes', nyaaEpisodesController);
export default router;
