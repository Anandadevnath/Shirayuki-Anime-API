import { anvPost, getSessionCookie, invalidateSession, absoluteUrl, httpError, ANV_BASE_URL } from '../_shared.js';
import { getAnvAnime } from './catalog.js';

const SLUG_CACHE_TTL_MS = 10 * 60 * 1000;
const ANISKIP_URL = 'https://api.aniskip.com/v2/skip-times';
const ANISKIP_TIMEOUT_MS = 5000;
const slugToIds = new Map(); // slug -> { anvId, malId, expiresAt }

// /api/episode wants anv's numeric id; accept either that or the slug.
// A bare numeric id has no MAL id, so it gets no intro/outro.
const resolveIds = async (animeId) => {
  if (/^\d+$/.test(animeId)) return { anvId: Number(animeId), malId: null };
  const hit = slugToIds.get(animeId);
  if (hit && Date.now() < hit.expiresAt) return hit;
  const { anvId, malId } = await getAnvAnime(animeId);
  const ids = { anvId, malId, expiresAt: Date.now() + SLUG_CACHE_TTL_MS };
  slugToIds.set(animeId, ids);
  return ids;
};

// anv has no skip data; AniSkip (by MAL id) gives OP/ED in hianime's { start, end } form.
const getSkipTimes = async (malId, episode) => {
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
    console.warn(`[anv] aniskip ${malId}/${episode} failed: ${err.message}`);
    return none;
  }
};

const requestEpisode = async (body, referer) => {
  const cookie = await getSessionCookie();
  const res = await anvPost('/api/episode', body, { cookie, referer });
  if (res.status !== 403) return res;
  // Cookie rejected: get a fresh browser session and retry once.
  invalidateSession(cookie);
  return anvPost('/api/episode', body, { cookie: await getSessionCookie(), referer });
};

const pickByIdOrLabel = (list, wanted) => {
  const key = String(wanted || '').toLowerCase();
  return list.find((s) => s.id.toLowerCase() === key || s.label.toLowerCase() === key) || list[0];
};

const parseEpisode = (ep) => {
  const episode = Number(ep);
  if (!Number.isInteger(episode) || episode < 1) throw httpError('ep must be a positive integer', 400);
  return episode;
};

const watchPage = (animeId, episode) =>
  /^\d+$/.test(animeId) ? `${ANV_BASE_URL}/` : `${ANV_BASE_URL}/anime/${animeId}-episode-${episode}`;

// Same shape as hianime /episode/servers: { sub: [...], dub: [...] }.
export const getAnvEpisodeServers = async ({ animeId, ep }) => {
  if (!animeId) throw httpError('animeId and ep query parameters are required', 400);
  const episode = parseEpisode(ep);
  const { anvId } = await resolveIds(animeId);
  const embed = watchPage(animeId, episode);
  const res = await requestEpisode({ anilistId: anvId, malId: null, episode, first: true, prefer: 'sub' }, embed);
  if (res.status !== 200 || res.data?.status !== 'ready') {
    throw httpError(`anv /api/episode responded ${res.status} (${res.data?.status || 'resolution-failed'})`, 502);
  }

  const servers = Object.fromEntries(
    (res.data.variants || []).map((v) => [
      v.id,
      (v.sources || []).map((s) => ({
        name: s.label,
        serverId: s.id,
        category: v.id,
        embed,
        hash: Buffer.from(embed).toString('base64'),
      })),
    ]),
  );
  return { source: `${ANV_BASE_URL}/api/episode`, episodeId: String(episode), episode, servers };
};

export const getAnvEpisodeSources = async ({ animeId, ep, category = 'sub', server }) => {
  const episode = parseEpisode(ep);

  const { anvId, malId } = await resolveIds(animeId);
  const referer = watchPage(animeId, episode);
  const [res, skip] = await Promise.all([
    requestEpisode({ anilistId: anvId, malId: null, episode, first: true, prefer: category }, referer),
    getSkipTimes(malId, episode),
  ]);

  // Same keys/order as the hianime episode-sources response.
  const base = {
    source: `${ANV_BASE_URL}/api/episode`,
    episodeId: String(episode),
    category,
    server: null,
    embed: referer,
    streamResolved: false,
    reason: null,
    note: null,
    link: null,
    tracks: [],
    intro: skip.intro,
    outro: skip.outro,
    referer: null,
  };

  if (res.status !== 200 || res.data?.status !== 'ready') {
    return { ...base, reason: res.data?.status || 'resolution-failed', note: `anv /api/episode responded ${res.status}` };
  }

  const variants = res.data.variants || [];
  const variant = variants.find((v) => v.id === category) || variants[0];
  const pool = variant?.sources || [];
  if (!pool.length) return { ...base, reason: 'resolution-failed', note: 'No sources for this episode' };

  const chosen = pickByIdOrLabel(pool, server);
  return {
    ...base,
    category: variant.id,
    server: chosen.label,
    streamResolved: true,
    link: absoluteUrl(chosen.url),
    tracks: (chosen.tracks || []).map((t) => ({
      file: absoluteUrl(t.src),
      label: t.label,
      kind: 'captions',
      default: Boolean(t.default),
    })),
  };
};
