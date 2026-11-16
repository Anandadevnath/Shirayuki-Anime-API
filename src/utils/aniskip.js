const ANISKIP_URL = 'https://api.aniskip.com/v2/skip-times';
const ANISKIP_TIMEOUT_MS = 5000;

// AniSkip (by MAL id) gives OP/ED for providers without skip data, in hianime's { start, end } form.
export const getSkipTimes = async (malId, episode) => {
  const none = { intro: null, outro: null };
  if (!malId) return none;
  try {
    const url = `${ANISKIP_URL}/${malId}/${episode}?types[]=op&types[]=ed&episodeLength=0`;
    const res = await fetch(url, { signal: AbortSignal.timeout(ANISKIP_TIMEOUT_MS) });
    if (!res.ok) return none; // 404 = no skip times submitted for this episode
    const { results = [] } = await res.json();
    const pick = (type) => {
      const r = results.find((x) => x.skipType === type)?.interval;
      return r ? { start: Math.round(r.startTime), end: Math.round(r.endTime) } : null;
    };
    return { intro: pick('op'), outro: pick('ed') };
  } catch (err) {
    console.warn(`[aniskip] ${malId}/${episode} failed: ${err.message}`);
    return none;
  }
};
