import { fetchViewPage, walkFileTree, extractLabelValueMap, extractEpisodeFromName, extractEpisodeRange, VIDEO_EXTENSIONS, parseNumber, parseSizeToBytes, parseMagnet, toAbsoluteUrl, NYAA_BASE_URL } from './_shared.js';
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

// Build a per-file list of eps the file can serve. Two shapes:
//   - `{ file, ep: N }`        — single-episode filename ("E01", "S01E05")
//   - `{ file, range: {lo, hi} }` — batch filename covering a range
//                                   ("S01E01-E03", "E1-E13")
//   - `{ file, eps: [n,n,...] }` — multi-episode listing via repeated markers
//
// Range takes precedence over the single-ep fallback because "S01E01-E03"
// matches both: `extractEpisodeFromName` returns 1 (from the SxxExx tag),
// `extractEpisodeRange` returns {lo:1, hi:3} from the literal range token.
// Returning 1 would silently hide ep 2 and ep 3 inside the same file.
const extractEpisodeCandidates = (files) => {
  const out = [];
  for (const file of files) {
    if (file?.type !== 'file' || !VIDEO_EXTENSIONS.test(file?.name || '')) continue;
    const range = extractEpisodeRange(file.name);
    if (range && range.lo > 0 && range.hi >= range.lo) {
      out.push({ file, range, ep: null });
      continue;
    }
    const n = extractEpisodeFromName(file.name);
    if (Number.isFinite(n) && n > 0) {
      out.push({ file, ep: n, range: null });
    }
  }
  return out.sort((a, b) => {
    const aLo = a.range ? a.range.lo : (a.ep ?? Infinity);
    const bLo = b.range ? b.range.lo : (b.ep ?? Infinity);
    return aLo - bLo;
  });
};

// True when the requested ep is inside the candidate's range (or equals
// its single ep). Lets us distinguish "this file is exactly the ep you
// asked for" (no fallback flag) from "this file is the closest match".
const candidateMatchesEpisode = (candidate, ep) => {
  if (!candidate || !Number.isFinite(ep)) return false;
  if (candidate.range) return ep >= candidate.range.lo && ep <= candidate.range.hi;
  if (candidate.ep != null) return candidate.ep === ep;
  return false;
};

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
  // Strict match: requested ep is inside the candidate's range or equals
  // its single ep. A range match counts as "found" — file E01-E03 is the
  // correct answer for ep 1, 2, and 3 alike.
  const requestedCandidate = candidates.find((c) => candidateMatchesEpisode(c, episodeNumber)) || null;
  // Closest fallback: nearest single-ep or range-start. Used only when
  // no candidate covers the requested ep, so the client can still play
  // something instead of 404-ing on the first file probe.
  const fallback = candidates
    .map((c) => {
      const lo = c.range ? c.range.lo : (c.ep ?? Infinity);
      return { candidate: c, distance: Math.abs(lo - episodeNumber) };
    })
    .sort((a, b) => a.distance - b.distance)[0]?.candidate || null;
  const selected = requestedCandidate || fallback;

  const episodeFile = selected?.file || null;
  const episodeFileName = extractEpisodeFileName(episodeFile);
  const episodeFileSize = episodeFile?.size || null;
  const episodeFileBytes = episodeFile?.sizeBytes || null;

  // `allEpisodes` = every distinct ep number we can serve from this
  // torrent. Fans out each range so callers see the full picture (e.g.
  // a single E01-E03 file reports [1, 2, 3], not just [1]).
  const allEpisodes = Array.from(new Set(
    candidates.flatMap((c) => c.range ? Array.from({ length: c.range.hi - c.range.lo + 1 }, (_, i) => c.range.lo + i) : (c.ep != null ? [c.ep] : []))
  )).sort((a, b) => a - b);

  // `selectedEps` = the ep numbers the picked file actually covers.
  // Lets the response surface "you asked for 6, this file is 1-3" instead
  // of pretending the file is ep 6.
  const selectedEps = selected?.range
    ? Array.from({ length: selected.range.hi - selected.range.lo + 1 }, (_, i) => selected.range.lo + i)
    : (selected?.ep != null ? [selected.ep] : []);

  const magnetInfo = parseMagnet(magnetHref);
  const resolvedInfoHash = (magnetInfo?.infoHash || infoHashText || '').toLowerCase();
  const magnetTrackers = Array.isArray(magnetInfo?.trackers) ? magnetInfo.trackers : [];
  // The magnet URL/trackers are intentionally not surfaced in the response,
  // but the parsed infoHash is still required to resolve WebTorrent state.
  void magnetHref;
  void magnetInfo;

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
        const t = await torrentClient.addTorrentFile(buf, resolvedInfoHash, { trackers: magnetTrackers });
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
          // Surface which eps the selected file covers so the client can
          // tell "you asked for 6, got a 1-3 pack" without parsing the
          // filename again.
          coversEpisodes: selectedEps,
          isExactMatch: Boolean(requestedCandidate),
        }
      : null,
    allEpisodes,
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
    },
    sources: [
      {
        type: 'torrent',
        torrentId: id,
        episode: episodeNumber,
        fileName: episodeFile?.name || null,
        filePath: episodeFile?.path || null,
        fileIndex: fileIndex >= 0 ? fileIndex : null,
        size: episodeFileSize,
        sizeBytes: episodeFileBytes,
        torrentUrl: torrentHref ? toAbsoluteUrl(torrentHref) : null,
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