import { proxyWorkerFile, isWorkerStreamUrl } from '../scraper/proxy.js';
import { getRequestOrigin } from '../../utils/request-origin.js';

export const nyaaProxyController = async (c) => {
  const url = c.req.query('url') || '';
  if (!isWorkerStreamUrl(url)) {
    return c.json({ success: false, error: 'url must be a stream worker /stream/ URL' }, 400);
  }
  try {
    return await proxyWorkerFile({ url, apiOrigin: getRequestOrigin(c) });
  } catch (error) {
    const isTimeout = error.name === 'TimeoutError';
    return c.json({ success: false, error: isTimeout ? 'stream worker timed out' : error.message }, isTimeout ? 504 : 502);
  }
};
