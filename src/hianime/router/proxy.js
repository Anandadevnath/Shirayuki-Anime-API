import { Hono } from 'hono';
import { hianimeProxyController } from '../controllers/proxy.js';
import { PLAYER_PAGE_HTML } from '../../ui/generic-player.js';

const hianimeProxyRouter = new Hono();

// If a browser *tab* navigates straight to a proxied URL (Accept: text/html),
// serve an HTML page that plays it via hls.js. Real HLS clients keep the raw
// playlist/segments untouched.
hianimeProxyRouter.get('/', (c) => {
  const accept = c.req.header('accept') || '';
  if (accept.includes('text/html')) {
    const abs = c.req.url;
    c.header('Cache-Control', 'no-store');
    return c.html(PLAYER_PAGE_HTML(abs));
  }
  return hianimeProxyController(c);
});

hianimeProxyRouter.get('*', hianimeProxyController);

export default hianimeProxyRouter;
