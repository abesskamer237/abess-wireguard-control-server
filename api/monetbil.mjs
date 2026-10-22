import { createHash, timingSafeEqual } from 'node:crypto';

function normalizedParams(params) {
  const entries = Object.entries(params)
    .filter(([key]) => key !== 'sign')
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  return entries.map(([key, value]) => [key, String(value ?? '')]);
}

// Monetbil's notification guide specifies MD5(service_secret + sorted parameter values),
// excluding the "sign" parameter. Keep this separate from the app's internal HMAC webhook.
export function monetbilSignature(params, serviceSecret) {
  const values = normalizedParams(params).map(([, value]) => value).join('');
  return createHash('md5').update(String(serviceSecret) + values, 'utf8').digest('hex');
}

export function verifyMonetbilNotification(params, serviceSecret) {
  if (!params || typeof params !== 'object' || typeof params.sign !== 'string' ||
      !/^[a-f0-9]{32}$/i.test(params.sign) ||
      typeof serviceSecret !== 'string' || serviceSecret.length < 1) return false;
  const expected = Buffer.from(monetbilSignature(params, serviceSecret), 'hex');
  const supplied = Buffer.from(params.sign, 'hex');
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export function validMonetbilAmount(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const raw = String(value).trim();
  if (!/^\d+(?:\.0+)?$/.test(raw)) return null;
  const amount = Number(raw);
  return Number.isSafeInteger(amount) ? amount : null;
}
