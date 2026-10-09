import { Hono } from 'hono';
import { anixoProxyController } from '../controllers/proxy.js';

const anixoProxyRouter = new Hono();

anixoProxyRouter.get('/', anixoProxyController);
// Also serve proxied child URIs that carry an extension suffix (e.g. /stream.ts
// or /stream.m3u8) so strict HLS parsers accept them — the real target stays in
// the ?url= query parameter.
anixoProxyRouter.get('*', anixoProxyController);

export default anixoProxyRouter;
