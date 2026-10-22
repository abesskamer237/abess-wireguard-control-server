export function validateSubscriptionInput(input) {
  if (!input || typeof input !== 'object') return {ok:false, error:'subscription body is required'};
  const customerId = typeof input.customerId === 'string' ? input.customerId.trim() : '';
  const plan = typeof input.plan === 'string' ? input.plan.trim() : '';
  const amountXaf = input.amountXaf;
  const durationDays = input.durationDays;
  const maxDevices = input.maxDevices;
  if (customerId.length < 3 || customerId.length > 128) return {ok:false, error:'customerId must contain 3–128 characters'};
  if (plan.length < 2 || plan.length > 80) return {ok:false, error:'plan must contain 2–80 characters'};
  if (!Number.isSafeInteger(amountXaf) || amountXaf < 0 || amountXaf > 100000000) return {ok:false, error:'amountXaf must be an integer from 0 to 100000000'};
  if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3650) return {ok:false, error:'durationDays must be an integer from 1 to 3650'};
  if (!Number.isInteger(maxDevices) || maxDevices < 1 || maxDevices > 10) return {ok:false, error:'maxDevices must be an integer from 1 to 10'};
  const currency = typeof input.currency === 'string' ? input.currency.trim().toUpperCase() : 'XAF';
  if (currency !== 'XAF') return {ok:false, error:'only XAF is supported by this deployment'};
  return {ok:true, value:{customerId, plan, amountXaf, currency, durationDays, maxDevices}};
}

export function isSubscriptionUsable(subscription, now = Date.now()) {
  if (!subscription || subscription.status !== 'active') return false;
  const expiry = Date.parse(subscription.expiresAt);
  return Number.isFinite(expiry) && expiry > now;
}

export function countSubscriptionPeers(peers, subscriptionId) {
  return peers.filter(peer => peer.subscriptionId === subscriptionId).length;
}
