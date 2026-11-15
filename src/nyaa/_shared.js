import { axios } from '../utils/scrapper-deps.js';
import env from '../config/env.js';

// Metadata comes from AniList's official GraphQL API; torrents come from Nyaa.
// Nyaa base URLs are an ordered failover list (NYAA_BASE_URLS, comma-separated)
// so a domain move is an env change, not a code change.
export const ANILIST_GRAPHQL_URL = 'https://graphql.anilist.co';
export const ANILIST_SITE_URL = 'https://anilist.co';
// Remote torrent player: its servers fetch the torrent, the viewer only streams.
export const WEBTOR_BASE_URL = 'https://webtor.io';

const DEFAULT_NYAA_BASE = 'https://nyaa.si';
const REQUEST_TIMEOUT_MS = 15000;

export const NYAA_CATEGORY = {
  ALL_ANIME: '1_0',
  ENGLISH: '1_2',
  RAW: '1_4',
};

// Nyaa's own tracker plus well-known open trackers, appended to every magnet.
export const NYAA_TRACKERS = Object.freeze([
  'http://nyaa.tracker.wf:7777/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://tracker.torrent.eu.org:451/announce',
]);

export const DEFAULT_HEADERS = Object.freeze({
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  Accept: 'application/rss+xml, application/xml, text/html;q=0.9, */*;q=0.8',
});

const splitList = (value) =>
  String(value || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);

export const getNyaaBaseUrls = () => {
  const list = splitList(env.NYAA_BASE_URLS);
  return list.length ? list : [DEFAULT_NYAA_BASE];
};

export const getPreferredGroups = () =>
  splitList(env.NYAA_PREFERRED_GROUPS).map((g) => g.toLowerCase());

export const httpError = (message, status) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

/**
 * GET a Nyaa path (e.g. "/?page=rss&q=x"), trying each configured base URL in
 * order. Returns { data, baseUrl } from the first base that answers 2xx.
 */
export const nyaaGet = async (pathWithQuery) => {
  const errors = [];
  for (const baseUrl of getNyaaBaseUrls()) {
    try {
      const res = await axios.get(`${baseUrl}${pathWithQuery}`, {
        headers: DEFAULT_HEADERS,
        timeout: REQUEST_TIMEOUT_MS,
        responseType: 'text',
        proxy: false,
      });
      return { data: res.data, baseUrl };
    } catch (error) {
      errors.push(`${baseUrl}: ${error.response?.status || error.code || error.message}`);
    }
  }
  throw httpError(`All Nyaa mirrors failed (${errors.join('; ')})`, 502);
};

export const buildMagnet = (infoHash, name) => {
  const params = [`xt=urn:btih:${infoHash}`];
  if (name) params.push(`dn=${encodeURIComponent(name)}`);
  NYAA_TRACKERS.forEach((tr) => params.push(`tr=${encodeURIComponent(tr)}`));
  return `magnet:?${params.join('&')}`;
};

export const slugify = (text) =>
  String(text || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

// animeId is "<slug>-<anilistId>" (hianime style) or a bare AniList id.
export const parseAnimeId = (raw) => {
  const value = String(raw || '').trim();
  const match = value.match(/(?:^|-)(\d{1,9})$/);
  if (!match) {
    throw httpError('animeId must end with an AniList id (e.g. sousou-no-frieren-154587)', 400);
  }
  return Number(match[1]);
};

export const toPositiveInt = (value, fallback = null) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
