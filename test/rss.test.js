import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseNyaaRss } from '../src/nyaa/scraper/rss.js';

const xml = readFileSync(new URL('./fixtures/nyaa-rss.xml', import.meta.url), 'utf8');

test('parses every item of a real Nyaa RSS feed', () => {
  const torrents = parseNyaaRss(xml, 'https://nyaa.si');
  assert.ok(torrents.length > 50);
  const t = torrents[0];
  assert.match(t.infoHash, /^[a-f0-9]{40}$/);
  assert.match(t.magnet, /^magnet:\?xt=urn:btih:[a-f0-9]{40}&dn=/);
  assert.match(t.viewUrl, /^https:\/\/nyaa\.si\/view\/\d+$/);
  assert.match(t.torrentUrl, /\/download\/\d+\.torrent$/);
  assert.equal(typeof t.seeders, 'number');
  assert.equal(typeof t.trusted, 'boolean');
  assert.ok(t.sizeBytes > 0);
  assert.ok(t.release.group);
});

test('skips items without a valid info hash and tolerates garbage', () => {
  const bad = '<rss><channel><item><title>x</title><nyaa:infoHash>nothex</nyaa:infoHash></item></channel></rss>';
  assert.deepEqual(parseNyaaRss(bad), []);
  assert.deepEqual(parseNyaaRss(''), []);
});
