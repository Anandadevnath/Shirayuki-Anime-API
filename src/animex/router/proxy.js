import { Hono } from 'hono';
import { animexProxyController } from '../controllers/proxy.js';
import { PLAYER_PAGE_HTML } from '../../ui/generic-player.js';
import { getPublicUrl } from '../../utils/request-origin.js';

const animexProxyRouter = new Hono();

// If a browser *tab* navigates straight to a proxied URL (Accept: text/html),
// serve an HTML page that plays it via hls.js. Real HLS clients keep the raw
// playlist/segments untouched.
animexProxyRouter.get('/', (c) => {
  const accept = c.req.header('accept') || '';
  if (accept.includes('text/html')) {
    const abs = getPublicUrl(c);
    c.header('Cache-Control', 'no-store');
    return c.html(PLAYER_PAGE_HTML(abs));
  }
  return animexProxyController(c);
});

animexProxyRouter.get('*', animexProxyController);

export default animexProxyRouter;
