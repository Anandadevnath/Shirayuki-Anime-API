import { fetchAnilistMedia, buildAnimeId, availableEpisodes } from './anilist.js';
import { searchNyaa } from './rss.js';
import { parseSeason, stripSeason, releaseCoversEpisode } from './release-parser.js';
import env from '../../config/env.js';
import { WEBTOR_BASE_URL, getPreferredGroups, httpError, toPositiveInt, parseAnimeId, NYAA_CATEGORY } from '../_shared.js';

const MAX_SERVERS_PER_CATEGORY = 15;
const MAX_TITLE_VARIANTS = 2;
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;
const cache = new Map();

// ---------- id helpers ----------

/**
 * Accepts `episodeId=<anilistId>-ep-<n>` or `animeEpisodeId=<slug-anilistId>&ep=<n>`.
 * @returns {{ animeRef: string, ep: number }}
 */
export const resolveEpisodeRef = ({ episodeId, animeEpisodeId, ep } = {}) => {
  const fromEpisodeId = String(episodeId || '').match(/^(\d{1,9})-ep-(\d{1,5})$/);
  if (fromEpisodeId) return { animeRef: fromEpisodeId[1], ep: Number(fromEpisodeId[2]) };
  if (!animeEpisodeId) throw httpError('episodeId (or animeEpisodeId + ep) query parameter is required', 400);
  return { animeRef: String(animeEpisodeId), ep: toPositiveInt(ep, 1) };
};

// ---------- query building ----------

// Nyaa search treats "-" as exclusion and "|" / quotes as operators; keep words only.
const sanitizeQuery = (text) =>
  String(text || '')
    .normalize('NFKC')
    .replace(/[’']/g, '')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isMostlyAscii = (text) => /^[\x20-\x7E’]+$/.test(String(text || ''));

export const targetSeasonOf = (media) => {
  const titles = [media.title?.romaji, media.title?.english, ...(media.synonyms || [])];
  for (const t of titles) {
    const { season } = parseSeason(t || '');
    if (season) return season;
  }
  return 1;
};

/** Distinct search phrases: full romaji/english titles, then season-stripped bases. */
export const titleVariants = (media) => {
  const raw = [
    media.title?.romaji,
    media.title?.english,
    stripSeason(media.title?.romaji || ''),
    stripSeason(media.title?.english || ''),
    ...(media.synonyms || []).filter(isMostlyAscii),
  ];
  const seen = new Set();
  return raw
    .map(sanitizeQuery)
    .filter((t) => t.length >= 2)
    .filter((t) => {
      const key = t.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

/** Letters and digits only, lowercased, so "Spy x Family" == "SPY×FAMILY" punctuation-wise. */
export const normalizeTitle = (text) =>
  String(text || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');

/**
 * Every normalized name a release for this show may carry: full titles and
 * season-stripped bases (release parsing removes the season token too).
 */
export const showTitleKeys = (media) => {
  const names = [media.title?.romaji, media.title?.english, ...(media.synonyms || [])].filter(Boolean);
  return new Set([...names, ...names.map(stripSeason)].map(normalizeTitle).filter((t) => t.length >= 2));
};

const padEpisode = (ep) => String(ep).padStart(2, '0');

export const buildQueries = (media, ep) => {
  const variants = titleVariants(media);
  const base = sanitizeQuery(stripSeason(media.title?.romaji || media.title?.english || ''));
  const episodeQueries = variants.slice(0, MAX_TITLE_VARIANTS).map((v) => `${v} ${padEpisode(ep)}`);
  // Seeder-sorted base search surfaces batches/season packs that contain the episode.
  return [...new Set([...episodeQueries, base].filter(Boolean))];
};

// ---------- ranking ----------

const RESOLUTION_LADDER = [480, 720, 1080, 2160];

/**
 * Peak score at the preferred resolution. Bigger files cost more per step than
 * smaller ones: a torrent stream stalls when the bitrate exceeds the download speed.
 * Weighted to outrank a few-fold seeder difference.
 */
export const resolutionScore = (resolution, preferred = 720) => {
  const at = RESOLUTION_LADDER.indexOf(Number(resolution));
  const want = RESOLUTION_LADDER.indexOf(Number(preferred));
  if (at < 0 || want < 0) return 6;
  const steps = at - want;
  return Math.max(0, 20 - (steps > 0 ? 16 * steps : -8 * steps));
};

/**
 * Higher is better. Prefers trusted, seeded, preferred-group, preferred-resolution,
 * H.264 (browser-playable without transcoding), single-episode releases.
 */
export const scoreTorrent = (torrent, preferredGroups = [], preferredResolution = 720) => {
  const r = torrent.release;
  const groupIdx = preferredGroups.indexOf(String(r.group || '').toLowerCase());
  let score = 0;
  if (torrent.trusted) score += 30;
  if (groupIdx >= 0) score += Math.max(5, 25 - groupIdx * 4);
  score += Math.log2(torrent.seeders + 1) * 6;
  score += resolutionScore(r.resolution, preferredResolution);
  if (r.codec === 'h264') score += 12;
  else if (r.codec == null) score += 8; // SubsPlease etc. are H.264 but untagged
  if (r.is10bit) score -= 10;
  if (!r.isBatch) score += 15;
  return Math.round(score * 10) / 10;
};

const toServer = (torrent, ep, score) => {
  const r = torrent.release;
  const sel = r.isBatch ? `e${ep}` : 'auto';
  return {
    serverId: torrent.infoHash,
    name: [r.group, r.resolution ? `${r.resolution}p` : null, r.codec?.toUpperCase(), r.isBatch ? 'Batch' : null]
      .filter(Boolean)
      .join(' · '),
    category: r.isDualAudio ? 'dub' : 'sub',
    fileSelection: sel,
    score,
    title: torrent.title,
    infoHash: torrent.infoHash,
    magnet: torrent.magnet,
    webtorUrl: `${WEBTOR_BASE_URL}/${torrent.infoHash}`,
    torrentUrl: torrent.torrentUrl,
    viewUrl: torrent.viewUrl,
    size: torrent.size,
    seeders: torrent.seeders,
    leechers: torrent.leechers,
    trusted: torrent.trusted,
    pubDate: torrent.pubDate,
    release: r,
  };
};

/**
 * Filter torrents to the requested episode/season and rank them (pure).
 * @param {Array} torrents parsed RSS records
 * @param {{ ep: number, season: number, preferredGroups?: string[] }} opts
 */
export const rankTorrentsForEpisode = (
  torrents,
  { ep, season, preferredGroups = [], preferredResolution = 720, titleKeys = null },
) => {
  const byHash = new Map();
  torrents.forEach((t) => {
    if (!byHash.has(t.infoHash)) byHash.set(t.infoHash, t);
  });
  return [...byHash.values()]
    .filter((t) => t.seeders > 0 && !t.remake)
    // Exact show match: "One Piece Log - Fish-Man Island Saga - 01" is not One Piece ep 1.
    .filter((t) => !titleKeys || titleKeys.has(normalizeTitle(t.release.title)))
    .filter((t) => releaseCoversEpisode(t.release, { episode: ep, season }))
    .map((t) => toServer(t, ep, scoreTorrent(t, preferredGroups, preferredResolution)))
    .sort((a, b) => b.score - a.score);
};

// ---------- main ----------

const getCached = (key) => {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  cache.delete(key);
  return null;
};

export const getNyaaEpisodeServers = async (params = {}) => {
  const { animeRef, ep } = resolveEpisodeRef(params);
  // Keyed by the AniList id inside animeRef, so cache hits skip AniList entirely.
  const cacheKey = `${parseAnimeId(animeRef)}:${ep}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;
  const media = await fetchAnilistMedia(animeRef);

  const aired = availableEpisodes(media);
  if (aired != null && aired > 0 && ep > aired) {
    throw httpError(`Episode ${ep} has not aired yet (latest is ${aired})`, 404);
  }

  const queries = buildQueries(media, ep);
  const results = await Promise.allSettled(
    queries.map((q) => searchNyaa({ q, c: NYAA_CATEGORY.ENGLISH, f: '0', s: 'seeders' })),
  );
  const ok = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  if (!ok.length) {
    throw httpError(`Nyaa search failed: ${results[0]?.reason?.message || 'unknown error'}`, 502);
  }

  const season = targetSeasonOf(media);
  const ranked = rankTorrentsForEpisode(
    ok.flatMap((r) => r.torrents),
    {
      ep,
      season,
      preferredGroups: getPreferredGroups(),
      preferredResolution: env.NYAA_PREFERRED_RESOLUTION,
      titleKeys: showTitleKeys(media),
    },
  );

  const value = {
    source: ok[0].source,
    animeId: buildAnimeId(media),
    anilistId: media.id,
    episodeId: `${media.id}-ep-${ep}`,
    episode: ep,
    season,
    queries,
    servers: {
      sub: ranked.slice(0, MAX_SERVERS_PER_CATEGORY),
      dub: ranked.filter((s) => s.category === 'dub').slice(0, MAX_SERVERS_PER_CATEGORY),
    },
  };
  cache.set(cacheKey, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
  return value;
};
