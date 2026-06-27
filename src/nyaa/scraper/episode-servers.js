import { fetchViewPage, walkFileTree, extractEpisodeFromName, VIDEO_EXTENSIONS, NYAA_BASE_URL } from './_shared.js';

const textOf = ($el) => $el?.text()?.trim().replace(/\s+/g, ' ') || null;

export const getNyaaEpisodeServers = async ({ torrentId } = {}) => {
  const { url, $ } = await fetchViewPage(torrentId, `${NYAA_BASE_URL}/`);
  const id = String(torrentId || '').trim().replace(/^\/+|\/+$/g, '');

  const title = textOf($('.panel-title').first());
  if (!title) {
    throw new Error('Torrent not found');
  }

  const $rootUl = $('.torrent-file-list > ul').first();
  const files = $rootUl.length ? walkFileTree($, $rootUl) : [];

  const servers = files
    .filter((f) => f.type === 'file' && VIDEO_EXTENSIONS.test(f.name))
    .map((file, index) => {
      const idSafe = (file.name || `file-${index + 1}`)
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();
      return {
        name: file.name,
        nameId: idSafe || `file-${index + 1}`,
        episode: extractEpisodeFromName(file.name),
        path: file.path,
        size: file.size,
        sizeBytes: file.sizeBytes,
        index: index + 1,
      };
    });

  return {
    source: url,
    torrentId: id,
    title,
    servers,
    fileCount: files.length,
    videoFileCount: servers.length,
  };
};