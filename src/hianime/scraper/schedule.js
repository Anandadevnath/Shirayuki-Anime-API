import { load } from '../../utils/scrapper-deps.js';
import {
  HIANIME_BASE_URL,
  pageGet,
  toAbsoluteUrl,
} from './_shared.js';
import { parseFlwItem } from './cards.js';

// ─────────────────────────────────────────────────────────────────────────────
// Release schedule.
//
// hianime.at ships NO /schedule page (every classic route 404s) and its detail
// pages no longer expose a `Broadcast` row on this theme, so a weekday/time
// TV-calendar cannot be scraped without fabricating data. What IS real:
//
//   • /top-airing  → the currently-airing pool
//   • /home "Top Upcoming" → the announced-not-yet-aired pool
//   • each title's detail page → `Aired` (premiere window) + `Status`
//
// A not-yet-aired title's premiere date unambiguously determines its airing
// weekday, so that's the factual backbone of the calendar here. Airing titles
// (whose Aired window already started) are listed separately — they simply have
// no upstream broadcast slot to hang a weekday on.
// ─────────────────────────────────────────────────────────────────────────────

const DAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

const lower = (v) => String(v || '').toLowerCase();

// "Dec 1, 2026 to ?" → { premiereDate: Date|null, notYetAired: bool }
// "Not yet aired" → { premiereDate: null, notYetAired: true }
export const parseAiredRange = (raw) => {
  const text = String(raw || '').trim();
  if (!text) return { premiereDate: null, notYetAired: false };
  if (/not yet aired/i.test(text)) return { premiereDate: null, notYetAired: true };
  const m = text.match(/([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{4})/);
  if (!m) return { premiereDate: null, notYetAired: false };
  const d = new Date(`${m[1]} ${m[2]}, ${m[3]} 00:00:00`);
  if (Number.isNaN(d.getTime())) return { premiereDate: null, notYetAired: false };
  return { premiereDate: d, notYetAired: d.getTime() > Date.now() };
};

// Monday-indexed weekday name for a date; null if unparseable.
export const toWeekday = (date) => {
  const d = date instanceof Date ? date : new Date(`${String(date)} 00:00:00`);
  if (!d || Number.isNaN(d.getTime())) return null;
  return DAY_NAMES[(d.getDay() + 6) % 7];
};

export const isoDate = (d) => (d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null);

// Normalise a raw `.anisc-info .item` row set into exactly the keys the
// schedule needs (Aired / Status).
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
      rows[head] = item.find('.text').first().text().trim() || item.find('.name').first().text().trim() || null;
    }
  });
  return rows;
};

// Last path segment of an upstream URL is the canonical slug-id
// ("https://hianime.at/one-piece-1" -> "one-piece-1"; poster links on some
// listings are /watch/<slug-id>, which resolves to the same slug-id) — the id
// the frontend uses for `/anime/:id` links.
const slugIdFromUrl = (url) => {
  if (!url) return null;
  try {
    const seg = new URL(url).pathname.split('/').filter(Boolean).pop();
    return seg || null;
  } catch {
    return null;
  }
};

// Bounded-concurrency map with a hard wall-clock deadline; a failed/expired
// slot resolves to null so a single flaky detail page can never sink the pass.
const mapWithDeadline = async (items, limit, fn, deadlineMs) => {
  const results = new Array(items.length);
  let idx = 0;
  const start = Date.now();
  const worker = async () => {
    while (idx < items.length) {
      if (Date.now() - start > deadlineMs) break;
      const i = idx++;
      try {
        results[i] = await fn(items[i]);
      } catch {
        results[i] = null;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
};
export const getHianimeSchedule = async ({
  airingLimit = 20,
  upcomingLimit = 15,
  concurrency = 4,
  deadlineMs = 22_000,
} = {}) => {
  const [airingHtml, homeHtml] = await Promise.all([
    pageGet(`${HIANIME_BASE_URL}/top-airing`),
    pageGet(`${HIANIME_BASE_URL}/home`),
  ]);

  // Currently-airing pool → /top-airing.
  const $a = load(airingHtml);
  const airingItems = $a('.flw-item')
    .map(parseFlwItem($a))
    .get()
    .filter((r) => r.id || r.title)
    .slice(0, airingLimit);

  // Announced-but-not-yet-aired pool → /home "Top Upcoming" section.
  const $h = load(homeHtml);
  let upcomingItems = [];
  $h('#main-content .block_area').each((_, el) => {
    const area = $h(el);
    const heading = area.find('.cat-heading').first().text().trim();
    if (heading === 'Top Upcoming') {
      upcomingItems = area
        .find('.flw-item')
        .map(parseFlwItem($h))
        .get()
        .filter((r) => r.id || r.title)
        .slice(0, upcomingLimit);
    }
  });

  // Dedupe (airing wins) and cap, then enrich with detail-page rows.
  const seen = new Set();
  const candidates = [...airingItems, ...upcomingItems]
    .map((item) => {
      const id = slugIdFromUrl(item.url) || item.id;
      return {
        id,
        title: item.title || item.jname,
        jname: item.jname || null,
        poster: item.poster || null,
        type: item.type || null,
        url: id ? `${HIANIME_BASE_URL}/${id}` : toAbsoluteUrl(item.url),
      };
    })
    .filter((c) => {
      if (!c.id || seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
  const capped = candidates.slice(0, airingLimit + upcomingLimit);

  const airingIds = new Set(
    airingItems
      .map((i) => slugIdFromUrl(i.url) || i.id)
      .filter((id, i, arr) => id && arr.indexOf(id) === i),
  );

  const details = await mapWithDeadline(
    capped,
    concurrency,
    async (candidate) => {
      const detailHtml = await pageGet(`${HIANIME_BASE_URL}/${candidate.id}`);
      const d$ = load(detailHtml);
      return { ...candidate, rows: parseInfoRows(d$) };
    },
    deadlineMs,
  );

  const entries = [];
  for (let i = 0; i < capped.length; i++) {
    const detail = details[i];
    const candidate = capped[i];
    if (!detail || !detail.rows) continue;

    const status = detail.rows['Status'] || null;
    const airedRaw = detail.rows['Aired'] || null;
    const { premiereDate, notYetAired } = parseAiredRange(airedRaw);
    const isUpcoming = lower(status).includes('not yet aired') || notYetAired;
    const fromAiring = airingIds.has(candidate.id);

    entries.push({
      id: candidate.id,
      title: candidate.title || detail.rows['English'] || detail.rows['Synonyms']?.[0] || 'Untitled',
      jname: candidate.jname || null,
      poster: candidate.poster,
      type: candidate.type || null,
      url: candidate.url,
      status,
      aired: airedRaw,
      premiereDate: isoDate(premiereDate),
      weekday: toWeekday(premiereDate),
      isUpcoming,
      fromAiring,
    });
  }

  const airing = entries
    .filter((e) => e.fromAiring && !e.isUpcoming)
    .sort((a, b) => a.title.localeCompare(b.title));
  const upcoming = entries
    .filter((e) => e.isUpcoming)
    .sort(
      (a, b) =>
        (a.premiereDate || '9999').localeCompare(b.premiereDate || '9999') ||
        a.title.localeCompare(b.title),
    );

  // Factual weekdays only for premiere-dated titles.
  const week = [];
  for (const day of DAY_NAMES) {
    const items = upcoming.filter((e) => e.weekday === day);
    if (items.length) week.push({ day, items });
  }

  return {
    source: `${HIANIME_BASE_URL}/home`,
    updatedAt: new Date().toISOString(),
    counted: {
      airing: airing.length,
      upcoming: upcoming.length,
      premieres: upcoming.filter((e) => e.premiereDate).length,
      tbd: upcoming.filter((e) => !e.premiereDate).length,
    },
    week,
    airing,
    upcoming,
  };
};
