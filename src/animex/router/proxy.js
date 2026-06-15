import { Hono } from 'hono';
import { animexProxyController } from '../controllers/proxy.js';

const animexProxyRouter = new Hono();

animexProxyRouter.get('/', animexProxyController);

export default animexProxyRouter;
