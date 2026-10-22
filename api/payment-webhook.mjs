import { createHmac, timingSafeEqual } from 'node:crypto';

export function paymentSignaturePayload(event) {
  return [
    String(event.subscriptionId ?? ''),
    String(event.status ?? '').toLowerCase(),
    String(event.amountXaf ?? ''),
    String(event.currency ?? '').toUpperCase(),
    String(event.paymentReference ?? '')
  ].join('.');
}

export function signPaymentEvent(event, secret) {
  return createHmac('sha256', secret).update(paymentSignaturePayload(event), 'utf8').digest('hex');
}

export function verifyPaymentSignature(event, secret, suppliedSignature) {
  if (typeof secret !== 'string' || secret.length < 32 ||
      typeof suppliedSignature !== 'string' || !/^[a-f0-9]{64}$/i.test(suppliedSignature)) return false;
  const expected = Buffer.from(signPaymentEvent(event, secret), 'hex');
  const supplied = Buffer.from(suppliedSignature, 'hex');
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}
