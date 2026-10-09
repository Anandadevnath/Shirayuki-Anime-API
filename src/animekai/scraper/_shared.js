import { load, axios } from '../../utils/scrapper-deps.js';

export const ANIMEKAI_BASE_URL = 'https://animekai.ro';
export const MEGAVID_BASE_URL = 'https://megavid.buzz';
export const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// Widget slugs supported by ajax/home/widget/{slug}.
export const HOME_WIDGETS = [
  'updated-all',
  'updated-sub',
  'updated-dub',
  'trending',
  'random',
  'completed',
  'top-airing',
  'most-popular',
  'latest-episode',
  'recently-updated',
];

export const DEFAULT_SERVER = 'ani-hd';

export const pageHeaders = (referer) => ({
  'User-Agent': DEFAULT_UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  Referer: referer || `${ANIMEKAI_BASE_URL}/`,
});

export const ajaxHeaders = (referer) => ({
  'User-Agent': DEFAULT_UA,
  Accept: 'application/json, text/javascript, */*; q=0.01',
  'X-Requested-With': 'XMLHttpRequest',
  Referer: referer || `${ANIMEKAI_BASE_URL}/`,
});

export const pageGet = async (url, referer) => {
  const { data } = await axios.get(url, {
    proxy: false,
    timeout: 25000,
    headers: pageHeaders(referer),
  });
  return data;
};

export const ajaxGet = async (path, referer) => {
  const { data } = await axios.get(`${ANIMEKAI_BASE_URL}${path}`, {
    proxy: false,
    timeout: 20000,
    headers: ajaxHeaders(referer),
  });
  return data;
};

// "one-piece-ewc5jc" -> { slug: 'one-piece', animeId: 'ewc5jc' }
export const parseAnimeSlug = (raw) => {
  const clean = String(raw || '').trim().replace(/^\/+|\/+$/g, '');
  if (!clean) return null;
  const m = clean.match(/^(.*?)-([a-z0-9]{6})$/i);
  if (m) return { slug: m[1], animeId: m[2] };
  return { slug: clean, animeId: null };
};

// Normalise any of: full watch url, "one-piece-ewc5jc/ep-2", "one-piece-ewc5jc", "ewc5jc"
export const parseAnimeEpisodeRef = (ref, epQuery) => {
  if (!ref) return null;
  const raw = String(ref)
    .split('#')[0]
    .split('?')[0]
    .replace(/^https?:\/\/[^/]+\//, '')
    .replace(/\/$/, '')
    .trim();

  const watchMatch = raw.match(/(?:^|\/)watch\/([^/]+?)(?:\/ep-(\d+))?$/);
  if (watchMatch) {
    const parsed = parseAnimeSlug(watchMatch[1]);
    return {
      slug: parsed?.slug || null,
      animeId: parsed?.animeId || null,
      episode: Number(watchMatch[2]) || Number(epQuery) || 1,
    };
  }

  const animeMatch = raw.match(/(?:^|\/)anime\/([^/?#]+)/);
  if (animeMatch) {
    const parsed = parseAnimeSlug(animeMatch[1]);
    return {
      slug: parsed?.slug || null,
      animeId: parsed?.animeId || null,
      episode: Number(epQuery) > 0 ? Number(epQuery) : 1,
    };
  }

  // Bare value: either "slug-animeId" or just the 6-char animeId.
  const bare = raw.replace(/^\/+/, '');
  const parsed = parseAnimeSlug(bare);
  if (parsed?.animeId) {
    return { slug: parsed.slug, animeId: parsed.animeId, episode: Number(epQuery) || 1 };
  }
  if (/^[a-z0-9]{6}$/i.test(bare)) {
    return { slug: null, animeId: bare.toLowerCase(), episode: Number(epQuery) || 1 };
  }

  return null;
};

export const normalizeCategory = (category) => {
  const value = String(category || 'sub').toLowerCase().trim();
  return value === 'dub' || value === 'd' ? 'dub' : 'sub';
};

// Server labels on the watch page: Ani-HD, HD, HD-1
export const normalizeServer = (server) => {
  const raw = String(server || DEFAULT_SERVER).toLowerCase().replace(/\s+/g, '').trim();
  if (!raw || raw === 'ani-hd' || raw === 'anihd') return 'ani-hd';
  if (raw === 'hd-1' || raw === 'hd1') return 'hd-1';
  return 'hd';
};

export const buildWatchUrl = (slug, animeId, episode) =>
  `${ANIMEKAI_BASE_URL}/watch/${slug}-${animeId}/ep-${episode}`;

// Fetch a watch page. data-link-id values expire, so the watch page must be
// fetched fresh for every stream request.
export const fetchWatchPage = async (slug, animeId, episode) => {
  const url = buildWatchUrl(slug, animeId, episode);
  const { data } = await axios.get(url, {
    proxy: false,
    timeout: 25000,
    maxRedirects: 5,
    headers: pageHeaders(`${ANIMEKAI_BASE_URL}/`),
  });
  return { url, html: data };
};

// Parse #w-servers server buttons from a watch page.
export const parseWatchServers = (html) => {
  const $ = load(html);
  const collect = (type) =>
    $(`.server-items[data-type="${type}"] li.server-btn`)
      .map((_, el) => ({
        name: $(el).text().trim(),
        serverId: $(el).attr('data-id') || null,
        episodeId: $(el).attr('data-ep-id') || null,
        linkId: $(el).attr('data-link-id') || null,
        num: $(el).attr('data-num') || null,
      }))
      .get()
      .filter((s) => s.linkId);

  return { sub: collect('sub'), dub: collect('dub') };
};

// One round-trip: linkId -> ajax/server?get= -> megavid iframe -> player payload
// -> {iframe}/source JSON with the m3u8.
export const resolveEpisodeStream = async ({ linkId, referer }) => {
  const serverData = await ajaxGet(
    `/ajax/server?get=${encodeURIComponent(linkId)}`,
    referer,
  );
  const iframeUrl = serverData?.result?.url || null;
  if (!iframeUrl) {
    throw new Error('Server link expired or unavailable — retry to get a fresh one');
  }

  const { data: iframeHtml } = await axios.get(iframeUrl, {
    proxy: false,
    timeout: 25000,
    headers: {
      'User-Agent': DEFAULT_UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      Referer: `${ANIMEKAI_BASE_URL}/`,
    },
  });

  const $ = load(iframeHtml);
  const payloadRaw = $('#player-payload').html();
  if (!payloadRaw) {
    throw new Error('Player payload not found on the embed page');
  }

  let payload;
  try {
    payload = JSON.parse(payloadRaw);
  } catch {
    throw new Error('Failed to parse player payload');
  }

  if (!payload?.sourceUrl) {
    throw new Error('No sourceUrl in player payload');
  }

  const sourceEndpoint = new URL(payload.sourceUrl, iframeUrl).toString();
  const { data: sourcePayload } = await axios.get(sourceEndpoint, {
    proxy: false,
    timeout: 25000,
    headers: {
      'User-Agent': DEFAULT_UA,
      Accept: 'application/json',
      Referer: `${MEGAVID_BASE_URL}/`,
      'X-Requested-With': 'XMLHttpRequest',
    },
  });

  return { iframeUrl, sourcePayload };
};
