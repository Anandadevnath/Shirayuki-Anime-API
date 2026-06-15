import { ANIXO_BASE_URL } from './_shared.js';
import { anilistQuery } from './_anilist.js';

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

// Unix range [00:00, 24:00) UTC for the given YYYY-MM-DD.
const dayRangeUnix = (dateStr) => {
  const [y, mo, da] = dateStr.split('-').map(Number);
  const start = Math.floor(Date.UTC(y, mo - 1, da, 0, 0, 0) / 1000);
  const end = start + 24 * 60 * 60;
  return { start, end };
};

const SCHEDULE_QUERY = `
  query AnixoSchedule($start: Int, $end: Int, $page: Int) {
    Page(page: $page, perPage: 50) {
      pageInfo { currentPage hasNextPage }
      airingSchedules(airingAt_greater: $start, airingAt_lesser: $end, sort: TIME) {
        episode
        airingAt
        timeUntilAiring
        media {
          id
          idMal
          title { romaji english native userPreferred }
          coverImage { large medium color }
          format
          episodes
          isAdult
        }
      }
    }
  }
`;

export const getAnixoSchedule = async ({ date, timezone, page } = {}) => {
  const targetDate = formatDate(date) || todayUTC();
  const zone = String(timezone || 'UTC').trim() || 'UTC';
  const { start, end } = dayRangeUnix(targetDate);
  const normalizedPage = Number(page) > 0 ? Number(page) : 1;

  const data = await anilistQuery(SCHEDULE_QUERY, { start, end, page: normalizedPage });
  const schedules = data?.Page?.airingSchedules || [];

  const results = schedules
    .filter((s) => s?.media && !s.media.isAdult)
    .map((s) => {
      const media = s.media;
      const title = media.title || {};
      return {
        id: media.id,
        idMal: media.idMal ?? null,
        title: title.english || title.romaji || title.userPreferred || null,
        jname: title.native || title.romaji || null,
        ename: title.english || null,
        poster: media.coverImage?.large || media.coverImage?.medium || null,
        type: media.format || null,
        episodeNumber: s.episode ?? null,
        airingAt: s.airingAt ?? null,
        airingTime: s.airingAt ? new Date(s.airingAt * 1000).toISOString() : null,
        timeUntilAiring: s.timeUntilAiring ?? null,
        href: `/watch/${media.id}`,
        url: `${ANIXO_BASE_URL}/watch/${media.id}`,
      };
    });

  return {
    source: `${ANIXO_BASE_URL}/schedule`,
    date: targetDate,
    timezone: zone,
    hasNextPage: Boolean(data?.Page?.pageInfo?.hasNextPage),
    total: results.length,
    results,
  };
};
