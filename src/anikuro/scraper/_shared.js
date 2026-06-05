import { axios } from '../../utils/scrapper-deps.js';

export const ANIKURO_BASE_URL = 'https://anikuro.ru';
export const DEFAULT_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export const WATCH_SOURCE_PROVIDERS = [
  { key: 'animepahe', label: 'Pahe', nameId: 'animepahe' },
  { key: 'anikoto', label: 'Anikoto', nameId: 'anikoto' },
  { key: 'reanime', label: 'ReAnime', nameId: 'reanime' },
  { key: 'animedao', label: 'AnimeDao', nameId: 'animedao' },
  { key: 'allanime', label: 'AllAni', nameId: 'allanime' },
  { key: 'animix', label: 'AnimiX', nameId: 'animix' },
  { key: 'senshi', label: 'Senshi', nameId: 'senshi' },
];

export const pageHeaders = (referer) => ({
  'User-Agent': DEFAULT_UA,
  Accept: 'application/json, text/plain, */*',
  Referer: referer || ANIKURO_BASE_URL,
});

export const parseAnimeEpisodeRef = (animeEpisodeId, epQuery) => {
  if (!animeEpisodeId) return null;

  const raw = animeEpisodeId
    .split('#')[0]
    .split('?')[0]
    .replace(/^\/watch\//, '')
    .replace(/\/$/, '')
    .trim();

  if (!raw) return null;

  const colonMatch = raw.match(/^(\d+):(\d+)$/);
  if (colonMatch) {
    return {
      anilistId: Number(colonMatch[1]),
      episode: Number(colonMatch[2]),
    };
  }

  const idMatch = raw.match(/^(\d+)$/);
  if (idMatch) {
    const episode = epQuery && Number(epQuery) > 0 ? Number(epQuery) : 1;
    return {
      anilistId: Number(idMatch[1]),
      episode,
    };
  }

  return null;
};

export const normalizeServer = (server) => {
  const raw = String(server || 'animepahe').toLowerCase().replace(/\s+/g, '-').trim();
  if (raw === 'pahe') return 'animepahe';
  if (raw === 'allani') return 'allanime';
  return raw || 'animepahe';
};

export const normalizeCategory = (category) => {
  const value = String(category || 'sub').toLowerCase().trim();
  if (value === 'dub' || value === 'd') return 'dub';
  return 'sub';
};

export const toAbsoluteUrl = (url) => {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${ANIKURO_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
};

export const fetchJson = async (path, { referer } = {}) => {
  const url = `${ANIKURO_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
  const response = await axios.get(url, {
    proxy: false,
    timeout: 20000,
    headers: pageHeaders(referer),
  });

  return {
    url,
    payload: response?.data ?? null,
  };
};
