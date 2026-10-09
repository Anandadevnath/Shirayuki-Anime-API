import { load } from '../../utils/scrapper-deps.js';
import { ANIMEKAI_BASE_URL, ajaxGet } from './_shared.js';

const formatDate = (raw) => {
  const m = String(raw || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};

const todayUTC = () => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`;
};

// ajax/schedule?date=YYYY-MM-DD returns the 7-day selector + that day's list.
export const getAnimeKaiSchedule = async ({ date } = {}) => {
  const targetDate = formatDate(date) || todayUTC();

  const data = await ajaxGet(
    `/ajax/schedule?date=${encodeURIComponent(targetDate)}`,
    `${ANIMEKAI_BASE_URL}/schedule`,
  );

  const html = typeof data?.result === 'string' ? data.result : data?.result?.html || '';
  if (!html) {
    return { source: `${ANIMEKAI_BASE_URL}/schedule`, date: targetDate, days: [], results: [] };
  }

  const $ = load(html);

  const days = $('.swiper-slide.day')
    .map((_, el) => {
      const inner = $(el).find('.inner');
      const time = inner.attr('data-time');
      return {
        date: time ? new Date(Number(time) * 1000).toISOString().slice(0, 10) : null,
        dayLabel: inner.find('span').first().text().trim() || null,
        dayOfMonth: inner.find('div').first().text().trim() || null,
        active: $(el).hasClass('active'),
      };
    })
    .get();

  const results = $('ul.items li')
    .map((_, el) => {
      const li = $(el);
      const a = li.find('a.item').first();
      const href = a.attr('href') || null;
      const idMatch = href ? href.match(/-([a-z0-9]{6})(?:$|\?)/i) : null;
      const titleEl = a.find('.title, .d-title').first();
      const epNum = a.find('.ep').first().text().replace(/\D/g, '');

      return {
        time: a.find('.time').first().text().trim() || null,
        title: titleEl.text().trim() || null,
        jname: titleEl.attr('data-jp') || null,
        episodeNumber: epNum ? Number(epNum) : null,
        url: href,
        id: idMatch ? idMatch[1] : null,
      };
    })
    .get();

  return {
    source: `${ANIMEKAI_BASE_URL}/schedule`,
    date: targetDate,
    days,
    total: results.length,
    results,
  };
};
