import { anvPost, getSessionCookie, invalidateSession, absoluteUrl, httpError, ANV_BASE_URL } from '../_shared.js';
import { getAnvAnime } from './catalog.js';

const SLUG_CACHE_TTL_MS = 10 * 60 * 1000;
const slugToId = new Map(); // slug -> { id, expiresAt }

// /api/episode wants anv's numeric id; accept either that or the slug.
const resolveAnvId = async (animeId) => {
  if (/^\d+$/.test(animeId)) return Number(animeId);
  const hit = slugToId.get(animeId);
  if (hit && Date.now() < hit.expiresAt) return hit.id;
  const { anvId } = await getAnvAnime(animeId);
  slugToId.set(animeId, { id: anvId, expiresAt: Date.now() + SLUG_CACHE_TTL_MS });
  return anvId;
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

export const getAnvEpisodeSources = async ({ animeId, ep, category = 'sub', server }) => {
  const episode = Number(ep);
  if (!Number.isInteger(episode) || episode < 1) throw httpError('ep must be a positive integer', 400);

  const anvId = await resolveAnvId(animeId);
  const referer = /^\d+$/.test(animeId) ? `${ANV_BASE_URL}/` : `${ANV_BASE_URL}/anime/${animeId}-episode-${episode}`;
  const res = await requestEpisode(
    { anilistId: anvId, malId: null, episode, first: true, prefer: category },
    referer,
  );

  const base = {
    source: 'anv',
    animeId,
    anvId,
    episode,
    category,
    server: null,
    servers: [],
    streamResolved: false,
    reason: null,
    note: null,
    link: null,
    tracks: [],
    intro: null,
    outro: null,
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
    availableCategories: variants.map((v) => v.id),
    server: chosen.label,
    servers: pool.map((s) => ({ serverId: s.id, name: s.label })),
    streamResolved: true,
    link: absoluteUrl(chosen.url),
    tracks: (chosen.tracks || []).map((t) => ({
      file: absoluteUrl(t.src),
      label: t.label,
      lang: t.language,
      kind: 'captions',
      default: Boolean(t.default),
    })),
  };
};
