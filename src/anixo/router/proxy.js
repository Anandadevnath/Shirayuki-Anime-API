import { Hono } from 'hono';
import { anixoProxyController } from '../controllers/proxy.js';

const anixoProxyRouter = new Hono();

anixoProxyRouter.get('/', anixoProxyController);

export default anixoProxyRouter;
