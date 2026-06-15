import { load, axios } from '../../utils/scrapper-deps.js';

// animex.one is an AniList-fronted SPA whose player streams through MegaPlay,
// exactly like anixo. Its watch iframe is:
//   https://megaplay.buzz/stream/ani/<anilistId>/<episode>/<sub|dub>
// so the servers/sources flow is the same MegaPlay round-trip used by anixo.
export const ANIMEX_BASE_URL = 'https://animex.one';
export const MEGAPLAY_BASE_URL = 'https://megaplay.buzz';
export const DEFAULT_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Servers that actually expose an extractable m3u8 through MegaPlay's getSources API.
export const WATCH_SERVERS = [
  { id: 'megaplay', nameId: 'megaplay', label: 'MegaPlay (AniList)', route: 'ani' },
  { id: 'megaplay-mal', nameId: 'megaplay-mal', label: 'MegaPlay (MAL)', route: 'mal' },
];

export const DEFAULT_SERVER = 'megaplay';

export const embedHeaders = (referer) => ({
  'User-Agent': DEFAULT_UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  Referer: referer || `${ANIMEX_BASE_URL}/`,
});

export const ajaxHeaders = (referer) => ({
  'User-Agent': DEFAULT_UA,
  Accept: '*/*',
  'X-Requested-With': 'XMLHttpRequest',
  Referer: referer || `${MEGAPLAY_BASE_URL}/`,
});

// Accept "21", "21:1", "21-one-piece" or a "one-piece-21-episode-1" style slug,
// resolving to { animeId, episode }. The episode falls back to `epQuery` or 1.
export const parseAnimeEpisodeRef = (animeEpisodeId, epQuery) => {
  if (!animeEpisodeId) return null;

  let raw = String(animeEpisodeId)
    .split('#')[0]
    .split('?')[0]
    .replace(/^\/watch\//, '')
    .replace(/\/$/, '')
    .trim();

  if (!raw) return null;

  // "21:1" -> id 21, episode 1
  const colonMatch = raw.match(/^(\d+):(\d+)$/);
  if (colonMatch) {
    return { animeId: Number(colonMatch[1]), episode: Number(colonMatch[2]) };
  }

  // "...-<id>-episode-<n>" slug (e.g. one-piece-21-episode-1)
  const slugMatch = raw.match(/(\d+)-episode-(\d+)/i);
  if (slugMatch) {
    return { animeId: Number(slugMatch[1]), episode: Number(slugMatch[2]) };
  }

  // Plain numeric id, episode from ?ep= (default 1)
  const idMatch = raw.match(/(\d+)/);
  if (idMatch) {
    const episode = epQuery && Number(epQuery) > 0 ? Number(epQuery) : 1;
    return { animeId: Number(idMatch[1]), episode };
  }

  return null;
};

export const normalizeServer = (server) => {
  const raw = String(server || DEFAULT_SERVER).toLowerCase().replace(/\s+/g, '-').trim();
  if (!raw || raw === 'hd-1' || raw === 'megaplay-ani' || raw === 'ani') return 'megaplay';
  if (raw === 'mal' || raw === 'megaplay-2' || raw === 'hd-2') return 'megaplay-mal';
  return raw;
};

export const normalizeCategory = (category) => {
  const value = String(category || 'sub').toLowerCase().trim();
  return value === 'dub' || value === 'd' ? 'dub' : 'sub';
};

export const pickServer = (requestedServer) => {
  const target = normalizeServer(requestedServer);
  return WATCH_SERVERS.find((server) => server.id === target) || null;
};

// MegaPlay embed URL, e.g. https://megaplay.buzz/stream/ani/21/1/sub
export const buildEmbedUrl = (route, animeId, episode, category) =>
  `${MEGAPLAY_BASE_URL}/stream/${route}/${animeId}/${episode}/${category}`;

// Fetch the embed page and extract the internal media id used by getSources.
export const fetchEmbedDataId = async (embedUrl, referer) => {
  const { data } = await axios.get(embedUrl, {
    proxy: false,
    timeout: 20000,
    headers: embedHeaders(referer),
  });

  const $ = load(data);
  const player = $('#megaplay-player').first();
  const dataId =
    player.attr('data-id') ||
    $('[data-id]').first().attr('data-id') ||
    null;

  return dataId ? String(dataId).trim() : null;
};

// Call MegaPlay's getSources endpoint with the extracted media id.
export const fetchGetSources = async (dataId, embedUrl) => {
  const url = `${MEGAPLAY_BASE_URL}/stream/getSources?id=${encodeURIComponent(dataId)}`;
  const { data } = await axios.get(url, {
    proxy: false,
    timeout: 20000,
    headers: ajaxHeaders(embedUrl),
  });

  return data || null;
};

// One round-trip: embed page -> data-id -> getSources payload.
export const resolveMegaplaySources = async ({ route, animeId, episode, category }) => {
  const embedUrl = buildEmbedUrl(route, animeId, episode, category);
  const dataId = await fetchEmbedDataId(embedUrl, `${ANIMEX_BASE_URL}/`);
  if (!dataId) {
    return { embedUrl, dataId: null, payload: null };
  }

  const payload = await fetchGetSources(dataId, embedUrl);
  return { embedUrl, dataId, payload };
};
