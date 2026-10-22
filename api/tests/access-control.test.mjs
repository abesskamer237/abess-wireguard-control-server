import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSubscriptionInput, isSubscriptionUsable, countSubscriptionPeers } from '../access-control.mjs';

test('validates subscription commercial limits', () => {
  const result = validateSubscriptionInput({customerId:'client-01',plan:'Mensuel',amountXaf:2500,currency:'XAF',durationDays:30,maxDevices:2});
  assert.equal(result.ok,true);
  assert.equal(result.value.maxDevices,2);
});

test('rejects invalid amount, duration, device count and currency', () => {
  for (const input of [
    {customerId:'abc',plan:'Plan',amountXaf:-1,currency:'XAF',durationDays:30,maxDevices:2},
    {customerId:'abc',plan:'Plan',amountXaf:100,currency:'XAF',durationDays:0,maxDevices:2},
    {customerId:'abc',plan:'Plan',amountXaf:100,currency:'XAF',durationDays:30,maxDevices:11},
    {customerId:'abc',plan:'Plan',amountXaf:100,currency:'USD',durationDays:30,maxDevices:2}
  ]) assert.equal(validateSubscriptionInput(input).ok,false);
});

test('subscription is usable only when active and unexpired', () => {
  const now = Date.parse('2026-10-22T12:00:00Z');
  assert.equal(isSubscriptionUsable({status:'active',expiresAt:'2026-10-23T12:00:00Z'},now),true);
  assert.equal(isSubscriptionUsable({status:'pending_payment',expiresAt:'2026-10-23T12:00:00Z'},now),false);
  assert.equal(isSubscriptionUsable({status:'active',expiresAt:'2026-10-21T12:00:00Z'},now),false);
});

test('counts peers belonging to one subscription', () => {
  assert.equal(countSubscriptionPeers([{subscriptionId:'s1'},{subscriptionId:'s2'},{subscriptionId:'s1'}],'s1'),2);
});
