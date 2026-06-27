// Probe a torrent file's audio/subtitle streams via ffprobe.
//
// Why this lives in stream/: probing requires either the on-disk file
// (preferred — passed to ffprobe directly, avoids pipe EPIPE issues with
// WebTorrent's lazy read streams) or, when the file isn't yet fully
// downloaded, a piped stream from WebTorrent's createReadStream.
//
// Probe output is parsed into a flat array shaped for the player UI:
//
//   {
//     audio:    [{ index: 0, language: 'jpn', label: 'Japanese', codec: 'aac' }, ...],
//     subtitle: [{ index: 0, language: 'eng', label: 'English',   codec: 'ass' }, ...]
//   }
//
// `index` is the stream index within its stream-type (audio / subtitle),
// matching the 0-based numbering ffmpeg uses for `-map 0:a:N` / `-map 0:s:N`.
// `language` follows BCP-47-ish 3-letter ISO 639-2 codes from the container
// metadata — empty string when unknown. `label` is derived from the language
// tag when possible, falling back to the codec, so the UI has something
// readable to show.

import { spawn } from 'node:child_process';

// Lightweight fallback used when ffprobe isn't on PATH — gives the player
// something to render without making the whole scrape path fail.
const fallbackProbe = (file) => {
  const ext = String(file?.name || '').toLowerCase();
  const subs = /\.mkv$/i.test(ext) || /\.mka$/i.test(ext) ? 1 : 0;
  return {
    audio: [{ index: 0, language: '', label: 'Default', codec: '' }],
    subtitle: subs > 0 ? [] : [],
    fallback: true,
  };
};

const LANG_NAMES = {
  eng: 'English', en: 'English',
  jpn: 'Japanese', ja: 'Japanese',
  spa: 'Spanish', es: 'Spanish',
  fre: 'French', fra: 'French', fr: 'French',
  ger: 'German', deu: 'German', de: 'German',
  ita: 'Italian', it: 'Italian',
  por: 'Portuguese', pt: 'Portuguese',
  rus: 'Russian', ru: 'Russian',
  chi: 'Chinese (Simplified)', zho: 'Chinese', zh: 'Chinese',
  kor: 'Korean', ko: 'Korean',
  ara: 'Arabic', ar: 'Arabic',
  hin: 'Hindi', hi: 'Hindi',
  tha: 'Thai', th: 'Thai',
  vie: 'Vietnamese', vi: 'Vietnamese',
  pol: 'Polish', pl: 'Polish',
  tur: 'Turkish', tr: 'Turkish',
  ukr: 'Ukrainian', uk: 'Ukrainian',
  ind: 'Indonesian', id: 'Indonesian',
};

const labelForTrack = (lang, codec, kind) => {
  if (lang) {
    const name = LANG_NAMES[lang.toLowerCase()] || lang.toUpperCase();
    return kind === 'subtitle' ? `${name} (Subtitles)` : name;
  }
  if (codec) {
    return kind === 'subtitle'
      ? `${codec.toUpperCase()} Subtitles`
      : `${codec.toUpperCase()} Audio`;
  }
  return kind === 'subtitle' ? 'Subtitles' : 'Audio';
};

const parseFfprobeOutput = (json) => {
  const streams = Array.isArray(json?.streams) ? json.streams : [];
  const audio = [];
  const subtitle = [];
  for (const s of streams) {
    const codec = (s?.codec_name || '').toLowerCase();
    if (s?.codec_type === 'audio') {
      audio.push({
        index: audio.length,
        language: s?.tags?.language || '',
        label: labelForTrack(s?.tags?.language, codec, 'audio'),
        codec,
        title: s?.tags?.title || null,
        channels: s?.channels || null,
        default: Boolean(s?.disposition?.default),
      });
    } else if (s?.codec_type === 'subtitle') {
      subtitle.push({
        index: subtitle.length,
        language: s?.tags?.language || '',
        label: labelForTrack(s?.tags?.language, codec, 'subtitle'),
        codec,
        title: s?.tags?.title || null,
        default: Boolean(s?.disposition?.default),
      });
    }
  }
  return { audio, subtitle, fallback: false };
};

// Run ffprobe and resolve with the parsed JSON. Two modes:
//   1. `input` is an absolute filesystem path — ffprobe opens it directly.
//      Fast, no pipe issues, reads only the bytes it needs.
//   2. `input` is a WebTorrent `File` — pipe from createReadStream, but
//      attach an early 'data' listener so we can unpipe the moment ffprobe
//      emits its JSON on stdout. This prevents WebTorrent from pushing more
//      bytes into ff.stdin after ffprobe has exited (which causes EPIPE).
const runFfprobe = (input, { timeoutMs = 10000, onStdoutChunk } = {}) =>
  new Promise((resolve) => {
    let ff;
    try {
      ff = spawn(
        'ffprobe',
        ['-v', 'error', '-print_format', 'json', '-show_streams', '-i', input],
        { stdio: ['pipe', 'pipe', 'pipe'] },
      );
    } catch (err) {
      console.error('[nyaa/stream/probe] ffprobe spawn error:', err.message);
      resolve({ ok: false, error: err });
      return;
    }

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      try { ff.kill('SIGKILL'); } catch { /* noop */ }
      resolve(result);
    };

    let stdout = '';
    let stderrBuf = '';
    ff.stdout.on('data', (b) => {
      stdout += b.toString();
      if (onStdoutChunk) onStdoutChunk(stdout);
      if (stdout.length > 1024 * 1024) stdout = stdout.slice(-1024 * 1024);
    });
    ff.stderr.on('data', (b) => {
      stderrBuf += b.toString();
      if (stderrBuf.length > 4096) stderrBuf = stderrBuf.slice(-4096);
    });
    ff.on('error', (err) => {
      console.error('[nyaa/stream/probe] ffprobe error:', err.message);
      finish({ ok: false, error: err });
    });
    ff.on('close', (code) => {
      if (code !== 0 && code !== null && !stdout) {
        console.error(
          `[nyaa/stream/probe] ffprobe exited ${code}:`,
          stderrBuf.trim(),
        );
        finish({ ok: false, error: new Error(`ffprobe exited ${code}`) });
        return;
      }
      finish({ ok: true, stdout, stderr: stderrBuf });
    });

    const handle = setTimeout(() => {
      if (!settled) {
        console.warn('[nyaa/stream/probe] timeout');
        finish({ ok: false, error: new Error('ffprobe timeout') });
      }
    }, timeoutMs);
    ff.on('close', () => clearTimeout(handle));
  });

// Probe a torrent file's audio/subtitle streams. Tries (in order):
//   1. ffprobe directly against `file.path` if it points to a local file.
//   2. Pipe from WebTorrent's createReadStream. As soon as ffprobe emits
//      output we unpipe + destroy the source to avoid EPIPE on lazy streams.
//   3. Fallback `{ audio: [...], subtitle: [], fallback: true }` so the
//      scrape endpoint always returns a usable payload.
export const probeFile = async (file, opts = {}) => {
  if (!file) return fallbackProbe(file);

  // Fast path: file is on disk. WebTorrent exposes the partial-download
  // path via `file.path` once the torrent is ready.
  const localPath = typeof file.path === 'string' ? file.path : null;
  if (localPath) {
    try {
      // fs.existsSync is intentional — ffprobe would error out anyway, but
      // we want to keep the fallback path for files that are zero-byte or
      // haven't started downloading yet.
      const { existsSync, statSync } = await import('node:fs');
      if (existsSync(localPath)) {
        const stat = statSync(localPath);
        if (stat.size > 0) {
          const result = await runFfprobe(localPath, opts);
          if (result.ok) {
            try {
              return parseFfprobeOutput(JSON.parse(result.stdout));
            } catch (err) {
              console.error('[nyaa/stream/probe] JSON parse error:', err.message);
            }
          }
        }
      }
    } catch (err) {
      console.error('[nyaa/stream/probe] local probe failed:', err.message);
    }
  }

  // Slow path: file isn't on disk yet (or local probe failed). Pipe from
  // WebTorrent, but stop the source as soon as ffprobe emits output so the
  // lazy stream doesn't push bytes into a closed pipe.
  if (typeof file.createReadStream !== 'function') {
    return fallbackProbe(file);
  }

  return new Promise((resolve) => {
    let ff;
    try {
      ff = spawn('ffprobe', [
        '-v', 'error',
        '-print_format', 'json',
        '-show_streams',
        '-i', 'pipe:0',
      ], { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) {
      console.error('[nyaa/stream/probe] pipe spawn error:', err.message);
      resolve(fallbackProbe(file));
      return;
    }

    let settled = false;
    let wtStream = null;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      try { ff.kill('SIGKILL'); } catch { /* noop */ }
      if (wtStream) {
        try { wtStream.unpipe(ff.stdin); } catch { /* noop */ }
        try { wtStream.destroy(); } catch { /* noop */ }
      }
      resolve(value);
    };

    let stdout = '';
    let stderrBuf = '';
    ff.stdout.on('data', (b) => {
      stdout += b.toString();
      if (stdout.length > 1024 * 1024) stdout = stdout.slice(-1024 * 1024);
    });
    ff.stderr.on('data', (b) => {
      stderrBuf += b.toString();
      if (stderrBuf.length > 4096) stderrBuf = stderrBuf.slice(-4096);
    });
    ff.on('error', (err) => {
      console.error('[nyaa/stream/probe] pipe ffprobe error:', err.message);
      settle(fallbackProbe(file));
    });
    ff.on('close', (code) => {
      if (code !== 0 && code !== null && !stdout) {
        console.error(
          `[nyaa/stream/probe] pipe ffprobe exited ${code}:`,
          stderrBuf.trim(),
        );
        settle(fallbackProbe(file));
        return;
      }
      try {
        settle(parseFfprobeOutput(JSON.parse(stdout)));
      } catch (err) {
        console.error('[nyaa/stream/probe] pipe JSON parse error:', err.message);
        settle(fallbackProbe(file));
      }
    });

    wtStream = file.createReadStream({ start: 0 });
    wtStream.on('error', (err) => {
      console.error('[nyaa/stream/probe] WebTorrent stream error:', err.message);
      settle(fallbackProbe(file));
    });
    // The critical bit: as soon as ffprobe writes anything to stdout it has
    // parsed enough of the container header to enumerate streams. Unpipe
    // and destroy the WebTorrent stream so it doesn't push more bytes into
    // the (about-to-be-closed) ff.stdin — that's what causes EPIPE.
    ff.stdout.once('data', () => {
      try { wtStream.unpipe(ff.stdin); } catch { /* noop */ }
      try { wtStream.destroy(); } catch { /* noop */ }
    });
    wtStream.pipe(ff.stdin);
    ff.stdin.on('error', () => { /* EPIPE if we didn't unpipe in time */ });

    setTimeout(() => {
      if (!settled) {
        console.warn('[nyaa/stream/probe] pipe timeout — using fallback');
        settle(fallbackProbe(file));
      }
    }, opts.timeoutMs || 10000);
  });
};

// Map a HiAnime-style category (`sub` / `dub` / `raw`) to an audio track
// index from a probed file. Nyaa torrents often bundle Japanese + English
// (and sometimes others) inside a single MKV, so "sub vs dub" is really a
// question of "which audio stream do we mux into the transcode".
//
// Selection order:
//   1. Explicit language tag from ffprobe — `jpn`/`ja` for sub, `eng`/`en`
//      for dub.
//   2. Filename hint — `[Dual-Audio]`, `(English Dub)`, `(Japanese Only)`.
//   3. Track flagged default in the container.
//   4. First audio track (or null if there isn't one).
//
// Returns `{ audioIndex, reason }` so callers can surface a helpful message
// in the API response when the picked track is a best-guess rather than a
// confirmed match.
const normalizeCategory = (raw) => {
  const c = String(raw || 'sub').toLowerCase().trim();
  if (c === 'dub' || c === 'd') return 'dub';
  if (c === 'raw') return 'raw';
  return 'sub';
};

// Filename flags we treat as authoritative hints. Order matters — the first
// matching tag wins.
const FILENAME_HINTS = [
  { pattern: /\[english\s*dub\]|\(english\s*dub\)|english\s*dub/i, category: 'dub', only: true },
  { pattern: /\[japanese\s*only\]|\(japanese\s*only\)|jpn\s*only|japanese\s*only/i, category: 'sub', only: true },
  { pattern: /\[dual[\s-]*audio\]|dual[\s-]*audio/i, category: null }, // both available — rely on tag/default
  { pattern: /\[eng\s*dub\]|\[engdub\]/i, category: 'dub', only: true },
];

const audioLanguageMatches = (track, category) => {
  const lang = String(track?.language || '').toLowerCase();
  if (!lang) return false;
  if (category === 'sub') return lang === 'jpn' || lang === 'ja';
  if (category === 'dub') return lang === 'eng' || lang === 'en';
  return false;
};

const titleHintsForCategory = (track, category) => {
  const title = String(track?.title || '').toLowerCase();
  if (!title) return false;
  if (category === 'dub') return /english|eng|dub|\busa\b|\buk\b/.test(title) && !/japanese|jpn|\bjap\b/.test(title);
  if (category === 'sub') return /japanese|jpn|\bjap\b/.test(title) && !/english|eng|dub/.test(title);
  return false;
};

export const pickAudioIndexForCategory = ({ audioTracks = [], fileName = '', category = 'sub' } = {}) => {
  const c = normalizeCategory(category);
  const total = audioTracks.length;
  const fallback = audioTracks[0] ? { audioIndex: audioTracks[0].index, reason: 'default-first-track' } : null;
  if (!total) return { audioIndex: null, reason: 'no-audio-tracks' };

  // 1. Filename-level "only X" hint — if the release explicitly ships only
  //    one language, ignore the category and use whichever audio we have.
  for (const hint of FILENAME_HINTS) {
    if (!hint.only) continue;
    if (hint.pattern.test(fileName)) {
      return {
        audioIndex: audioTracks[0].index,
        reason: `filename-only:${hint.category}`,
      };
    }
  }

  // 2. Language-tag match (most reliable when the encoder tagged streams).
  const langMatch = audioTracks.find((t) => audioLanguageMatches(t, c));
  if (langMatch) return { audioIndex: langMatch.index, reason: `language:${langMatch.language}` };

  // 3. Track title match.
  const titleMatch = audioTracks.find((t) => titleHintsForCategory(t, c));
  if (titleMatch) return { audioIndex: titleMatch.index, reason: `title:${titleMatch.title}` };

  // 4. Disposition default flag — if the container already picked one.
  const defaulted = audioTracks.find((t) => t.default);
  if (defaulted) return { audioIndex: defaulted.index, reason: 'default-disposition' };

  // 5. First audio track.
  return fallback;
};

export { normalizeCategory };