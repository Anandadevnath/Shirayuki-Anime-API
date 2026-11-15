import { load } from '../../utils/scrapper-deps.js';
import { nyaaGet, buildMagnet, NYAA_CATEGORY, httpError, toPositiveInt } from '../_shared.js';
import { parseRelease } from './release-parser.js';
import { INFO_HASH_RE } from './stream-token.js';

// Nyaa filter: 0 = none, 1 = no remakes, 2 = trusted only.
const FILTERS = new Set(['0', '1', '2']);
const SORTS = new Set(['id', 'seeders', 'leechers', 'downloads', 'size']);
const CATEGORY_RE = /^\d_\d$/;
const MAX_QUERY_LENGTH = 200;

const SIZE_UNITS = { B: 1, KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3, TiB: 1024 ** 4 };

const parseSizeBytes = (text) => {
  const m = String(text || '').match(/([\d.]+)\s*(B|KiB|MiB|GiB|TiB)/);
  return m ? Math.round(Number(m[1]) * SIZE_UNITS[m[2]]) : null;
};

const toIsoDate = (text) => {
  const date = new Date(text);
  return text && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
};

const toInt = (text) => {
  const n = Number.parseInt(String(text || '').trim(), 10);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Parse a Nyaa RSS document into torrent records (pure, no network).
 * @param {string} xml
 * @param {string} baseUrl origin used to build view/download links
 */
export const parseNyaaRss = (xml, baseUrl = 'https://nyaa.si') => {
  const $ = load(String(xml || ''), { xmlMode: true });
  return $('item')
    .map((_, el) => {
      const item = $(el);
      const field = (tag) => item.find(`nyaa\\:${tag}`).first().text().trim();
      const infoHash = field('infoHash').toLowerCase();
      if (!INFO_HASH_RE.test(infoHash)) return null;
      const title = item.find('title').first().text().trim();
      const viewUrl = item.find('guid').first().text().trim();
      const id = viewUrl.match(/\/view\/(\d+)/)?.[1] || null;
      const pubDate = item.find('pubDate').first().text().trim();
      return {
        id,
        title,
        infoHash,
        magnet: buildMagnet(infoHash, title),
        torrentUrl: id ? `${baseUrl}/download/${id}.torrent` : item.find('link').first().text().trim(),
        viewUrl: id ? `${baseUrl}/view/${id}` : viewUrl,
        category: field('categoryId'),
        size: field('size'),
        sizeBytes: parseSizeBytes(field('size')),
        seeders: toInt(field('seeders')),
        leechers: toInt(field('leechers')),
        downloads: toInt(field('downloads')),
        trusted: field('trusted') === 'Yes',
        remake: field('remake') === 'Yes',
        pubDate: toIsoDate(pubDate),
        release: parseRelease(title),
      };
    })
    .get()
    .filter(Boolean);
};

/**
 * Search Nyaa via its RSS feed.
 * @param {{ q?: string, c?: string, f?: string, s?: string, o?: string, page?: string|number }} opts
 */
export const searchNyaa = async ({ q = '', c = NYAA_CATEGORY.ENGLISH, f = '0', s = 'seeders', o = 'desc', page } = {}) => {
  const query = String(q || '').trim();
  if (query.length > MAX_QUERY_LENGTH) throw httpError(`q must be at most ${MAX_QUERY_LENGTH} characters`, 400);
  if (!CATEGORY_RE.test(String(c))) throw httpError('c must look like "1_2"', 400);
  if (!FILTERS.has(String(f))) throw httpError('f must be 0, 1 or 2', 400);
  if (!SORTS.has(String(s))) throw httpError(`s must be one of ${[...SORTS].join(', ')}`, 400);

  const params = new URLSearchParams({
    page: 'rss',
    q: query,
    c: String(c),
    f: String(f),
    s: String(s),
    o: o === 'asc' ? 'asc' : 'desc',
  });
  const pageNum = toPositiveInt(page, 1);
  if (pageNum > 1) params.set('p', String(pageNum));

  const { data, baseUrl } = await nyaaGet(`/?${params.toString()}`);
  return { query, page: pageNum, source: baseUrl, torrents: parseNyaaRss(data, baseUrl) };
};
