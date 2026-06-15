import { proxyStream } from '../scraper/proxy.js';

// Path that rewritten playlist URLs point back to (must match the mounted route).
const PROXY_BASE_PATH = '/api/v2/animex/proxy';

export const animexProxyController = async (c) => {
  try {
    const url = c.req.query('url');
    const ref = c.req.query('ref');

    const result = await proxyStream({
      url,
      referer: ref,
      basePath: PROXY_BASE_PATH,
    });

    c.header('Content-Type', result.contentType);
    c.header('Access-Control-Allow-Origin', '*');
    c.header('Cache-Control', 'no-store');

    return c.body(result.body);
  } catch (error) {
    const status = error.status || 500;
    return c.json(
      {
        success: false,
        error: error.message,
      },
      status,
    );
  }
};
