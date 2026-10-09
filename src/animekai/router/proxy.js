import { Hono } from 'hono';
import { animekaiProxyController } from '../controllers/proxy.js';

const animekaiProxyRouter = new Hono();

animekaiProxyRouter.get('/', animekaiProxyController);

export default animekaiProxyRouter;
