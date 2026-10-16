import { Hono } from 'hono';
import { reanimeProxyController } from '../controllers/proxy.js';
import { PLAYER_PAGE_HTML } from '../../ui/generic-player.js';
import { getPublicUrl } from '../../utils/request-origin.js';

const reanimeProxyRouter = new Hono();

// If a browser *tab* navigates straight to a proxied URL (Accept: text/html),
// serve an HTML page that plays it via hls.js. Real HLS clients keep the raw
// playlist/segments untouched.
reanimeProxyRouter.get('/', (c) => {
  const accept = c.req.header('accept') || '';
  if (accept.includes('text/html')) {
    const abs = getPublicUrl(c);
    c.header('Cache-Control', 'no-store');
    return c.html(PLAYER_PAGE_HTML(abs));
  }
  return reanimeProxyController(c);
});

reanimeProxyRouter.get('*', reanimeProxyController);

export default reanimeProxyRouter;
