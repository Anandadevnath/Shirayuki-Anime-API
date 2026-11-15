import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rewritePlaylist, isWorkerStreamUrl, NYAA_PROXY_PATH } from '../src/nyaa/scraper/proxy.js';

const WORKER = 'https://w.example.com';
const PLAYLIST = `${WORKER}/stream/${'a'.repeat(40)}/auto/index.m3u8?t=1.x`;

test('rewritePlaylist routes segment lines through the proxy and keeps tags', () => {
  const out = rewritePlaylist('#EXTM3U\n#EXTINF:4,\nseg_00000.ts?t=1.x\n', PLAYLIST, 'http://api');
  const lines = out.split('\n');
  assert.equal(lines[0], '#EXTM3U');
  assert.equal(lines[1], '#EXTINF:4,');
  const seg = new URL(lines[2]);
  assert.equal(seg.pathname, NYAA_PROXY_PATH);
  assert.equal(seg.searchParams.get('url'), `${WORKER}/stream/${'a'.repeat(40)}/auto/seg_00000.ts?t=1.x`);
});

test('isWorkerStreamUrl only accepts the worker origin and /stream/ paths', () => {
  assert.equal(isWorkerStreamUrl(PLAYLIST, WORKER), true);
  assert.equal(isWorkerStreamUrl(`${WORKER}/raw/abc/auto`, WORKER), false);
  assert.equal(isWorkerStreamUrl(`${WORKER}/stream/../raw/x`, WORKER), false);
  assert.equal(isWorkerStreamUrl('https://evil.com/stream/x', WORKER), false);
  assert.equal(isWorkerStreamUrl('not a url', WORKER), false);
});
