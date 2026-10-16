import { proxyStream } from '../scraper/proxy.js';

const PROXY_BASE_PATH = '/api/v2/reanime/proxy';

export const reanimeProxyController = async (c) => {
  try {
    const url = c.req.query('url');
    const ref = c.req.query('ref');
    const key = c.req.query('key');

    const result = await proxyStream({
      url,
      referer: ref,
      basePath: PROXY_BASE_PATH,
      // The 32-byte WASM playlist key, base64-encoded in the query string.
      playlistKey: key ? Buffer.from(key, 'base64') : null,
    });

    c.header('Content-Type', result.contentType);
    c.header('Access-Control-Allow-Origin', '*');
    c.header('Cache-Control', 'no-store');

    return c.body(result.body);
  } catch (error) {
    const status = error.status || 500;
    return c.json({ success: false, error: error.message }, status);
  }
};
