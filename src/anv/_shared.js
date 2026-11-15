import { axios } from '../utils/scrapper-deps.js';
import { scraplingFetch } from '../scrapling/index.js';
import { DEFAULT_UA } from '../hianime/scraper/_shared.js';

export const ANV_BASE_URL = 'https://anv.to';
export { DEFAULT_UA };

// anv gates /api/episode and every /stream/* URL on an httpOnly cookie that its
// front-end JS obtains. Plain HTTP (even with TLS impersonation) gets a 403, so we
// let Scrapling's stealth browser load the site once and hand us the cookie.
// Stream tokens are bound to the cookie that requested them, so the whole process
// shares ONE cookie; it is only replaced when /api/episode rejects it.
const SESSION_COOKIE = 'shiro_watch';
const BROWSER_TIMEOUT_S = 40;
const REQUEST_TIMEOUT_MS = 20000;

let sessionCookie = process.env.ANV_COOKIE || null; // optional manual override, e.g. on hosts without Python
let pendingSession = null;

export const httpError = (message, status = 502) => Object.assign(new Error(message), { status });

const launchSession = async () => {
  const result = await scraplingFetch({
    url: `${ANV_BASE_URL}/`,
    stealth: true,
    wait_cookie: SESSION_COOKIE,
    timeout: BROWSER_TIMEOUT_S,
  });
  const value = result?.cookies?.[SESSION_COOKIE];
  if (!value) {
    throw httpError(`anv session cookie was not issued${result?.error ? `: ${result.error}` : ''}`);
  }
  return `${SESSION_COOKIE}=${value}`;
};

// Single-flight: concurrent callers share one browser launch.
export const getSessionCookie = async () => {
  if (sessionCookie) return sessionCookie;
  pendingSession ??= launchSession()
    .then((cookie) => {
      sessionCookie = cookie;
      return cookie;
    })
    .finally(() => {
      pendingSession = null;
    });
  return pendingSession;
};

// Drop the cookie only if it is still the one that failed (avoids thrashing).
export const invalidateSession = (cookie) => {
  if (sessionCookie === cookie) sessionCookie = null;
};

const baseHeaders = (cookie, referer) => ({
  'User-Agent': DEFAULT_UA,
  Accept: 'application/json',
  Origin: ANV_BASE_URL,
  Referer: referer || `${ANV_BASE_URL}/`,
  ...(cookie ? { Cookie: cookie } : {}),
});

export const anvPost = (path, body, { cookie, referer } = {}) =>
  axios.post(`${ANV_BASE_URL}${path}`, body, {
    proxy: false,
    timeout: REQUEST_TIMEOUT_MS,
    validateStatus: () => true,
    headers: { ...baseHeaders(cookie, referer), 'Content-Type': 'application/json' },
  });

export const anvGetRaw = (url, cookie) =>
  axios.get(url, {
    proxy: false,
    timeout: 30000,
    responseType: 'arraybuffer',
    maxRedirects: 5,
    validateStatus: () => true,
    headers: { ...baseHeaders(cookie), Accept: '*/*' },
  });

// /api/catalog is a GraphQL-ish {operation, variables} endpoint and needs no cookie.
export const catalog = async (operation, variables = {}) => {
  const res = await anvPost('/api/catalog', { operation, variables });
  if (res.status !== 200 || !res.data?.data) {
    throw httpError(`anv catalog ${operation} failed (${res.status})`, res.status === 429 ? 429 : 502);
  }
  return res.data.data;
};

export const absoluteUrl = (path) => (path ? new URL(path, ANV_BASE_URL).toString() : null);

export const mapMedia = (m) => ({
  id: m.slug,
  anvId: m.id,
  malId: m.idMal ?? null,
  title: m.title?.english || m.title?.romaji || null,
  romajiTitle: m.title?.romaji || null,
  poster: m.coverImage?.extraLarge || m.coverImage?.large || null,
  banner: m.bannerImage || null,
  format: m.format || null,
  status: m.status || null,
  episodes: m.episodes ?? m.streamingEpisodes?.length ?? null,
  nextAiringEpisode: m.nextAiringEpisode?.episode ?? null,
  year: m.seasonYear ?? null,
  genres: m.genres || [],
  score: m.averageScore ?? null,
  isAdult: Boolean(m.isAdult),
});
