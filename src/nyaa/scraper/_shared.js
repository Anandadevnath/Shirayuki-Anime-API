import { load, axios } from '../../utils/scrapper-deps.js';

export const NYAA_BASE_URL = 'https://nyaa.si';
export const DEFAULT_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export const CATEGORIES = {
  '0_0': 'All categories',
  '1_0': 'Anime',
  '1_1': 'Anime - AMV',
  '1_2': 'Anime - English-translated',
  '1_3': 'Anime - Non-English-translated',
  '1_4': 'Anime - Raw',
  '2_0': 'Audio',
  '2_1': 'Audio - Lossless',
  '2_2': 'Audio - Lossy',
  '3_0': 'Literature',
  '3_1': 'Literature - English-translated',
  '3_2': 'Literature - Non-English-translated',
  '3_3': 'Literature - Raw',
  '4_0': 'Live Action',
  '4_1': 'Live Action - English-translated',
  '4_2': 'Live Action - Idol/PV',
  '4_3': 'Live Action - Non-English-translated',
  '4_4': 'Live Action - Raw',
  '5_0': 'Pictures',
  '5_1': 'Pictures - Graphics',
  '5_2': 'Pictures - Photos',
  '6_0': 'Software',
  '6_1': 'Software - Apps',
  '6_2': 'Software - Games',
};

export const FILTERS = {
  '0': 'No filter',
  '1': 'No remakes',
  '2': 'Trusted only',
};

export const SORT_OPTIONS = {
  id: 'Date',
  size: 'Size',
  seeders: 'Seeders',
  leechers: 'Leechers',
  downloads: 'Completed downloads',
  comments: 'Comments',
};

export const toAbsoluteUrl = (href) => {
  if (!href) return null;
  if (/^https?:\/\//i.test(href)) return href;
  return `${NYAA_BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`;
};

export const parseNumber = (value) => {
  if (value === null || value === undefined) return null;
  const match = String(value).match(/\d+/);
  return match ? Number(match[0]) : null;
};

export const getTorrentId = (href) => {
  if (!href) return null;
  const match = String(href).match(/\/view\/(\d+)/i);
  return match ? match[1] : null;
};

export const pageHeaders = (referer) => ({
  'User-Agent': DEFAULT_UA,
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  Referer: referer || NYAA_BASE_URL,
  'Accept-Language': 'en-US,en;q=0.9',
});

export const fetchPage = async (path, { searchParams, referer } = {}) => {
  const query = new URLSearchParams();
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) {
      if (v === undefined || v === null || v === '') continue;
      if (Array.isArray(v)) {
        for (const item of v) {
          if (item === undefined || item === null || item === '') continue;
          query.append(k, String(item));
        }
      } else {
        query.append(k, String(v));
      }
    }
  }
  const qs = query.toString();
  const url = `${NYAA_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}${qs ? `?${qs}` : ''}`;

  const resp = await axios.get(url, {
    proxy: false,
    timeout: 25000,
    headers: pageHeaders(referer),
  });

  return {
    url,
    html: String(resp?.data ?? ''),
    $: load(String(resp?.data ?? '')),
  };
};

const safeDecode = (value) => {
  if (!value) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export const parseMagnet = (magnet) => {
  if (!magnet) return null;
  const raw = String(magnet).trim();
  const xtMatch = raw.match(/xt=urn:btih:([a-fA-F0-9]+)/i);
  const dnMatch = raw.match(/[?&]dn=([^&]+)/i);
  const trMatches = [...raw.matchAll(/[?&]tr=([^&]+)/gi)];

  return {
    magnet: raw,
    infoHash: xtMatch ? xtMatch[1].toLowerCase() : null,
    name: dnMatch ? safeDecode(dnMatch[1]) : null,
    trackers: trMatches.map((m) => safeDecode(m[1])).filter(Boolean),
  };
};

export const parseSizeToBytes = (sizeText) => {
  if (!sizeText) return null;
  const cleaned = String(sizeText).replace(/[()]/g, '').trim();
  const match = cleaned.match(/([\d.]+)\s*(KiB|MiB|GiB|TiB|KB|MB|GB|TB|B)?/i);
  if (!match) return null;
  const value = parseFloat(match[1]);
  if (Number.isNaN(value)) return null;
  const unit = (match[2] || 'B').toUpperCase();
  const multipliers = {
    B: 1,
    KB: 1000,
    KIB: 1024,
    MB: 1000 ** 2,
    MIB: 1024 ** 2,
    GB: 1000 ** 3,
    GIB: 1024 ** 3,
    TB: 1000 ** 4,
    TIB: 1024 ** 4,
  };
  return Math.round(value * (multipliers[unit] || 1));
};

export const extractTorrentRow = ($, el) => {
  const $row = $(el);
  const $cells = $row.find('td');
  if ($cells.length < 8) return null;

  // Nyaa's HTML uses 8 cells per row with `colspan=2` on the name cell,
  // so the visible columns map to: 0=category, 1=name(+comments), 2=link,
  // 3=size, 4=date, 5=seeders, 6=leechers, 7=completed.
  const $categoryCell = $cells.eq(0);
  const $categoryLink = $categoryCell.find('a').first();
  const categoryHref = $categoryLink.attr('href')?.trim() || '';
  const categoryMatch = categoryHref.match(/[?&]c=([0-9_]+)/);
  const category = categoryMatch ? categoryMatch[1] : null;

  const $nameCell = $cells.eq(1);
  const $titleAnchor = $nameCell.find('a').not('.comments').first();
  const href = $titleAnchor.attr('href')?.trim() || null;
  if (!href) return null;
  const torrentId = getTorrentId(href);
  if (!torrentId) return null;

  const title = $titleAnchor.attr('title') || $titleAnchor.text().trim() || null;

  const $linkCell = $cells.eq(2);
  // The magnet link is scraped but not exposed in the row payload.
  void $linkCell;

  const sizeText = $cells.eq(3).text().trim() || null;
  const $dateCell = $cells.eq(4);
  const timestampAttr = $dateCell.attr('data-timestamp');
  const timestamp = timestampAttr ? Number(timestampAttr) : null;
  const dateText = $dateCell.text().trim() || null;

  const seeders = parseNumber($cells.eq(5).text());
  const leechers = parseNumber($cells.eq(6).text());
  const completed = parseNumber($cells.eq(7).text());

  const rowClass = ($row.attr('class') || '').trim();
  const isTrusted = rowClass === 'success';

  // Lean, hianime-style row: flat keys, only the data the UI actually
  // consumes. The magnet link is intentionally not exposed — use the
  // torrent details endpoint if you need the .torrent or info hash.
  return {
    id: torrentId,
    title,
    url: toAbsoluteUrl(href),
    category,
    categoryLabel: CATEGORIES[category] || null,
    isTrusted,
    size: sizeText,
    sizeBytes: parseSizeToBytes(sizeText),
    date: dateText,
    timestamp,
    seeders: seeders || 0,
    leechers: leechers || 0,
    completed: completed || 0,
  };
};

export const extractTorrentRows = ($, scope) => {
  const $scope = scope ? $(scope) : $.root();
  return $scope
    .find('table.torrent-list tbody tr')
    .map((_, el) => extractTorrentRow($, el))
    .get()
    .filter((row) => row && row.id);
};

export const extractPagination = ($) => {
  const $pageInfo = $('.pagination-page-info').first();
  const totalMatch = $pageInfo.text().match(/out of\s+([\d,]+)\s+results/i);
  const totalResults = totalMatch ? Number(totalMatch[1].replace(/,/g, '')) : null;

  const $active = $('.pagination li.active a').first();
  const currentPage = parseNumber($active.text()) || 1;

  const $lastLink = $('.pagination li').not('.disabled').not('.next').not('.previous').last().find('a');
  const lastHref = $lastLink.attr('href') || '';
  const lastMatch = lastHref.match(/[?&]p=(\d+)/);
  const totalFromLast = lastMatch ? Number(lastMatch[1]) : null;

  const pageLinks = $('.pagination li a')
    .map((_, el) => {
      const $a = $(el);
      const href = $a.attr('href');
      const pageMatch = href ? href.match(/[?&]p=(\d+)/) : null;
      return pageMatch ? Number(pageMatch[1]) : null;
    })
    .get()
    .filter((n) => Number.isFinite(n));

  const totalPages = Math.max(totalFromLast || 0, ...pageLinks, currentPage);
  const hasNextPage = $('.pagination li.next').not('.disabled').length > 0;

  return {
    currentPage,
    totalPages,
    totalResults,
    hasNextPage,
  };
};

export const VIDEO_EXTENSIONS = /\.(mkv|mp4|avi|webm|ts|m2ts|flv|mov)$/i;

// Episode numbers are extracted from filenames. We try multiple patterns in
// priority order because release titles can be ambiguous — e.g. the bare
// number "5" inside "S01E1150.5" must NOT be picked over the SxxExx pattern.
//   1. SxxExx     — "S01E1150"  → 1150 (most reliable)
//   2. EP/E prefix — "EP0001"   → 1
//   3. Bracketed  — "[12]"      → 12
//   4. " - N "    — "- 05"      → 5  (hianime/nyaa " - 05 (1080p)" shape)
//   5. Bare int   — last resort (e.g. "001.mkv" with no other markers)
const EPISODE_REGEX_SXXEXX = /\bS\d{1,2}E(\d{1,4})\b/i;
const EPISODE_REGEX_EPPREFIX = /(?:^|[\s\[\(\-_.])#?E(?:P|p)?(\d{1,4})\b/i;
const EPISODE_REGEX_BRACKET = /[\[\(](\d{1,4})[\[\]]/;
const EPISODE_REGEX_DASHNUM = /\s-\s(\d{1,4})\b/;
const EPISODE_REGEX_BARE = /(\d{1,4})/;

export const extractEpisodeFromName = (name) => {
  if (!name) return null;
  const text = String(name);

  // 1. SxxExx — these are unambiguous release-group episode tags and win over
  //    any later "5" or ".5" sub-episode decorations.
  const sxxexx = text.match(EPISODE_REGEX_SXXEXX);
  if (sxxexx) return Number(sxxexx[1]);

  // 2. EP/E prefix.
  const epPrefix = text.match(EPISODE_REGEX_EPPREFIX);
  if (epPrefix) return Number(epPrefix[1]);

  // 3. Bare bracketed number like [12].
  const bracket = text.match(EPISODE_REGEX_BRACKET);
  if (bracket) return Number(bracket[1]);

  // 4. " - N " marker.
  const dash = text.match(EPISODE_REGEX_DASHNUM);
  if (dash) return Number(dash[1]);

  // 5. Bare integer (e.g. "001.mkv"). Use the first match.
  const bare = text.match(EPISODE_REGEX_BARE);
  return bare ? Number(bare[1]) : null;
};

export const walkFileTree = ($, $ul, parent = '') => {
  const files = [];
  $ul.children('li').each((_, li) => {
    const $li = $(li);
    const $folder = $li.children('a.folder').first();
    const $fileIcon = $li.children('i.fa-file').first();
    const $nested = $li.children('ul').first();
    if ($folder.length) {
      const folderName = $folder.text().trim();
      const path = parent ? `${parent}/${folderName}` : folderName;
      if ($nested.length) {
        files.push(...walkFileTree($, $nested, path));
      } else {
        files.push({ path, name: folderName, size: null, sizeBytes: null, type: 'folder' });
      }
    } else if ($fileIcon.length) {
      const clone = $li.clone();
      clone.children('span.file-size').remove();
      const fileName = clone.text().trim();
      const $sizeEl = $li.children('span.file-size').first();
      const sizeTextRaw = $sizeEl.text().trim() || null;
      const sizeText = sizeTextRaw ? sizeTextRaw.replace(/[()]/g, '').trim() : null;
      files.push({
        path: parent ? `${parent}/${fileName}` : fileName,
        name: fileName,
        size: sizeText,
        sizeBytes: parseSizeToBytes(sizeText),
        type: 'file',
      });
    }
  });
  return files;
};

// Nyaa view pages render `<div class="row"><div class="col-md-1">Label</div>
// <div class="col-md-5">Value</div></div>` per field. Pair them into a
// `{label: $value}` map keyed by lowercased label (sans trailing colon).
export const extractLabelValueMap = ($) => {
  const map = {};
  $('.panel-body').first().find('.row').each((_, row) => {
    const children = $(row).children();
    for (let i = 0; i < children.length; i++) {
      const $child = $(children.eq(i));
      if (!$child.hasClass('col-md-1') && !$child.hasClass('col-md-offset-6')) continue;
      const labelText = $child.text().trim().replace(/:$/, '').trim();
      if (!labelText) continue;
      const $value = children.eq(i + 1);
      if (!$value.length) continue;
      map[labelText.toLowerCase()] = $value;
    }
  });
  return map;
};

// Short-TTL cache of parsed view pages keyed by torrent id. The anime,
// episode-sources, and episode-servers endpoints all hit /view/{id}; this
// lets subsequent calls reuse the first's parsed DOM instead of re-fetching.
const VIEW_PAGE_TTL_MS = 60 * 1000;
const viewPageCache = new Map();

export const fetchViewPage = async (torrentId, referer) => {
  const id = String(torrentId || '').trim().replace(/^\/+|\/+$/g, '');
  if (!/^\d+$/.test(id)) {
    throw new Error('torrentId must be a numeric Nyaa torrent id');
  }
  const cached = viewPageCache.get(id);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.payload;
  }
  const payload = await fetchPage(`/view/${id}`, { referer });
  viewPageCache.set(id, { payload, expiresAt: Date.now() + VIEW_PAGE_TTL_MS });
  return payload;
};