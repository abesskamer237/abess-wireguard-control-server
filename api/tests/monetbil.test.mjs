import test from 'node:test';
import assert from 'node:assert/strict';
import { monetbilSignature, verifyMonetbilNotification, validMonetbilAmount } from '../monetbil.mjs';

test('Monetbil signature ignores key insertion order and sign field', () => {
  const secret = 'test-service-secret';
  const first = {status:'success', service:'svc', amount:'500', currency:'XAF'};
  const signature = monetbilSignature(first, secret);
  assert.equal(verifyMonetbilNotification({...first, sign:signature}, secret), true);
  assert.equal(verifyMonetbilNotification({currency:'XAF', amount:'500', service:'svc', status:'success', sign:signature}, secret), true);
});

test('Monetbil signature rejects tampering and malformed signatures', () => {
  const secret = 'test-service-secret';
  const params = {status:'success', service:'svc', amount:'500'};
  const signature = monetbilSignature(params, secret);
  assert.equal(verifyMonetbilNotification({...params, amount:'5', sign:signature}, secret), false);
  assert.equal(verifyMonetbilNotification({...params, sign:'not-a-signature'}, secret), false);
});

test('amount parser accepts integer XAF amounts and rejects decimals/non-numbers', () => {
  assert.equal(validMonetbilAmount('2500'), 2500);
  assert.equal(validMonetbilAmount('2500.00'), 2500);
  assert.equal(validMonetbilAmount('2500.50'), null);
  assert.equal(validMonetbilAmount('NaN'), null);
  assert.equal(validMonetbilAmount(-1), null);
});
