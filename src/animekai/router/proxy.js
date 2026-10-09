import { Hono } from 'hono';
import { animekaiProxyController } from '../controllers/proxy.js';
import { PLAYER_PAGE_HTML } from '../../ui/generic-player.js';

const animekaiProxyRouter = new Hono();

// If a browser *tab* navigates straight to a proxym3u8 URL (Accept: text/html),
// serve an HTML page that plays it via hls.js. Real HLS clients (hls.js fetch,
// ffmpeg, VLC, Safari) send a non-text/html Accept, so they keep getting the raw
// playlist/segments untouched.
animekaiProxyRouter.get('/', (c) => {
  const accept = c.req.header('accept') || '';
  if (accept.includes('text/html')) {
    // c.req.url is the full absolute request URL (including query) in Hono.
    const abs = c.req.url;
    c.header('Cache-Control', 'no-store');
    return c.html(PLAYER_PAGE_HTML(abs));
  }
  return animekaiProxyController(c);
});

animekaiProxyRouter.get('*', animekaiProxyController);

export default animekaiProxyRouter;
