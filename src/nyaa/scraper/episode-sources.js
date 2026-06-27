import { fetchViewPage, walkFileTree, extractLabelValueMap, extractEpisodeFromName, VIDEO_EXTENSIONS, parseNumber, parseSizeToBytes, parseMagnet, toAbsoluteUrl, NYAA_BASE_URL } from './_shared.js';
import { torrentClient } from '../stream/torrent-client.js';
import { probeFile, pickAudioIndexForCategory, normalizeCategory } from '../stream/probe.js';
import { axios } from '../../utils/scrapper-deps.js';

const normalizeTorrentId = (raw) => {
  if (!raw) return null;
  const id = String(raw).split('#')[0].split('?')[0].trim().replace(/^\/+|\/+$/g, '');
  if (/^\d+$/.test(id)) return id;
  const fromPath = id.match(/view\/(\d+)/i);
  return fromPath ? fromPath[1] : null;
};

const parseEpisodeNumber = (episodeParam) => {
  if (episodeParam !== undefined && episodeParam !== null && episodeParam !== '') {
    const n = Number(episodeParam);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 1;
};

const textOf = ($el) => $el?.text()?.trim().replace(/\s+/g, ' ') || null;

const pickText = (map, key) => {
  const $v = map[key];
  return $v && $v.length ? textOf($v) : null;
};

const extractEpisodeCandidates = (files) =>
  files
    .filter((f) => f.type === 'file' && VIDEO_EXTENSIONS.test(f.name))
    .map((file) => ({ file, episode: extractEpisodeFromName(file.name) }))
    .filter((c) => c.episode && c.episode > 0)
    .sort((a, b) => a.episode - b.episode);

const extractEpisodeFileName = (file) => {
  if (!file?.name) return null;
  return file.name.replace(VIDEO_EXTENSIONS, '');
};

const fetchTorrentFileBuffer = async (torrentId) => {
  const res = await axios.get(`${NYAA_BASE_URL}/download/${torrentId}.torrent`, {
    proxy: false,
    timeout: 20000,
    responseType: 'arraybuffer',
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: '*/*',
    },
  });
  return Buffer.from(res?.data || []);
};

export const getNyaaEpisodeSources = async ({ torrentId, ep, baseUrl, transcode = false, category = 'sub', server = 'default' } = {}) => {
  const id = normalizeTorrentId(torrentId);
  if (!id) {
    throw new Error('torrentId query parameter is required (numeric Nyaa torrent id)');
  }
  const episodeNumber = parseEpisodeNumber(ep);
  const normalizedCategory = normalizeCategory(category);
  const normalizedServer = String(server || 'default').toLowerCase().replace(/\s+/g, '-').trim() || 'default';

  const { url, $ } = await fetchViewPage(id, `${NYAA_BASE_URL}/`);

  const title = textOf($('.panel-title').first());
  if (!title) {
    throw new Error('Torrent not found');
  }

  const labels = extractLabelValueMap($);
  const $dateEl = labels['date'];
  const dateText = pickText(labels, 'date');
  const timestamp = $dateEl && $dateEl.length && $dateEl.attr('data-timestamp')
    ? Number($dateEl.attr('data-timestamp')) || null
    : null;

  const $footer = $('.panel-footer').first();
  const torrentHref = $footer.find('a[href$=".torrent"]').first().attr('href') || null;
  const magnetHref = $footer.find('a[href^="magnet:"]').first().attr('href') || null;

  const sizeText = pickText(labels, 'file size');
  const seedersText = pickText(labels, 'seeders');
  const leechersText = pickText(labels, 'leechers');
  const completedText = pickText(labels, 'completed');
  const infoHashText = pickText(labels, 'info hash');

  const $rootUl = $('.torrent-file-list > ul').first();
  const files = $rootUl.length ? walkFileTree($, $rootUl) : [];

  const candidates = extractEpisodeCandidates(files);
  const requestedCandidate = candidates.find((c) => c.episode === episodeNumber);
  const fallback = candidates[0] || null;
  const selected = requestedCandidate || fallback;

  const episodeFile = selected?.file || null;
  const episodeFileName = extractEpisodeFileName(episodeFile);
  const episodeFileSize = episodeFile?.size || null;
  const episodeFileBytes = episodeFile?.sizeBytes || null;

  const magnetInfo = parseMagnet(magnetHref);
  const resolvedInfoHash = (magnetInfo?.infoHash || infoHashText || '').toLowerCase();

  // fileIndex for the stream URL must match WebTorrent's torrent.files order,
  // which differs from walkFileTree. Resolve via the torrent client when
  // possible (cheapest: derive from already-loaded torrent or fall back to
  // /download/{id}.torrent — same metadata source /stream uses).
  let fileIndex = -1;
  let wtFile = null;
  if (episodeFile && resolvedInfoHash) {
    const cached = await torrentClient.lookupTorrent(resolvedInfoHash).catch(() => null);
    if (cached) {
      wtFile = cached.files.find((f) => f.name === episodeFile.name) || null;
      fileIndex = wtFile ? cached.files.indexOf(wtFile) : -1;
    } else {
      try {
        const buf = await fetchTorrentFileBuffer(id);
        const t = await torrentClient.addTorrentFile(buf, resolvedInfoHash);
        wtFile = t.files.find((f) => f.name === episodeFile.name) || null;
        fileIndex = wtFile ? t.files.indexOf(wtFile) : -1;
      } catch {
        fileIndex = -1;
      }
    }
  }

  // Probe audio/subtitle tracks via ffprobe. Best-effort: if ffprobe isn't
  // installed or the stream errors, we still return the source info — the
  // browser player will fall back to its built-in track selector.
  let tracks = { audio: [], subtitle: [] };
  if (wtFile) {
    try {
      tracks = await probeFile(wtFile);
    } catch (err) {
      console.error('[nyaa/episode-sources] probe failed:', err.message);
    }
  }

  // Pick which audio stream to bake into streamUrl. The `category` query
  // param selects the language (sub = Japanese, dub = English) — we resolve
  // that to a stream index here so the player can drop streamUrl straight
  // into a <video src> without an extra round trip.
  const pick = pickAudioIndexForCategory({
    audioTracks: tracks.audio,
    fileName: episodeFile?.name || '',
    category: normalizedCategory,
  });
  const audioIndex = pick.audioIndex;

  const buildStreamUrl = () => {
    if (!resolvedInfoHash || fileIndex < 0 || !baseUrl) return null;
    const params = new URLSearchParams({
      hash: resolvedInfoHash,
      file: String(fileIndex),
    });
    if (audioIndex != null) params.set('audio', String(audioIndex));
    if (transcode) params.set('transcode', '1');
    return `${baseUrl}/api/v2/nyaa/stream/file?${params.toString()}`;
  };

  const streamUrl = buildStreamUrl();

  return {
    source: url,
    torrentId: id,
    episode: episodeNumber,
    title,
    episodeFound: Boolean(requestedCandidate),
    episodeFallback: requestedCandidate ? false : Boolean(fallback),
    episodeFile: episodeFile
      ? {
          path: episodeFile.path,
          name: episodeFile.name,
          displayName: episodeFileName,
          size: episodeFileSize,
          sizeBytes: episodeFileBytes,
        }
      : null,
    allEpisodes: candidates.map((c) => c.episode),
    category: normalizedCategory,
    server: normalizedServer,
    audioTrack: {
      requestedCategory: normalizedCategory,
      index: audioIndex,
      pickReason: pick.reason,
    },
    torrent: {
      title,
      size: sizeText,
      sizeBytes: parseSizeToBytes(sizeText),
      date: dateText,
      timestamp,
      seeders: parseNumber(seedersText) || 0,
      leechers: parseNumber(leechersText) || 0,
      completed: parseNumber(completedText) || 0,
      infoHash: infoHashText,
      torrentUrl: torrentHref ? toAbsoluteUrl(torrentHref) : null,
      magnetUrl: magnetHref,
      magnet: magnetInfo,
      trackers: magnetInfo?.trackers || [],
    },
    sources: [
      {
        type: 'torrent',
        torrentId: id,
        episode: episodeNumber,
        fileName: episodeFile?.name || null,
        filePath: episodeFile?.path || null,
        size: episodeFileSize,
        sizeBytes: episodeFileBytes,
        torrentUrl: torrentHref ? toAbsoluteUrl(torrentHref) : null,
        magnetUrl: magnetHref,
        infoHash: resolvedInfoHash || infoHashText,
        // HiAnime-style fields so the UI can be provider-agnostic.
        category: normalizedCategory,
        server: normalizedServer,
        // Drop into a <video src> directly. Same heuristic as /stream —
        // server must have called /stream (or /stream/file) at least once
        // for the torrent to be loaded in the WebTorrent client.
        streamUrl,
        streamType: streamUrl ? 'http-range' : null,
        // Audio/subtitle tracks inside the container. `index` matches the
        // 0-based numbering ffmpeg uses for `-map 0:a:N` / `-map 0:s:N`.
        // The streamUrl above already has the picked `audio` query baked
        // in; pass ?subtitle=N too to additionally select a subtitle.
        tracks,
      },
    ],
    tracks,
  };
};