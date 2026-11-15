import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { guard, rewritePlaylist, parseRange } from '../stream-worker/http-utils.js';
import { selectFileIndex, mimeForFile } from '../stream-worker/file-select.js';
import { planTranscode, buildFfmpegArgs, parseProbeOutput } from '../stream-worker/hls-transcoder.js';
import { signStreamToken } from '../src/nyaa/scraper/stream-token.js';

const secret = 's3cret';
const hash = 'bc25231f657d115e61e68d0e124d3ff5ec101f69';

const app = new Hono();
app.get('/stream/:hash/:sel/x', (c) => guard(c, secret) || c.text('ok'));
const call = (path) => app.request(path);

test('worker guard: rejects bad hash, bad selection and bad/missing token', async () => {
  const t = encodeURIComponent(signStreamToken({ hash, sel: 'auto', ttlSec: 600, secret }));
  assert.equal((await call(`/stream/${hash}/auto/x?t=${t}`)).status, 200);
  assert.equal((await call(`/stream/nothex/auto/x?t=${t}`)).status, 400);
  assert.equal((await call(`/stream/${hash}/..%2F..%2Fetc/x?t=${t}`)).status, 400);
  assert.equal((await call(`/stream/${hash}/auto/x`)).status, 403);
  assert.equal((await call(`/stream/${hash}/e3/x?t=${t}`)).status, 403);
});

test('rewritePlaylist pins start to 0 and appends the token to segment lines only', () => {
  const out = rewritePlaylist('#EXTM3U\n#EXTINF:6.0,\nseg_00000.ts\n#EXT-X-ENDLIST', 'a.b');
  assert.equal(
    out,
    '#EXTM3U\n#EXT-X-START:TIME-OFFSET=0,PRECISE=YES\n#EXTINF:6.0,\nseg_00000.ts?t=a.b\n#EXT-X-ENDLIST',
  );
});

test('parseRange handles open, suffix, clamped and unsatisfiable ranges', () => {
  assert.deepEqual(parseRange('bytes=0-', 100), { start: 0, end: 99 });
  assert.deepEqual(parseRange('bytes=10-20', 100), { start: 10, end: 20 });
  assert.deepEqual(parseRange('bytes=-10', 100), { start: 90, end: 99 });
  assert.deepEqual(parseRange('bytes=50-500', 100), { start: 50, end: 99 });
  assert.equal(parseRange('bytes=200-', 100), 'unsatisfiable');
  assert.equal(parseRange(undefined, 100), null);
  assert.equal(parseRange('items=1-2', 100), null);
});

test('selectFileIndex picks largest video, batch episode, or explicit index', () => {
  const files = [
    { name: 'readme.txt', length: 10 },
    { name: '[SubsPlease] Show - 01 (1080p).mkv', path: 'Show/01.mkv', length: 1000 },
    { name: '[SubsPlease] Show - 02 (1080p).mkv', path: 'Show/02.mkv', length: 1200 },
    { name: '[SubsPlease] Show - NCOP1 (1080p).mkv', path: 'Show/NCOP1.mkv', length: 90 },
  ];
  assert.equal(selectFileIndex(files, 'auto'), 2);
  assert.equal(selectFileIndex(files, 'e1'), 1);
  assert.equal(selectFileIndex(files, '1'), 1);
  assert.throws(() => selectFileIndex(files, '0'), /not a video/);
  assert.throws(() => selectFileIndex(files, 'e9'), /not found/);
  assert.throws(() => selectFileIndex([{ name: 'a.txt', length: 1 }], 'auto'), /no playable/);
  assert.equal(mimeForFile('x.mkv'), 'video/x-matroska');
});

test('planTranscode copies 8-bit H.264 and transcodes HEVC; picks English text subs', () => {
  const streams = [
    { index: 0, codec_type: 'video', codec_name: 'h264', pix_fmt: 'yuv420p' },
    { index: 1, codec_type: 'audio', codec_name: 'aac', channels: 2, disposition: { default: 1 } },
    { index: 2, codec_type: 'subtitle', codec_name: 'ass', tags: { language: 'eng', title: 'Signs & Songs' } },
    { index: 3, codec_type: 'subtitle', codec_name: 'ass', tags: { language: 'eng', title: 'Full' } },
    { index: 4, codec_type: 'subtitle', codec_name: 'hdmv_pgs_subtitle' },
  ];
  const plan = planTranscode(streams, 'auto');
  assert.deepEqual([plan.copyVideo, plan.copyAudio, plan.subtitleIndex], [true, true, 3]);
  const hevc = planTranscode([{ ...streams[0], codec_name: 'hevc' }, streams[1]], 'auto');
  assert.equal(hevc.copyVideo, false);
  assert.equal(planTranscode([{ ...streams[0], codec_name: 'hevc' }], 'never').copyVideo, true);
  assert.throws(() => planTranscode([streams[1]]), /No video/);

  const args = buildFfmpegArgs('http://127.0.0.1/raw', '/tmp/out', plan);
  assert.ok(args.includes('copy'));
  assert.ok(args.includes('/tmp/out/index.m3u8'));
  assert.ok(args.includes('/tmp/out/subs.vtt'));
  assert.equal(args.indexOf('-i') + 1, args.indexOf('http://127.0.0.1/raw'));
});

test('rate limiter allows up to the limit per client, then blocks', async () => {
  const { createRateLimiter } = await import('../src/nyaa/controllers/_rate-limit.js');
  const check = createRateLimiter(2);
  const ctx = (ip) => ({ req: { header: (h) => (h === 'x-forwarded-for' ? ip : undefined) } });
  assert.equal(check(ctx('1.1.1.1')).allowed, true);
  assert.equal(check(ctx('1.1.1.1')).allowed, true);
  const third = check(ctx('1.1.1.1'));
  assert.equal(third.allowed, false);
  assert.ok(third.retryAfterSec > 0);
  assert.equal(check(ctx('2.2.2.2')).allowed, true);
});

test('rss parser survives an invalid pubDate', async () => {
  const { parseNyaaRss } = await import('../src/nyaa/scraper/rss.js');
  const xml = `<rss xmlns:nyaa="x"><channel><item><title>[G] Show - 01 (1080p).mkv</title>
    <guid>https://nyaa.si/view/1</guid><pubDate>not a date</pubDate>
    <nyaa:infoHash>${'a'.repeat(40)}</nyaa:infoHash><nyaa:seeders>3</nyaa:seeders></item></channel></rss>`;
  const [t] = parseNyaaRss(xml);
  assert.equal(t.pubDate, null);
  assert.equal(t.seeders, 3);
});

test('parseProbeOutput reads total duration, null when missing or invalid', () => {
  const full = parseProbeOutput(JSON.stringify({ streams: [{ index: 0 }], format: { duration: '1440.023000' } }));
  assert.deepEqual(full, { streams: [{ index: 0 }], duration: 1440.023 });
  assert.equal(parseProbeOutput(JSON.stringify({ streams: [] })).duration, null);
  assert.equal(parseProbeOutput(JSON.stringify({ format: { duration: 'N/A' } })).duration, null);
  assert.deepEqual(parseProbeOutput('{}').streams, []);
});
