import { REANIME_BASE_URL, apiGet, mapAnimeCard } from '../_shared.js';

// Weekly release schedule from reanime.to/api/v1/schedule — one call returns
// the full week (UTC) with per-day episode entries.
export const getReanimeSchedule = async () => {
  const data = await apiGet('/schedule');
  const days = Array.isArray(data?.schedule) ? data.schedule : [];

  const buckets = days.map((day) => ({
    day: day?.day || null,
    date: day?.date || null,
    episodes: (day?.episodes || []).map((ep) => {
      const card = mapAnimeCard(ep);
      return {
        ...card,
        episode: ep?.episode_number ?? null,
        episodesTotal: ep?.episodes_total ?? null,
        airType: ep?.air_type || null,
        airingStatus: ep?.airing_status || null,
        episodeDate: ep?.episode_date || null,
        delayedFrom: ep?.delayed_from || null,
        delayedUntil: ep?.delayed_until || null,
      };
    }),
  }));

  return {
    source: `${REANIME_BASE_URL}/api/v1/schedule`,
    timezone: data?.timezone || 'UTC',
    week: {
      year: data?.year ?? null,
      weekStart: data?.week_start || null,
      weekEnd: data?.week_end || null,
    },
    // Flat list of every scheduled episode this week, date-sorted ascending.
    episodes: buckets
      .flatMap((b) => b.episodes)
      .sort((a, b) => String(a.episodeDate || '').localeCompare(String(b.episodeDate || ''))),
    schedule: buckets,
  };
};
