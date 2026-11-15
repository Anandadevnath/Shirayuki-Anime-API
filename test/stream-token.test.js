import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signStreamToken, verifyStreamToken, resolveStreamSecret } from '../src/nyaa/scraper/stream-token.js';

const hash = 'bc25231f657d115e61e68d0e124d3ff5ec101f69';
const secret = 'test-secret';

test('a signed token verifies for the same hash/sel', () => {
  const token = signStreamToken({ hash, sel: 'e5', ttlSec: 600, secret });
  assert.equal(verifyStreamToken({ token, hash, sel: 'e5', secret }), true);
});

test('rejects tampered hash, selection, secret or signature', () => {
  const token = signStreamToken({ hash, sel: 'auto', ttlSec: 600, secret });
  assert.equal(verifyStreamToken({ token, hash: 'a'.repeat(40), sel: 'auto', secret }), false);
  assert.equal(verifyStreamToken({ token, hash, sel: 'e1', secret }), false);
  assert.equal(verifyStreamToken({ token, hash, sel: 'auto', secret: 'other' }), false);
  const [exp, sig] = token.split('.');
  assert.equal(verifyStreamToken({ token: `${Number(exp) + 999}.${sig}`, hash, sel: 'auto', secret }), false);
  assert.equal(verifyStreamToken({ token: undefined, hash, sel: 'auto', secret }), false);
});

test('rejects expired tokens', () => {
  const now = Date.now();
  const token = signStreamToken({ hash, sel: 'auto', ttlSec: 60, secret, now: now - 3600_000 });
  assert.equal(verifyStreamToken({ token, hash, sel: 'auto', secret, now }), false);
});

test('refuses to sign invalid input', () => {
  assert.throws(() => signStreamToken({ hash: '../etc', sel: 'auto', ttlSec: 60, secret }));
  assert.throws(() => signStreamToken({ hash, sel: '../x', ttlSec: 60, secret }));
});

test('production requires STREAM_SECRET; dev falls back', () => {
  assert.throws(() => resolveStreamSecret('', 'production'), /STREAM_SECRET/);
  assert.ok(resolveStreamSecret('', 'development'));
  assert.equal(resolveStreamSecret('x', 'production'), 'x');
});
