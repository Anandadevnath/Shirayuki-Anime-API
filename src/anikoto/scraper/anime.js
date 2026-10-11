import { load } from '../../utils/scrapper-deps.js';
import {
  ANIKOTO_BASE_URL,
  pageGet,
  ajaxGet,
  buildWatchUrl,
} from '../_shared.js';

// Numeric anime id: #watch-main[data-id] on the watch page.
const readNumericId = ($) => $('#watch-main').attr('data-id') || null;

// Parse the details of an anime from its /watch/{slug} page.
export const parseAnimeDetails = ($, url, slug) => {
  const id = readNumericId($);
  const titleEl = $('#w-info h1.title.d-title').first();
  const poster = $('#w-info .poster img').first().attr('src') || null;
  const description = $('#w-info .synopsis .content').first().text().trim() || null;
  const namesText = $('#w-info .names').first().text().trim();
  const aliases = namesText.split(';').map((s) => s.trim()).filter(Boolean);

  const rating = $('#w-info .meta.icons i.rating').first().text().trim() || null;
  const quality = $('#w-info .meta.icons i.quality').first().text().trim() || null;

  const detailRows = {};
  $('.bmeta .meta > div').each((_, el) => {
    const row = $(el);
    const label = row.clone().children().remove().end().text().trim().replace(/:\s*$/, '');
    if (!label) return;
    const links = row.find('a').map((__, a) => $(a).text().trim()).get().filter(Boolean);
    if (links.length) detailRows[label] = links;
    else {
      const value = row.find('span').first().text().trim();
      detailRows[label] = value || null;
    }
  });

  return { id, titleEl, poster, description, aliases, rating, quality, detailRows };
};

// GET /ajax/episode/list/{numericId} -> { result: html }
export const fetchEpisodeListHtml = async (numericId, referer) => {
  const data = await ajaxGet(
    `/ajax/episode/list/${encodeURIComponent(numericId)}`,
    referer || `${ANIKOTO_BASE_URL}/`,
  );
  return data?.result || '';
};

// Parse the episode anchors out of the ajax episode-list HTML. Episodes can be
// rendered under several .ep-range uls, so de-dupe by numeric episodeId.
export const parseEpisodes = ($, slug) =>
  $('a[data-id][data-num]')
    .map((_, el) => {
      const a = $(el);
      const num = Number(a.attr('data-num')) || 1;
      const idsToken = a.attr('data-ids') || null;
      const liTitle = a.closest('li').attr('title') || null;
      return {
        episode: num,
        episodeId: a.attr('data-id') || null,
        title: liTitle,
        isFiller: a.attr('data-filler') === '1',
        hasSub: a.attr('data-sub') === '1',
        hasDub: a.attr('data-dub') === '1',
        url: buildWatchUrl(slug, num),
        token: idsToken,
      };
    })
    .get()
    .filter((ep, index, list) => list.findIndex((e) => e.episodeId === ep.episodeId) === index);


export const getAnikotoAnimeDetails = async ({ animeId } = {}) => {
  const clean = String(animeId || '').trim();
  if (!clean) {
    const err = new Error('animeId path parameter is required (e.g. naruto-eybxz)');
    err.status = 400;
    throw err;
  }

  const slug = clean.replace(/^\/+|^watch\//, '');
  const url = `${ANIKOTO_BASE_URL}/watch/${slug}`;
  const html = await pageGet(url, `${ANIKOTO_BASE_URL}/`);
  const $ = load(html);

  const parsed = parseAnimeDetails($, url, slug);
  const { detailRows } = parsed;

  const toArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);
  const firstOrNull = (v) => (Array.isArray(v) ? v[0] ?? null : v ?? null);
  const airedText = detailRows.Aired || null;
  const malRaw = String(firstOrNull(detailRows.MAL) || '').replace(/[^\d.]/g, '');
  const malScore = malRaw ? Number(malRaw) : null;
  const totalFromMeta = Number(String(firstOrNull(detailRows.Episodes) || '').replace(/\D/g, '')) || null;

  const details = {
    source: url,
    id: parsed.id,
    slug,
    title: parsed.titleEl.text().trim() || null,
    jname: parsed.titleEl.attr('data-jp') || null,
    aliases: parsed.aliases,
    alias: parsed.aliases.join('; ') || null,
    poster: parsed.poster,
    description: parsed.description,
    type: firstOrNull(detailRows.Type),
    rating: parsed.rating,
    quality: parsed.quality,
    genres: toArray(detailRows.Genres),
    studios: toArray(detailRows.Studios),
    producers: toArray(detailRows.Producers),
    premiered: firstOrNull(detailRows.Premiered),
    airedFrom: airedText ? String(airedText).split(' to ')[0]?.trim() || null : null,
    airedTo: airedText && airedText.includes(' to ') ? String(airedText).split(' to ')[1]?.trim() || null : null,
    status: firstOrNull(detailRows.Status),
    duration: firstOrNull(detailRows.Duration),
    malScore,
    totalEpisodes: totalFromMeta,
  };

  let episodesList = [];
  let ranges = [];
  if (parsed.id) {
    const listHtml = await fetchEpisodeListHtml(parsed.id, url);
    const $ep = load(listHtml);
    episodesList = parseEpisodes($ep, slug);
    ranges = $ep('.ep-range').map((__, el) => $(el).attr('data-range')).get().filter(Boolean);
  }

  return {
    ...details,
    episodes: { total: episodesList.length || details.totalEpisodes },
    ranges,
    episodesList,
  };
};

export const getAnikotoEpisodes = async ({ animeId } = {}) => {
  const clean = String(animeId || '').trim();
  if (!clean) {
    const err = new Error('animeId path parameter is required (e.g. naruto-eybxz)');
    err.status = 400;
    throw err;
  }

  const slug = clean.replace(/^\/+|^watch\//, '');
  const url = `${ANIKOTO_BASE_URL}/watch/${slug}`;
  const html = await pageGet(url, `${ANIKOTO_BASE_URL}/`);
  const $ = load(html);
  const numericId = readNumericId($);

  let episodes = [];
  let ranges = [];
  if (numericId) {
    const listHtml = await fetchEpisodeListHtml(numericId, url);
    const $ep = load(listHtml);
    episodes = parseEpisodes($ep, slug);
    ranges = $ep('.ep-range').map((__, el) => $(el).attr('data-range')).get().filter(Boolean);
  }

  return {
    source: url,
    id: numericId,
    slug,
    title: $('#w-info h1.title.d-title').first().text().trim() || null,
    totalEpisodes: episodes.length,
    ranges,
    episodes,
  };
};
