import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnrollmentSecret, hashEnrollmentToken, equalHexHash, isEnrollmentTokenUsable } from '../enrollment-token.mjs';

test('creates a high-entropy URL-safe enrollment code and stores only a hash', () => {
  const secret = createEnrollmentSecret();
  assert.match(secret.token, /^[A-Za-z0-9_-]{43}$/);
  assert.match(secret.tokenHash, /^[a-f0-9]{64}$/);
  assert.equal(secret.tokenHash, hashEnrollmentToken(secret.token));
  assert.notEqual(secret.token, secret.tokenHash);
});

test('compares valid hashes and rejects malformed or different hashes', () => {
  const first = hashEnrollmentToken('random-token-one');
  const same = hashEnrollmentToken('random-token-one');
  const other = hashEnrollmentToken('random-token-two');
  assert.equal(equalHexHash(first, same), true);
  assert.equal(equalHexHash(first, other), false);
  assert.equal(equalHexHash(first, 'not-a-hash'), false);
});

test('rejects expired, used, and malformed enrollment records', () => {
  const now = Date.parse('2026-10-22T12:00:00.000Z');
  assert.equal(isEnrollmentTokenUsable({expiresAt: '2026-10-22T12:01:00.000Z', usedAt: null}, now), true);
  assert.equal(isEnrollmentTokenUsable({expiresAt: '2026-10-22T11:59:00.000Z', usedAt: null}, now), false);
  assert.equal(isEnrollmentTokenUsable({expiresAt: '2026-10-22T12:01:00.000Z', usedAt: '2026-10-22T11:00:00.000Z'}, now), false);
  assert.equal(isEnrollmentTokenUsable({expiresAt: 'not-a-date', usedAt: null}, now), false);
});
