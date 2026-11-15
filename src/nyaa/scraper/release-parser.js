// Focused parser for fansub release names, e.g.
//   "[SubsPlease] Sousou no Frieren S2 - 05 (1080p) [6AAEC79A].mkv"
//   "[Erai-raws] Sousou no Frieren - 01 ~ 28 [1080p][HEVC][BATCH]"
// anitomyscript was considered but is unmaintained (last release 2022) and
// ships WASM; these patterns cover the releases Nyaa search actually returns.

const VIDEO_EXT_RE = /\.(mkv|mp4|avi|webm|m4v|ts)$/i;
const YEAR_RE = /^(19|20)\d{2}$/;

const SEASON_PATTERNS = [
  /\bS(\d{1,2})E(\d{1,4})\b/i, // S02E05 (also yields the episode)
  /\b(\d{1,2})(?:st|nd|rd|th)\s+Season\b/i,
  /\bSeason\s*(\d{1,2})\b/i,
  /\bS(\d{1,2})\b/i,
];

const parseGroup = (name) => name.match(/^\s*\[([^\]]+)\]/)?.[1]?.trim() || null;

const parseResolution = (name) => {
  const p = name.match(/\b(\d{3,4})p\b/i);
  if (p) return Number(p[1]);
  const wh = name.match(/\b\d{3,4}x(\d{3,4})\b/);
  return wh ? Number(wh[1]) : null;
};

const parseCodec = (name) => {
  if (/\b(HEVC|x265|H\.?265)\b/i.test(name)) return 'hevc';
  if (/\bAV1\b/i.test(name)) return 'av1';
  if (/\b(AVC|x264|H\.?264)\b/i.test(name)) return 'h264';
  return null;
};

/**
 * Find the season marker in a release/series title.
 * @param {string} text
 * @returns {{ season: number|null, episode: number|null, match: string|null }}
 */
export const parseSeason = (text) => {
  for (const re of SEASON_PATTERNS) {
    const m = String(text || '').match(re);
    if (m) {
      return {
        season: Number(m[1]),
        episode: m[2] ? Number(m[2]) : null,
        match: m[0],
      };
    }
  }
  return { season: null, episode: null, match: null };
};

const parseRange = (text) => {
  const m = text.match(/(?:^|[\s([])(\d{1,4})\s*(?:-|~|to)\s*(\d{1,4})(?=[\s)\]]|$)/i);
  if (!m) return null;
  const from = Number(m[1]);
  const to = Number(m[2]);
  return from < to ? { from, to, match: m[0] } : null;
};

const parseEpisode = (core) => {
  const dash = core.match(/\s-\s(\d{1,4})(?:v(\d))?(?=\s|$)/i);
  if (dash) return { episode: Number(dash[1]), version: dash[2] ? Number(dash[2]) : null, index: dash.index };
  const tagged = core.match(/\b(?:E|EP|Episode)\.?\s?(\d{1,4})(?:v(\d))?\b/i);
  if (tagged) return { episode: Number(tagged[1]), version: tagged[2] ? Number(tagged[2]) : null, index: tagged.index };
  const trailing = core.match(/\s(\d{1,4})(?:v(\d))?$/);
  if (trailing && !YEAR_RE.test(trailing[1])) {
    return { episode: Number(trailing[1]), version: trailing[2] ? Number(trailing[2]) : null, index: trailing.index };
  }
  return { episode: null, version: null, index: -1 };
};

const cleanTitle = (text) =>
  text
    .replace(/[_.]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[\s\-:~|]+$/g, '')
    .trim() || null;

/**
 * Parse a fansub release / file name into structured fields.
 * @param {string} rawName
 */
export const parseRelease = (rawName) => {
  const name = String(rawName || '').trim();
  const group = parseGroup(name);
  const extension = name.match(VIDEO_EXT_RE)?.[1]?.toLowerCase() || null;

  const withoutGroup = name.replace(/^\s*\[[^\]]+\]\s*/, '').replace(VIDEO_EXT_RE, '');
  const season = parseSeason(withoutGroup);
  // Remove the season token first so "Season 2 - 10" is not read as a 2-10 range.
  const seasonless = season.match ? withoutGroup.replace(season.match, ' ') : withoutGroup;
  const range = parseRange(seasonless);

  const core = seasonless
    .replace(/\[[^\]]*\]|\([^)]*\)|\{[^}]*\}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const ep = range ? { episode: null, version: null, index: -1 } : parseEpisode(core);
  const episode = season.episode ?? ep.episode;

  let titleSource = core;
  if (season.episode != null) {
    // "Show.Name.S01E05.1080p" -> everything before the SxxEyy token is the title.
    titleSource = withoutGroup.slice(0, withoutGroup.indexOf(season.match)).replace(/\[[^\]]*\]|\([^)]*\)/g, ' ');
  } else if (ep.index >= 0) titleSource = core.slice(0, ep.index);
  else if (range) titleSource = core.split(range.match.trim())[0];
  const hasEpisode = episode != null && !range;
  // A season marker with no episode/range ("(Season 1) [1080p]") is a full-season pack.
  const isSeasonPack = !hasEpisode && !range && Boolean(season.match);
  const versionTag = name.match(/\[V(\d)\]|\bv(\d)\b/i);

  return {
    group,
    title: cleanTitle(titleSource),
    season: season.season,
    episode: range ? null : episode,
    episodeRange: range ? { from: range.from, to: range.to } : null,
    isBatch: Boolean(range) || isSeasonPack || (!hasEpisode && /\b(batch|complete)\b/i.test(name)),
    resolution: parseResolution(name),
    codec: parseCodec(name),
    is10bit: /\b(10[\s-]?bit|Hi10P?)\b/i.test(name),
    isDualAudio: /\b(dual[\s.-]?audio|multi[\s.-]?audio|dubbed|english dub|eng dub)\b/i.test(name),
    version: ep.version ?? (versionTag ? Number(versionTag[1] || versionTag[2]) : null),
    extension,
  };
};

/** Does this parsed release contain the requested episode (and season)? */
export const releaseCoversEpisode = (parsed, { episode, season }) => {
  const releaseSeason = parsed.season ?? 1;
  if ((season ?? 1) !== releaseSeason) return false;
  if (parsed.episode != null) return parsed.episode === episode;
  if (parsed.episodeRange) return episode >= parsed.episodeRange.from && episode <= parsed.episodeRange.to;
  // Season pack without an explicit range: the worker picks the file by episode.
  return parsed.isBatch;
};

/** Strip season markers to get a franchise base title for searching. */
export const stripSeason = (title) => {
  const { match } = parseSeason(title);
  const base = match ? String(title).replace(match, ' ') : String(title || '');
  return base
    .replace(/\b(Part|Cour)\s*\d+\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[\s\-:]+$/g, '')
    .trim();
};

export const isVideoFileName = (name) => VIDEO_EXT_RE.test(String(name || ''));
