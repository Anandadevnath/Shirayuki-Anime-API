import { Hono } from 'hono';
import {
  anvHomeController,
  anvBrowseController,
  anvSearchController,
  anvAnimeController,
  anvEpisodesController,
  anvEpisodeSourcesController,
  anvProxyController,
} from '../controllers/index.js';
import { PLAYER_PAGE_HTML } from '../../ui/generic-player.js';
import { getPublicUrl } from '../../utils/request-origin.js';

const router = new Hono();
router.get('/', anvHomeController);
router.get('/browse', anvBrowseController);
router.get('/search', anvSearchController);
router.get('/anime/:animeId', anvAnimeController);
router.get('/anime/:animeId/episodes', anvEpisodesController);
router.get('/episode/sources', anvEpisodeSourcesController);

// Browser tab opening a proxied playlist directly gets an hls.js page (same as hianime).
router.get('/proxy', (c) => {
  if ((c.req.header('accept') || '').includes('text/html')) {
    c.header('Cache-Control', 'no-store');
    return c.html(PLAYER_PAGE_HTML(getPublicUrl(c)));
  }
  return anvProxyController(c);
});
router.get('/proxy/*', anvProxyController);

export default router;
