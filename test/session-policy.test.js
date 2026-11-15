import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findAbandoned } from '../stream-worker/session-policy.js';

const NOW = 1_000_000;
const s = (name, idleMs, state = 'running') => ({ name, lastAccess: NOW - idleMs, hls: state ? { state } : null });

test('closes a quiet unfinished session once another session is newer', () => {
  const result = findAbandoned([s('old', 40_000), s('current', 2_000)], NOW, 30_000);
  assert.deepEqual(result.map((x) => x.name), ['old']);
});

test('keeps a lone session even when it is quiet', () => {
  assert.deepEqual(findAbandoned([s('only', 300_000)], NOW, 30_000), []);
});

test('keeps finished transcodes and recently used sessions', () => {
  const result = findAbandoned(
    [s('done', 300_000, 'complete'), s('recent', 10_000), s('current', 1_000)],
    NOW,
    30_000,
  );
  assert.deepEqual(result, []);
});

test('closes a session still fetching metadata (no hls yet) when abandoned', () => {
  const result = findAbandoned([s('cold', 60_000, null), s('current', 0)], NOW, 30_000);
  assert.deepEqual(result.map((x) => x.name), ['cold']);
});

test('never closes the newest session even if every session is quiet', () => {
  const result = findAbandoned([s('a', 120_000), s('b', 90_000)], NOW, 30_000);
  assert.deepEqual(result.map((x) => x.name), ['a']);
});

test('keeps a starting session while a viewer waits on its playlist', () => {
  const starting = { ...s('starting', 60_000, null), waiters: 1 };
  assert.deepEqual(findAbandoned([starting, s('other-tab', 0)], NOW, 30_000), []);
});
