import { Hono } from 'hono';
import { animekaiProxyController } from '../controllers/proxy.js';

const animekaiProxyRouter = new Hono();

animekaiProxyRouter.get('/', animekaiProxyController);
// Also serve proxied child URIs that carry an extension suffix (e.g. /stream.ts
// or /stream.m3u8) so strict HLS parsers accept them — the real target stays in
// the ?url= query parameter.
animekaiProxyRouter.get('*', animekaiProxyController);

export default animekaiProxyRouter;
