import { load } from '../../utils/scrapper-deps.js';
import {
  HIANIME_BASE_URL,
  pageGet,
  themeGet,
  toAbsoluteUrl,
} from './_shared.js';
import { parseFlwItem } from './cards.js';

// ─────────────────────────────────────────────────────────────────────────────
// Release schedule.
//
// hianime.at ships NO /schedule page (every classic route 404s) — BUT its home
// page renders a real "Estimated Schedule" widget, fed by the theme API:
//
//   GET /api/theme/schedule/widget           → the next weeks of day-item dates
//   GET /api/theme/schedule/day?date=YYY-MM  → one day's episode list (the next
//     7 days are fully populated; farther dates return a single stub slot)
//
// That /schedule/day payload IS the weekday calendar the home page shows, so we
// use it as the factual backbone of `week` and enrich rows with poster/type
// from the card pool (the day endpoint only returns title + air time + episode
// number — no poster/type). The old premiere-derived week stays as fallback.
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

// UTC-safe weekday name for a bare "YYYY-MM-DD" (avoids server-local timezone
// drift flipping a day). Returns a DAY_NAMES value or null.
export const weekdayFromIso = (iso) => {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  return DAY_NAMES[(new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7];
};

// Parse a `schedule/day` response (`<ul class="tsl-schedule"> <li>` grid) into
// slot objects: id (slug-id from the watch link) + title + jname + air time +
// episode label. The theme endpoint returns these but no poster/type.
const parseScheduleSlots = ($) =>
  $('ul.tsl-schedule > li')
    .map((_, el) => {
      const $li = $(el);
      const $a = $li.find('a.tsl-link').first();
      const $name = $li.find('h3.film-name').first();
      return {
        id: slugIdFromUrl($a.attr('href')) || null,
        title: $name.text().trim() || null,
        jname: $name.attr('data-jname') || null,
        airTime: $li.find('.time').first().text().trim() || null,
        episodeNumber: $li.find('.fd-play .btn-play').first().text().trim() || null,
      };
    })
    .get()
    .filter((r) => r.title || r.id);

// The widget's day-item list marks every date the schedule is published for;
// only the NEXT 7 from today are fully populated upstream (farther dates return
// a single stub slot), so pick exactly those to build a complete week.
const pickScheduleDates = (widgetHtml) => {
  const $w = load(widgetHtml || '');
  const today = new Date().toISOString().slice(0, 10);
  const dates = $w('.day-item')
    .map((_, el) => $w(el).attr('data-date'))
    .get()
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .filter((d) => d >= today)
    .slice(0, 7);
  if (dates.length === 7) return dates;
  // Fallback: next 7 calendar days.
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() + i * 86_400_000);
    return d.toISOString().slice(0, 10);
  });
};

// Build the real weekday calendar from the theme schedule endpoint, enriching
// each slot with poster/type from the card pool (matched by id).
export const buildRealWeek = async ({ targets, metaById, upcomingIds }) => {
  const dayResults = await Promise.all(
    targets.map(async (date) => {
      const res = await themeGet(`/schedule/day?tzOffset=0&date=${date}`, `${HIANIME_BASE_URL}/home`);
      const $ = load(res?.html || '');
      return { date, slots: parseScheduleSlots($) };
    }),
  );

  const week = [];
  for (const day of DAY_NAMES) {
    const seen = new Set();
    const items = [];
    for (const { date, slots } of dayResults) {
      if (weekdayFromIso(date) !== day) continue;
      for (const slot of slots) {
        if (!slot.id || seen.has(slot.id)) continue;
        seen.add(slot.id);
        const meta = metaById.get(slot.id);
        items.push({
          id: slot.id,
          title: slot.title || meta?.title || 'Untitled',
          jname: slot.jname || meta?.jname || null,
          poster: meta?.poster || null,
          type: meta?.type || null,
          airTime: slot.airTime || null,
          episodeNumber: slot.episodeNumber || null,
          status: null,
          aired: null,
          premiereDate: date,
          weekday: day,
          isUpcoming: upcomingIds.has(slot.id),
        });
      }
    }
    items.sort(
      (a, b) =>
        (a.airTime || '99:99').localeCompare(b.airTime || '99:99') ||
        a.title.localeCompare(b.title),
    );
    if (items.length) week.push({ day, items });
  }
  return week;
};

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

  // Real weekday calendar from the theme "Estimated Schedule" widget, with
  // poster/type enriched from the card pool. Falls back to premiere-derived
  // weekdays if the theme endpoint is unreachable.
  const metaById = new Map(capped.map((c) => [c.id, c]));
  const upcomingIds = new Set(upcoming.map((u) => u.id));
  let week;
  try {
    const widget = await themeGet('/schedule/widget?tzOffset=0', `${HIANIME_BASE_URL}/home`);
    week = await buildRealWeek({
      targets: pickScheduleDates(widget?.html),
      metaById,
      upcomingIds: upcomingIds,
    });
  } catch {
    week = null;
  }
  if (!week) {
    week = [];
    for (const day of DAY_NAMES) {
      const items = upcoming.filter((e) => e.weekday === day);
      if (items.length) week.push({ day, items });
    }
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
