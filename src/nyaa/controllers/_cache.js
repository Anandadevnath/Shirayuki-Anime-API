const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;
// Keys include free-form q/date/page values, so cap the map (oldest entries go first).
const MAX_ENTRIES = 500;

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
  cache.delete(key);
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value);
};

export const wrapController = ({ cacheKey, handler }) => async (c) => {
  try {
    const startTime = Date.now();
    const key = `nyaa:${cacheKey(c)}`;

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
