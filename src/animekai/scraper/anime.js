import { load } from '../../utils/scrapper-deps.js';
import { ANIMEKAI_BASE_URL, pageGet, parseAnimeSlug } from './_shared.js';

// Parse the anime details page (/anime/{slug}-{animeId}).
// Structure:
//   section#w-info > .poster img, h1.title.d-title, .al-title, .info spans, .desc
//   .detail > div blocks "Type: <span><a>TV</a></span>", "Genres: ...", etc.
//   #w-episodes a[data-id][data-num][data-sub][data-dub][data-ids]
//   #w-related .rel-item
export const getAnimeKaiAnimeDetails = async ({ animeId } = {}) => {
  const raw = String(animeId || '').trim();
  if (!raw) {
    const err = new Error('animeId path parameter is required (e.g. one-piece-ewc5jc)');
    err.status = 400;
    throw err;
  }

  const clean = raw.replace(/^\/+|\/+$/g, '');
  const url = `${ANIMEKAI_BASE_URL}/anime/${clean}`;
  const html = await pageGet(url, `${ANIMEKAI_BASE_URL}/home`);
  const $ = load(html);

  const parsed = parseAnimeSlug(clean);
  const slug = parsed?.slug || null;
  const id = parsed?.animeId || $('meta[name="anikoto-anime-id"]').attr('content') || null;

  // ---- Titles / poster / description ----
  const titleEl = $('h1.title, .d-title').first();
  const poster = $('#w-info .poster img').first().attr('src') || null;
  const description = $('#w-info .desc .content').first().text().trim() || $('.desc').first().text().trim() || null;

  // .info spans: .rating, .quality, .sub count, .dub count, plain <b> = type
  const infoSpans = $('#w-info .info span');
  const rating = $('#w-info .info .rating').first().text().trim() || null;
  const quality = $('#w-info .info .quality').first().text().trim() || null;
  const subCount = Number($('#w-info .info span.sub').text().replace(/\D/g, '')) || null;
  const dubCount = Number($('#w-info .info span.dub').text().replace(/\D/g, '')) || null;
  const type = $('#w-info .info b').last().text().trim() || null;

  // ---- .detail blocks ----
  const detailRows = {};
  $('.detail > div > div').each((_, el) => {
    const row = $(el);
    const label = row.clone().children().remove().end().text().trim();
    if (!label) return;
    const key = label.replace(/:\s*$/, '');
    const links = row
      .find('a')
      .map((__, a) => $(a).text().trim())
      .get()
      .filter(Boolean);
    if (links.length) {
      detailRows[key] = links;
    } else {
      const value = row.find('span').first().text().trim();
      detailRows[key] = value || null;
    }
  });

  const toArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);
  const firstOrNull = (v) => (Array.isArray(v) ? v[0] ?? null : v ?? null);

  const malScore = Number(String(detailRows.MAL || '').replace(/[^\d.]/g, '')) || null;
  const airedText = detailRows['Date aired'] || null;

  // ---- Episodes ----
  const episodes = $('#w-episodes a[data-id][data-num]')
    .map((_, el) => {
      const a = $(el);
      const num = Number(a.attr('data-num'));
      const ids = a.attr('data-ids') || null; // base64 "{epId}.{hash}"
      let epToken = null;
      try {
        epToken = ids ? Buffer.from(ids, 'base64').toString('utf-8') : null;
      } catch {
        epToken = null;
      }
      const subAvailable = a.attr('data-sub') === '1';
      const dubAvailable = a.attr('data-dub') === '1';

      return {
        episode: num,
        episodeId: a.attr('data-id') || null,
        title: `Episode ${num}`,
        isFiller: a.attr('data-filler') === '1',
        hasSub: subAvailable,
        hasDub: dubAvailable,
        url: `${ANIMEKAI_BASE_URL}/watch/${slug}-${id}/ep-${num}`,
        token: epToken,
      };
    })
    .get();

  // ---- Relations ----
  const relations = $('.rel-item')
    .map((_, el) => {
      const card = $(el);
      const href = card.find('a').first().attr('href') || null;
      const idMatch = href ? href.match(/-([a-z0-9]{6})(?:$|\?)/i) : null;
      const titleEl2 = card.find('.title, .d-title').first();
      const relType = card.attr('data-relation') || card.find('.relation').first().text().trim() || null;

      return {
        id: idMatch ? idMatch[1] : null,
        title: titleEl2.text().trim() || null,
        jname: titleEl2.attr('data-jp') || null,
        poster: card.find('img').first().attr('src') || null,
        relationType: relType && relType !== 'All' ? relType : null,
        url: href,
      };
    })
    .get();

  return {
    source: url,
    id,
    slug,
    title: titleEl.text().trim() || null,
    jname: titleEl.attr('data-jp') || null,
    alias: $('.al-title').first().text().trim() || titleEl.attr('data-jp') || null,
    poster,
    description,
    type,
    rating,
    quality,
    episodes: {
      total: episodes.length,
      sub: subCount,
      dub: dubCount,
    },
    genres: toArray(detailRows.Genres),
    studios: toArray(detailRows.Studios),
    producers: toArray(detailRows.Producers),
    premiered: firstOrNull(detailRows.Premiered),
    airedFrom: airedText ? String(airedText).split(' to ')[0]?.trim() || null : null,
    airedTo: airedText && airedText.includes(' to ') ? String(airedText).split(' to ')[1]?.trim() || null : null,
    status: firstOrNull(detailRows.Status),
    duration: firstOrNull(detailRows.Duration),
    malScore,
    episodesList: episodes,
    relations,
  };
};

// Episode list only (cheaper payload for clients that just need episodes).
export const getAnimeKaiEpisodes = async ({ animeId, page } = {}) => {
  const raw = String(animeId || '').trim();
  if (!raw) {
    const err = new Error('animeId path parameter is required (e.g. one-piece-ewc5jc)');
    err.status = 400;
    throw err;
  }

  const clean = raw.replace(/^\/+|\/+$/g, '');
  const url = `${ANIMEKAI_BASE_URL}/anime/${clean}`;
  const html = await pageGet(url, `${ANIMEKAI_BASE_URL}/home`);
  const $ = load(html);

  const parsed = parseAnimeSlug(clean);
  const slug = parsed?.slug || null;
  const id = parsed?.animeId || $('meta[name="anikoto-anime-id"]').attr('content') || null;

  // Range chips split very long lists (e.g. One Piece 001-100 / 101-200 / ...)
  const ranges = $('.ep-range')
    .map((_, el) => $(el).attr('data-range'))
    .get()
    .filter(Boolean);

  const episodeAnchors = $('#w-episodes a[data-id][data-num]');
  const allAnchors = episodeAnchors.length
    ? episodeAnchors
    : $('a[data-id][data-num]'); // some ranges render outside #w-episodes

  const episodes = allAnchors
    .map((_, el) => {
      const a = $(el);
      const num = Number(a.attr('data-num'));
      const ids = a.attr('data-ids') || null;
      let token = null;
      try {
        token = ids ? Buffer.from(ids, 'base64').toString('utf-8') : null;
      } catch {
        token = null;
      }
      return {
        episode: num,
        episodeId: a.attr('data-id') || null,
        title: `Episode ${num}`,
        isFiller: a.attr('data-filler') === '1',
        hasSub: a.attr('data-sub') === '1',
        hasDub: a.attr('data-dub') === '1',
        url: `${ANIMEKAI_BASE_URL}/watch/${slug}-${id}/ep-${num}`,
        token,
      };
    })
    .get();

  return {
    source: url,
    id,
    slug,
    title: $('h1.title, .d-title').first().text().trim() || null,
    totalEpisodes: episodes.length,
    ranges,
    episodes,
  };
};
