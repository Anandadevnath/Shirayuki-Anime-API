import { getAnilistHome } from './anilist.js';
import { searchNyaa } from './rss.js';
import { NYAA_CATEGORY } from '../_shared.js';

const LATEST_RELEASES_LIMIT = 30;

const toLatestRelease = (t) => ({
  title: t.title,
  animeTitle: t.release.title,
  episode: t.release.episode,
  group: t.release.group,
  resolution: t.release.resolution,
  infoHash: t.infoHash,
  size: t.size,
  seeders: t.seeders,
  pubDate: t.pubDate,
  viewUrl: t.viewUrl,
});

// AniList rows + the newest trusted Nyaa releases. Nyaa failing must not
// break the home page, so it degrades to an empty list with an error note.
export const getNyaaHome = async () => {
  const [anilist, latest] = await Promise.allSettled([
    getAnilistHome(),
    searchNyaa({ q: '', c: NYAA_CATEGORY.ENGLISH, f: '2', s: 'id' }),
  ]);
  if (anilist.status === 'rejected') throw anilist.reason;
  return {
    ...anilist.value,
    latestReleases:
      latest.status === 'fulfilled'
        ? latest.value.torrents.slice(0, LATEST_RELEASES_LIMIT).map(toLatestRelease)
        : [],
    latestReleasesError: latest.status === 'rejected' ? latest.reason.message : null,
  };
};
