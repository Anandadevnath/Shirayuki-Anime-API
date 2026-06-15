const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

const getCached = (key) => {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    cache.delete(key);
    return null;
  }
  return item.value;
};

const setCached = (key, value) => {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
};

// Wrap a scraper handler with the shared 5-min cache + response envelope used
// across the repo. `cacheKey(c)` builds a unique key; `handler(c)` returns data.
export const wrapController = ({ cacheKey, handler }) => async (c) => {
  try {
    const startTime = Date.now();
    const key = `anixo:${cacheKey(c)}`;

    const cached = getCached(key);
    if (cached) {
      const extractionTimeSec = Number(((Date.now() - startTime) / 1000).toFixed(3));
      return c.json({ success: true, data: cached, extractionTimeSec });
    }

    const data = await handler(c);
    setCached(key, data);

    const extractionTimeSec = Number(((Date.now() - startTime) / 1000).toFixed(3));
    return c.json({ success: true, data, extractionTimeSec });
  } catch (error) {
    const status = error.status || 500;
    return c.json({ success: false, error: error.message }, status);
  }
};
