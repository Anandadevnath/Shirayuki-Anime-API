import { load } from '../../utils/scrapper-deps.js';
import {
  HIANIME_BASE_URL,
  pageGet,
  themeGet,
  toAbsoluteUrl,
  parseNumber,
  parseAnimeSlug,
} from './_shared.js';
import { extractFlwItems } from './cards.js';

const toArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const firstOrNull = (v) => (Array.isArray(v) ? v[0] ?? null : v ?? null);

// Parse a dict of info rows from `.anisc-info .item` blocks.
const parseInfoRows = ($) => {
  const rows = {};
  $('.anisc-info .item').each((_, el) => {
    const item = $(el);
    const head = item.find('.item-head').first().text().trim().replace(/:\s*$/, '');
    if (!head) return;
    if (item.hasClass('item-list')) {
      rows[head] = item
        .find('a')
        .map((__, a) => $(a).text().trim())
        .get()
        .filter(Boolean);
    } else {
      const text = item.find('.text').first().text().trim();
      const name = item.find('.name').first().text().trim();
      rows[head] = text || name || null;
    }
  });
  return rows;
};

// Primary detail info from the `.anisc-detail` header (chooses .anisc-info when present).
const parseDetailHeader = ($) => {
  const titleEl = $('h2.film-name.dynamic-name, .anisc-detail h2').first();
  const poster = $('.anisc-poster .film-poster-img').first();
  const statsEl = $('.anisc-detail .film-stats .tick').first();

  const tickValues = {};
  statsEl.find('.tick-item').each((_, el) => {
    const cls = $(el).attr('class') || '';
    const val = $(el).text().replace(/[^\d]/g, '');
    if (/tick-sub/.test(cls)) tickValues.sub = Number(val) || null;
    else if (/tick-dub/.test(cls)) tickValues.dub = Number(val) || null;
    else if (/tick-eps/.test(cls)) tickValues.eps = Number(val) || null;
  });

  const plainItems = [];
  statsEl.children('.dot').remove();
  statsEl.find('span.item').each((_, el) => {
    const t = $(el).text().trim();
    if (t) plainItems.push(t);
  });

  return {
    title: titleEl.text().trim() || null,
    jname: titleEl.attr('data-jname') || titleEl.attr('data-en') || null,
    poster: toAbsoluteUrl(poster.attr('data-src') || poster.attr('src')),
    type: plainItems[0] || null,
    duration: plainItems[1]?.match(/^\d+m$/) ? plainItems[1] : null,
    quality:
      $('.tick-item.tick-quality').first().text().trim() ||
      $('.anisc-detail .tick-item.tick-quality').text().trim() ||
      null,
    episodes: {
      total: tickValues.eps,
      sub: tickValues.sub,
      dub: tickValues.dub,
    },
    rating: parseNumber($('#rr-score, .dt-rate #rr-score').first().text()),
  };
};

export const getHianimeAnimeDetails = async ({ animeId } = {}) => {
  const raw = String(animeId || '').trim();
  if (!raw) {
    const err = new Error('animeId path parameter is required (e.g. one-piece-8719)');
    err.status = 400;
    throw err;
  }

  const clean = raw.replace(/^\/+|\/+$/g, '');
  const url = `${HIANIME_BASE_URL}/${clean}`;
  const html = await pageGet(url);
  const $ = load(html);

  const parsed = parseAnimeSlug(clean);
  const id = parsed?.id || $('meta[name="hi-anime-id"]').attr('content') || null;
  const info = parseInfoRows($);
  const header = parseDetailHeader($);

  const description =
    $('.anisc-info .item-title .text').first().text().trim() ||
    $('.film-description .text').first().text().trim() ||
    null;

  const relations = extractFlwItems($, '#main-content .block_area-relation .flw-item');

  return {
    source: url,
    id,
    slug: parsed?.slug || null,
    title: header.title,
    jname: header.jname,
    alias: info['Synonyms'] || header.jname || null,
    poster: header.poster,
    description,
    type: header.type,
    rating: header.rating,
    quality: header.quality,
    episodes: header.episodes,
    genres: toArray(info['Genres']),
    studios: toArray(info['Studios']),
    producers: toArray(info['Producers']),
    premiered: firstOrNull(info['Premiered']),
    aired: firstOrNull(info['Aired']),
    status: firstOrNull(info['Status']),
    duration: firstOrNull(info['Duration']) || header.duration,
    malScore: parseNumber(info['MAL Score']),
    relations,
  };
};

// Episode list via the ajax endpoint. Callers pass either the anime slug-id
// (resolves episodeId list fresh) or a raw episodeId to confirm episode number.
export const getHianimeEpisodes = async ({ animeId, episodeId } = {}) => {
  const raw = String(animeId || '').trim();
  if (!raw) {
    const err = new Error('animeId path parameter is required (e.g. one-piece-8719)');
    err.status = 400;
    throw err;
  }

  const parsed = parseAnimeSlug(raw);
  let id = parsed?.id;
  if (!id) {
    // Resolve numeric id from the detail page.
    const url = `${HIANIME_BASE_URL}/${parsed?.slug || raw}`;
    const html = await pageGet(url);
    id = load(html)('meta[name="hi-anime-id"]').attr('content');
  }
  if (!id) {
    const err = new Error(`Could not resolve numeric anime id from "${raw}"`);
    err.status = 400;
    throw err;
  }

  const data = await themeGet(`/episode/list/${id}`, `${HIANIME_BASE_URL}/${raw}`);
  const html = data?.html;
  const $ = load(html || '');

  const episodes = $('.ss-list .ep-item')
    .map((_, el) => {
      const a = $(el);
      const num = parseNumber(a.attr('data-number'));
      return {
        episode: num,
        episodeId: a.attr('data-id') || null,
        title: `Episode ${num}`,
        url: a.attr('href') ? toAbsoluteUrl(a.attr('href')) : null,
      };
    })
    .get();

  return {
    source: `${HIANIME_BASE_URL}/api/theme/episode/list/${id}`,
    id,
    slug: parsed?.slug || null,
    title: $('.film-name').first().text().trim() || null,
    totalEpisodes: episodes.length,
    episodes,
  };
};
