import test from 'node:test';
import assert from 'node:assert/strict';
import { signPaymentEvent, verifyPaymentSignature } from '../payment-webhook.mjs';

test('verifies a signed canonical payment event', () => {
  const event = {subscriptionId:'sub_123abc',status:'paid',amountXaf:2500,currency:'XAF',paymentReference:'momo-123456'};
  const secret = 'test-only-secret-with-more-than-32-characters';
  const signature = signPaymentEvent(event, secret);
  assert.equal(verifyPaymentSignature(event, secret, signature), true);
  assert.equal(verifyPaymentSignature({...event,amountXaf:2501}, secret, signature), false);
  assert.equal(verifyPaymentSignature(event, secret, 'invalid'), false);
});

test('rejects short secrets and invalid signatures', () => {
  const event = {subscriptionId:'sub_123abc',status:'paid',amountXaf:2500,currency:'XAF',paymentReference:'momo-123456'};
  assert.equal(verifyPaymentSignature(event, 'short', 'a'.repeat(64)), false);
});
