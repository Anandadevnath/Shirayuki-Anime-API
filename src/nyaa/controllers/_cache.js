const DEFAULT_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 500;

// Bounded TTL cache with LRU eviction: reads promote the entry to the back
// of the insertion order, so a hot key can outlive an idle one that was
// inserted earlier.
export const createCache = ({ ttlMs = DEFAULT_TTL_MS, maxEntries = DEFAULT_MAX_ENTRIES } = {}) => {
  const store = new Map();

  const get = (key) => {
    const entry = store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      store.delete(key);
      return null;
    }
    store.delete(key);
    store.set(key, entry);
    return entry.value;
  };

  const set = (key, value) => {
    if (store.size >= maxEntries && !store.has(key)) {
      const oldest = store.keys().next().value;
      if (oldest !== undefined) store.delete(oldest);
    }
    store.set(key, { value, expiresAt: Date.now() + ttlMs });
  };

  return { get, set };
};

export const wrapController = ({ cacheKey, ttlMs, maxEntries, handler }) => {
  const cache = createCache({ ttlMs, maxEntries });

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