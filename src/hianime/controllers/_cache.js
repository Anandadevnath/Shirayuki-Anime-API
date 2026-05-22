const DEFAULT_TTL_MS = 5 * 60 * 1000;

export const createCache = (ttlMs = DEFAULT_TTL_MS) => {
  const store = new Map();

  const get = (key) => {
    const entry = store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      store.delete(key);
      return null;
    }
    return entry.value;
  };

  const set = (key, value) => {
    store.set(key, { value, expiresAt: Date.now() + ttlMs });
  };

  return { get, set };
};

export const wrapController = ({ cacheKey, ttlMs, handler }) => {
  const cache = createCache(ttlMs);

  return async (c) => {
    const startTime = Date.now();

    try {
      const key = cacheKey(c);
      const cached = cache.get(key);
      if (cached) {
        const extractionTimeSec = Number(((Date.now() - startTime) / 1000).toFixed(3));
        return c.json({ success: true, data: cached, extractionTimeSec, cached: true });
      }

      const data = await handler(c);
      cache.set(key, data);
      const extractionTimeSec = Number(((Date.now() - startTime) / 1000).toFixed(3));
      return c.json({ success: true, data, extractionTimeSec });
    } catch (error) {
      const status = error?.statusCode || 500;
      return c.json({ success: false, error: error?.message || 'Internal error' }, status);
    }
  };
};
