import {
  HIANIME_BASE_URL,
  fetchPage,
  parseNumber,
  getAnimeId,
  toAbsoluteUrl,
} from './_shared.js';

const formatDate = (raw) => {
  if (!raw) return null;
  const m = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};

const todayUTC = () => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate()
  ).padStart(2, '0')}`;
};

export const getHianimeSchedule = async ({ date, timezone } = {}) => {
  const targetDate = formatDate(date) || todayUTC();
  const today = todayUTC();
  const zone = String(timezone || 'UTC').trim() || 'UTC';

  const { url, $ } = await fetchPage('/ajax/schedule', {
    searchParams: { dates: targetDate, zone, date_today: today },
    referer: `${HIANIME_BASE_URL}/schedule`,
    xhr: true,
  });

  const items = $('li')
    .map((_, el) => {
      const $li = $(el);
      const $link = $li.find('a.tsl-link').first();
      const href = $link.attr('href')?.trim() || null;
      if (!href) return null;

      const $time = $li.find('.time').first();
      const $name = $li.find('.film-name').first();
      const buttonText = $li.find('.fd-play button').first().text().trim();

      return {
        id: getAnimeId(href),
        title: $name.text().trim() || null,
        jname: $name.attr('data-jp')?.trim() || null,
        ename: $name.attr('data-en')?.trim() || null,
        href,
        url: toAbsoluteUrl(href),
        episodeNumber: parseNumber(buttonText),
        airingTime: $time.attr('data-time') || null,
        time: $time.text().trim() || null,
      };
    })
    .get()
    .filter(Boolean);

  return {
    source: url,
    date: targetDate,
    timezone: zone,
    results: items,
  };
};
