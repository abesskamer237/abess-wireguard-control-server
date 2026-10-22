import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

export function hashEnrollmentToken(token) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function equalHexHash(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' ||
      !/^[a-f0-9]{64}$/.test(a) || !/^[a-f0-9]{64}$/.test(b)) return false;
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createEnrollmentSecret() {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashEnrollmentToken(token) };
}
