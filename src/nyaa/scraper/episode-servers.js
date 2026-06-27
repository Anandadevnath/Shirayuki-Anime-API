import { fetchViewPage, walkFileTree, extractEpisodeFromName, VIDEO_EXTENSIONS, NYAA_BASE_URL } from './_shared.js';

const textOf = ($el) => $el?.text()?.trim().replace(/\s+/g, ' ') || null;

export const getNyaaEpisodeServers = async ({ torrentId } = {}) => {
  const id = String(torrentId || '').trim().replace(/^\/+|\/+$/g, '');
  if (!/^\d+$/.test(id)) {
    throw new Error('torrentId must be a numeric Nyaa torrent id');
  }

  const { url, $ } = await fetchViewPage(id, `${NYAA_BASE_URL}/`);

  const title = textOf($('.panel-title').first());
  if (!title) {
    throw new Error('Torrent not found');
  }

  const $rootUl = $('.torrent-file-list > ul').first();
  const files = $rootUl.length ? walkFileTree($, $rootUl) : [];

  const servers = files
    .filter((f) => f.type === 'file' && VIDEO_EXTENSIONS.test(f.name))
    .map((file, index) => {
      const nameId = (file.name || `file-${index + 1}`)
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase() || `file-${index + 1}`;
      return {
        index: index + 1,
        name: file.name,
        nameId,
        episode: extractEpisodeFromName(file.name),
        size: file.size,
        sizeBytes: file.sizeBytes,
      };
    });

  // Hianime-style: episode/servers returns { animeId, episode, servers: { sub, dub, hsub } }.
  // Nyaa doesn't have category blocks; collapse the whole video file list into `sub`
  // (torrents don't carry an inherent audio-track flag — the player picks via /sources).
  return {
    source: url,
    torrentId: id,
    title,
    servers: {
      sub: servers,
    },
    videoFileCount: servers.length,
  };
};