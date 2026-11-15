import { wrapController } from './_cache.js';
import { getAnvHome, getAnvSearch, getAnvBrowse, getAnvAnime } from '../scraper/catalog.js';
import { getAnvEpisodeSources, getAnvEpisodeServers } from '../scraper/episode-sources.js';
import { proxyAnvStream } from '../scraper/proxy.js';
import { getRequestOrigin } from '../../utils/request-origin.js';

const API_BASE = '/api/v2/anv';
const PROXY_BASE_PATH = `${API_BASE}/proxy`;
const SOURCES_CACHE_TTL_MS = 60 * 1000; // stream tokens are short-lived

const pageParam = (c) => Math.max(1, Number.parseInt(c.req.query('page'), 10) || 1);

export const anvHomeController = wrapController({ cacheKey: () => 'home', handler: () => getAnvHome() });

export const anvBrowseController = wrapController({
  cacheKey: (c) => `browse:${pageParam(c)}`,
  handler: (c) => getAnvBrowse({ page: pageParam(c) }),
});

export const anvSearchController = async (c) => {
  const q = (c.req.query('q') || '').trim();
  if (!q) return c.json({ success: false, error: 'q query parameter is required' }, 400);
  return wrapController({
    cacheKey: () => `search:${q.toLowerCase()}:${pageParam(c)}`,
    handler: () => getAnvSearch({ q, page: pageParam(c) }),
  })(c);
};

export const anvAnimeController = wrapController({
  cacheKey: (c) => `anime:${c.req.param('animeId')}`,
  handler: (c) => getAnvAnime(c.req.param('animeId')),
});

export const anvEpisodesController = wrapController({
  cacheKey: (c) => `episodes:${c.req.param('animeId')}`,
  handler: async (c) => {
    const { id, episodesList } = await getAnvAnime(c.req.param('animeId'));
    return { animeId: id, totalEpisodes: episodesList.length, episodes: episodesList };
  },
});

export const anvEpisodeServersController = wrapController({
  cacheKey: (c) => `servers:${c.req.query('animeId') || c.req.query('animeEpisodeId')}:${c.req.query('ep')}`,
  handler: (c) =>
    getAnvEpisodeServers({ animeId: c.req.query('animeId') || c.req.query('animeEpisodeId'), ep: c.req.query('ep') }),
});

// ---- sources (hianime-shaped) ------------------------------------------------

const sourcesCache = new Map();

const proxied = (origin, url, ext = '') =>
  `${origin}${PROXY_BASE_PATH}${ext ? `/stream${ext}` : ''}?url=${encodeURIComponent(url)}`;

const withProxiedSources = (c, data, params) => {
  const origin = getRequestOrigin(c);
  if (!data.link) return { ...data, sources: [] };
  const play = new URLSearchParams({ animeId: params.animeId, ep: String(params.ep), category: data.category });
  if (data.server) play.set('server', data.server);
  return {
    ...data,
    // Raw anv /stream URLs need anv's session cookie, so tracks go through our proxy too.
    tracks: data.tracks.map((t) => ({ ...t, file: proxied(origin, t.file, '.vtt') })),
    sources: [
      {
        url: data.link,
        type: 'm3u8',
        quality: 'auto',
        proxyM3u8: `${origin}${API_BASE}/play?${play.toString()}`,
        embeddedUrl: proxied(origin, data.link, '.m3u8'),
      },
    ],
  };
};

export const anvEpisodeSourcesController = async (c) => {
  try {
    const startTime = Date.now();
    const { ep, server } = c.req.query();
    const animeId = c.req.query('animeId') || c.req.query('animeEpisodeId');
    const category = c.req.query('category') === 'dub' ? 'dub' : 'sub';
    if (!animeId || !ep) {
      return c.json({ success: false, error: 'animeId and ep query parameters are required' }, 400);
    }

    const key = [animeId, ep, category, server || ''].join(':');
    const hit = sourcesCache.get(key);
    let data = hit && Date.now() < hit.expiresAt ? hit.value : null;
    if (!data) {
      data = await getAnvEpisodeSources({ animeId, ep, category, server });
      if (data.streamResolved) sourcesCache.set(key, { value: data, expiresAt: Date.now() + SOURCES_CACHE_TTL_MS });
    }

    const extractionTimeSec = Number(((Date.now() - startTime) / 1000).toFixed(3));
    return c.json({ success: true, data: withProxiedSources(c, data, { animeId, ep }), extractionTimeSec });
  } catch (error) {
    return c.json({ success: false, error: error.message }, error.status || 500);
  }
};

export const anvProxyController = async (c) => {
  try {
    const url = c.req.query('url');
    if (!url) return c.json({ success: false, error: 'url query parameter is required' }, 400);
    const result = await proxyAnvStream({ url, basePath: PROXY_BASE_PATH });
    c.header('Content-Type', result.contentType);
    c.header('Access-Control-Allow-Origin', '*');
    c.header('Cache-Control', 'no-store');
    return c.body(result.body);
  } catch (error) {
    return c.json({ success: false, error: error.message }, error.status || 500);
  }
};
