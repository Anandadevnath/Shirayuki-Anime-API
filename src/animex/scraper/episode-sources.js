import {
  ANIMEX_BASE_URL,
  ANIMEX_PP_BASE_URL,
  CDN_REFERER,
  DEFAULT_UA,
  normalizeCategory,
} from '../_shared.js';
import { fetchAnimeInfo } from './anime.js';
import { noteDiscoveredHost } from './proxy.js';
import { axios } from '../../utils/scrapper-deps.js';

// Chapters on /rest/api/sources come as [{title, start, end}]; extract the
// classic intro/outro pair when present.
const findChapters = (chapters = []) => {
  const intro = chapters.find((ch) => /intro|opening|op\b/i.test(ch.title || '')) || null;
  const outro = chapters.find((ch) => /outro|ending|ed\b/i.test(ch.title || '')) || null;
  return {
    intro: intro ? { start: intro.start, end: intro.end } : null,
    outro: outro ? { start: outro.start, end: outro.end } : null,
  };
};

// Fetch raw sources for (internalId, epNum, category, providerId).
export const fetchAnimexSources = async ({ internalId, epNum, category, providerId }) => {
  const { data } = await axios.get(`${ANIMEX_PP_BASE_URL}/rest/api/sources`, {
    proxy: false,
    timeout: 20000,
    params: { id: internalId, epNum, type: category, providerId },
    headers: {
      'User-Agent': DEFAULT_UA,
      Accept: 'application/json, */*',
      Origin: ANIMEX_BASE_URL,
      Referer: CDN_REFERER,
    },
  });

  if (data?.error) {
    throw new Error(data.error);
  }
  return data;
};

// Resolve a playable stream for one episode. Tries the requested provider
// first (default provider when unspecified), then the rest of the category's
// providers, then falls back to the other category if the requested one is dry.
export const getAnimexEpisodeSources = async ({
  animeId,
  ep,
  server,
  category,
} = {}) => {
  const clean = String(animeId || '').trim();
  if (!clean) {
    const err = new Error('animeId query parameter is required (e.g. naruto-20)');
    err.status = 400;
    throw err;
  }

  const requestedCategory = normalizeCategory(category);
  const episodeNumber = Number(ep) > 0 ? Number(ep) : 1;

  const { details, internalId } = await fetchAnimeInfo(clean);

  const { data: serversData } = await axios.get(`${ANIMEX_PP_BASE_URL}/rest/api/servers`, {
    proxy: false,
    timeout: 20000,
    params: { id: internalId, epNum: episodeNumber },
    headers: {
      'User-Agent': DEFAULT_UA,
      Accept: 'application/json, */*',
      Origin: ANIMEX_BASE_URL,
      Referer: CDN_REFERER,
    },
  });

  if (serversData?.error) {
    const err = new Error(serversData.error);
    err.status = 404;
    throw err;
  }

  const pools = {
    sub: serversData.subProviders || [],
    dub: serversData.dubProviders || [],
  };

  // Pick the requested category; fall back to whichever has providers.
  let cat = requestedCategory;
  let pool = pools[cat] || [];
  if (!pool.length && cat === 'sub' && pools.dub.length) {
    cat = 'dub';
    pool = pools.dub;
  } else if (!pool.length && cat === 'dub' && pools.sub.length) {
    cat = 'sub';
    pool = pools.sub;
  }

  // Requested server (providerId) first, then the default one, then the rest.
  const target = String(server || '').trim().toLowerCase();
  const isMatch = (p) => {
    if (!target) return false;
    return String(p.id || '').toLowerCase() === target;
  };
  const ordered = [
    ...pool.filter(isMatch),
    ...pool.filter((p) => p.default && !isMatch(p)),
    ...pool.filter((p) => !isMatch(p) && !p.default),
  ];

  const base = {
    source: `${ANIMEX_PP_BASE_URL}/rest/api/sources?id=${internalId}&epNum=${episodeNumber}`,
    animeId: details.publicId,
    internalId,
    episode: episodeNumber,
    category: cat,
    server: null,
    streamResolved: false,
    reason: null,
    note: null,
    link: null,
    tracks: [],
    intro: null,
    outro: null,
    referer: CDN_REFERER,
  };

  if (!ordered.length) {
    return { ...base, reason: 'resolution-failed', note: 'No usable provider selected' };
  }

  let lastError = null;
  for (const provider of ordered) {
    try {
      const payload = await fetchAnimexSources({
        internalId,
        epNum: episodeNumber,
        category: cat,
        providerId: provider.id,
      });

      const sources = payload.sources || [];
      const source = sources[0] || null;
      if (!source?.url) {
        throw new Error('provider returned no stream url');
      }

      // Each provider rides its own CDN with its own header requirements
      // (nero -> aniwatchtv.site + animex.one, yuki -> nexabloom.top +
      // megaplay.buzz, zuna -> dramahot.top + zokoanime.video). Register the
      // resolved hosts with the proxy allow-list and surface the headers the
      // upstream told us to use so the proxy can replay them.
      sources.forEach((s) => s.url && noteDiscoveredHost(s.url));
      (payload.tracks || []).forEach((t) => t.url && noteDiscoveredHost(t.url));
      const upstreamReferer = payload.headers?.Referer || CDN_REFERER;
      const upstreamOrigin = payload.headers?.Origin || null;

      return {
        ...base,
        server: provider.id,
        serverTip: provider.tip || null,
        streamResolved: true,
        link: source.url,
        type: /m3u8|mpegurl/i.test(source.type || source.url) ? 'm3u8' : 'mp4',
        quality: source.quality || 'auto',
        headers: payload.headers || {},
        tracks: (payload.tracks || []).map((t) => ({ url: t.url, lang: t.label || t.language || t.id || null })),
        ...findChapters(payload.chapters || []),
        referer: upstreamReferer,
        origin: upstreamOrigin,
      };
    } catch (error) {
      lastError = error;
    }
  }

  return {
    ...base,
    server: ordered[0]?.id || null,
    reason: 'resolution-failed',
    note: lastError?.message || 'all providers failed to resolve',
  };
};
