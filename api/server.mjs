import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createEnrollmentSecret, hashEnrollmentToken, equalHexHash, isEnrollmentTokenUsable } from './enrollment-token.mjs';
import { removeManagedPeerBlock } from './peer-config.mjs';
import { validateSubscriptionInput, isSubscriptionUsable, countSubscriptionPeers } from './access-control.mjs';

const execFileAsync = promisify(execFile);
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const WG_CONF = process.env.WG_CONF || '/etc/wireguard/wg0.conf';
const STATE_DIR = process.env.STATE_DIR || '/var/lib/abess-wireguard-api';
const ENDPOINT = process.env.SERVER_ENDPOINT || '';
const DNS = process.env.CLIENT_DNS || '1.1.1.1';
const ALLOWED_IPS = process.env.CLIENT_ALLOWED_IPS || '0.0.0.0/0';
const SERVER_PUB = process.env.SERVER_PUBLIC_KEY || '/etc/wireguard/server_public.key';
let queue = Promise.resolve();

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {'content-type':'application/json; charset=utf-8','content-length':Buffer.byteLength(body),'cache-control':'no-store'});
  res.end(body);
}
function safeName(s) { return typeof s === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,30}$/.test(s); }
async function readBody(req) {
  let data = '';
  for await (const chunk of req) { data += chunk; if (data.length > 8192) throw new Error('request body too large'); }
  return data ? JSON.parse(data) : {};
}
async function statePath() { await fs.mkdir(STATE_DIR, {recursive:true, mode:0o700}); return path.join(STATE_DIR, 'peers.json'); }
async function readState() {
  try {
    const parsed = JSON.parse(await fs.readFile(await statePath(), 'utf8'));
    return {
      peers: Array.isArray(parsed.peers) ? parsed.peers : [],
      enrollmentTokens: Array.isArray(parsed.enrollmentTokens) ? parsed.enrollmentTokens : [],
      subscriptions: Array.isArray(parsed.subscriptions) ? parsed.subscriptions : []
    };
  } catch (e) {
    if (e.code === 'ENOENT') return {peers:[], enrollmentTokens:[], subscriptions:[]};
    throw e;
  }
}
async function writeState(s) { await fs.writeFile(await statePath(), JSON.stringify(s, null, 2), {mode:0o600}); }
function isAdmin(req) { return ADMIN_TOKEN.length >= 32 && (req.headers.authorization || '') === 'Bearer ' + ADMIN_TOKEN; }
async function runWithInput(file, args, input) {
  return await new Promise((resolve, reject) => {
    const child = execFile(file, args, (error, stdout, stderr) => error ? reject(Object.assign(error, {stderr})) : resolve({stdout, stderr}));
    child.stdin.end(input);
  });
}
async function serverPublicKey() {
  if (process.env.SERVER_PUBLIC_KEY && !process.env.SERVER_PUBLIC_KEY.startsWith('/')) return process.env.SERVER_PUBLIC_KEY;
  return (await fs.readFile(SERVER_PUB, 'utf8')).trim();
}
async function syncLiveConfig() {
  const {stdout} = await execFileAsync('wg-quick', ['strip', 'wg0']);
  const tmp = path.join(STATE_DIR, 'wg0-' + process.pid + '.conf');
  await fs.writeFile(tmp, stdout, {mode:0o600});
  try { await execFileAsync('wg', ['syncconf', 'wg0', tmp]); } finally { await fs.rm(tmp, {force:true}); }
}
async function createSubscription(input) {
  const checked = validateSubscriptionInput(input);
  if (!checked.ok) throw Object.assign(new Error(checked.error), {status:400});
  const state = await readState();
  const subscription = {
    id: 'sub_' + randomBytes(12).toString('hex'),
    customerId: checked.value.customerId,
    plan: checked.value.plan,
    amountXaf: checked.value.amountXaf,
    currency: checked.value.currency,
    durationDays: checked.value.durationDays,
    maxDevices: checked.value.maxDevices,
    status: 'pending_payment',
    createdAt: new Date().toISOString(),
    paidAt: null,
    expiresAt: null,
    paymentReference: null
  };
  state.subscriptions.push(subscription);
  await writeState(state);
  return subscription;
}
async function confirmSubscriptionPayment(id, paymentReference) {
  if (typeof paymentReference !== 'string' || paymentReference.trim().length < 4 || paymentReference.trim().length > 160)
    throw Object.assign(new Error('paymentReference must contain 4–160 characters'), {status:400});
  const state = await readState();
  const subscription = state.subscriptions.find(item => item.id === id);
  if (!subscription) throw Object.assign(new Error('subscription not found'), {status:404});
  if (state.subscriptions.some(item => item.id !== id && item.paymentReference === paymentReference.trim()))
    throw Object.assign(new Error('payment reference already used'), {status:409});
  if (subscription.status === 'active' && subscription.paymentReference === paymentReference.trim()) {
    return {subscription, alreadyConfirmed:true};
  }
  if (subscription.status !== 'pending_payment')
    throw Object.assign(new Error('subscription is not awaiting payment'), {status:409});
  const now = new Date();
  subscription.status = 'active';
  subscription.paidAt = now.toISOString();
  subscription.paymentReference = paymentReference.trim();
  subscription.expiresAt = new Date(now.getTime() + subscription.durationDays * 24 * 60 * 60 * 1000).toISOString();
  await writeState(state);
  return {subscription, alreadyConfirmed:false};
}
async function createEnrollmentToken(name, ttlSeconds = 300, subscriptionId) {
  if (!safeName(name)) throw Object.assign(new Error('invalid device name'), {status:400});
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 3600)
    throw Object.assign(new Error('ttlSeconds must be an integer from 60 to 3600'), {status:400});
  if (typeof subscriptionId !== 'string' || !subscriptionId.trim())
    throw Object.assign(new Error('subscriptionId is required'), {status:400});
  const state = await readState();
  const subscription = state.subscriptions.find(item => item.id === subscriptionId);
  if (!isSubscriptionUsable(subscription))
    throw Object.assign(new Error('subscription is not active or has expired'), {status:403});
  if (state.peers.some(p => p.name === name) ||
      state.enrollmentTokens.some(t => t.name === name && !t.usedAt && Date.parse(t.expiresAt) > Date.now()))
    throw Object.assign(new Error('peer or pending enrollment already exists for this name'), {status:409});
  if (countSubscriptionPeers(state.peers, subscriptionId) >= subscription.maxDevices)
    throw Object.assign(new Error('device limit reached for this subscription'), {status:409});
  const {token, tokenHash} = createEnrollmentSecret();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + ttlSeconds * 1000);
  state.enrollmentTokens.push({
    name,
    subscriptionId,
    tokenHash,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    usedAt: null
  });
  await writeState(state);
  return {name, subscriptionId, token, expiresAt: expiresAt.toISOString(), oneTime: true};
}
async function enrollWithToken(token) {
  if (typeof token !== 'string' || token.length < 32 || token.length > 256)
    throw Object.assign(new Error('invalid enrollment token'), {status:401});
  const state = await readState();
  const candidate = hashEnrollmentToken(token);
  const record = state.enrollmentTokens.find(t => equalHexHash(t.tokenHash, candidate));
  if (!record || !isEnrollmentTokenUsable(record))
    throw Object.assign(new Error('invalid, expired, or already used enrollment token'), {status:401});
  // Burn the token before creating a peer so concurrent/replayed requests cannot reuse it.
  record.usedAt = new Date().toISOString();
  await writeState(state);
  return createPeer(record.name, record.subscriptionId);
}
async function createPeer(name, subscriptionId = null) {
  if (!ENDPOINT || ENDPOINT.includes('SERVER_PUBLIC_IP_OR_DNS')) throw new Error('Set SERVER_ENDPOINT in /etc/abess-wireguard-api.env');
  const state = await readState();
  if (state.peers.some(p => p.name === name)) throw Object.assign(new Error('peer name already exists'), {status:409});
  let subscription = null;
  if (subscriptionId) {
    subscription = state.subscriptions.find(item => item.id === subscriptionId);
    if (!isSubscriptionUsable(subscription))
      throw Object.assign(new Error('subscription is not active or has expired'), {status:403});
    if (countSubscriptionPeers(state.peers, subscriptionId) >= subscription.maxDevices)
      throw Object.assign(new Error('device limit reached for this subscription'), {status:409});
  }
  const used = new Set(state.peers.map(p => p.ip));
  let host = 2; while (host < 255 && used.has('10.77.0.' + host)) host++;
  if (host >= 255) throw new Error('peer address pool exhausted');
  const ip = '10.77.0.' + host;
  const {stdout:privOut} = await execFileAsync('wg', ['genkey']);
  const privateKey = privOut.trim();
  const {stdout:pubOut} = await runWithInput('wg', ['pubkey'], privateKey + '\n');
  const publicKey = pubOut.trim();
  const {stdout:pskOut} = await execFileAsync('wg', ['genpsk']);
  const presharedKey = pskOut.trim();
  const block = '\n# managed-by-abess-api:' + name + '\n[Peer]\nPublicKey = ' + publicKey + '\nPresharedKey = ' + presharedKey + '\nAllowedIPs = ' + ip + '/32\n';
  const current = await fs.readFile(WG_CONF, 'utf8');
  await fs.writeFile(WG_CONF, current.trimEnd() + '\n' + block, {mode:0o600});
  try { await syncLiveConfig(); }
  catch (e) { await fs.writeFile(WG_CONF, current, {mode:0o600}); throw new Error('Peer activation failed; config rolled back: ' + e.message); }
  state.peers.push({name, ip, publicKey, presharedKey, subscriptionId: subscriptionId || undefined, createdAt:new Date().toISOString()});
  await writeState(state);
  return {name, subscription: subscription ? {id:subscription.id, plan:subscription.plan, expiresAt:subscription.expiresAt, maxDevices:subscription.maxDevices} : undefined, config:'[Interface]\nPrivateKey = ' + privateKey + '\nAddress = ' + ip + '/32\nDNS = ' + DNS + '\n\n[Peer]\nPublicKey = ' + await serverPublicKey() + '\nPresharedKey = ' + presharedKey + '\nEndpoint = ' + ENDPOINT + '\nAllowedIPs = ' + ALLOWED_IPS + '\nPersistentKeepalive = 25\n', note:'Save this config securely; the server does not store the client private key.'};
}
async function deletePeer(name) {
  const state = await readState();
  if (!state.peers.some(p => p.name === name)) throw Object.assign(new Error('peer not found'), {status:404});
  const current = await fs.readFile(WG_CONF, 'utf8');
  const result = removeManagedPeerBlock(current, name);
  if (!result.removed) throw new Error('Managed peer block not found in WireGuard config; refusing to alter state');
  await fs.writeFile(WG_CONF, result.config, {mode:0o600});
  try { await syncLiveConfig(); }
  catch (e) {
    await fs.writeFile(WG_CONF, current, {mode:0o600});
    try { await syncLiveConfig(); } catch {}
    throw new Error('Peer removal failed; config restored: ' + e.message);
  }
  state.peers = state.peers.filter(p => p.name !== name);
  await writeState(state);
  return {deleted:name};
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  try {
    if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, {ok:true, service:'abess-wireguard-control-api'});
    if (req.method === 'POST' && url.pathname === '/v1/enroll') {
      const body = await readBody(req);
      const task = queue.then(() => enrollWithToken(body.token));
      queue = task.catch(() => {});
      return json(res, 201, await task);
    }
    if (!isAdmin(req)) return json(res, 401, {error:'unauthorized'});
    if (req.method === 'POST' && url.pathname === '/v1/subscriptions') {
      const body = await readBody(req);
      const task = queue.then(() => createSubscription(body));
      queue = task.catch(() => {});
      return json(res, 201, await task);
    }
    if (req.method === 'GET' && url.pathname === '/v1/subscriptions') {
      const state = await readState();
      return json(res, 200, state.subscriptions.map(({paymentReference, ...item}) => ({...item, paymentReference: paymentReference ? '••••' + paymentReference.slice(-4) : null})));
    }
    const confirmMatch = url.pathname.match(/^\\/v1\\/subscriptions\\/([a-f0-9]+)\\/confirm-payment$/);
    if (req.method === 'POST' && confirmMatch) {
      const body = await readBody(req);
      const task = queue.then(() => confirmSubscriptionPayment('sub_' + confirmMatch[1], body.paymentReference));
      queue = task.catch(() => {});
      return json(res, 200, await task);
    }
    if (req.method === 'POST' && url.pathname === '/v1/enrollment-tokens') {
      const body = await readBody(req);
      if (!safeName(body.name)) return json(res, 400, {error:'name must match [a-zA-Z0-9][a-zA-Z0-9_-]{0,30}'});
      const ttl = body.ttlSeconds === undefined ? 300 : body.ttlSeconds;
      const task = queue.then(() => createEnrollmentToken(body.name, ttl, body.subscriptionId));
      queue = task.catch(() => {});
      return json(res, 201, await task);
    }
    if (req.method === 'POST' && url.pathname === '/v1/peers') {
      const body = await readBody(req);
      if (!safeName(body.name)) return json(res, 400, {error:'name must match [a-zA-Z0-9][a-zA-Z0-9_-]{0,30}'});
      const task = queue.then(() => createPeer(body.name, body.subscriptionId || null)); queue = task.catch(() => {});
      return json(res, 201, await task);
    }
    const match = url.pathname.match(/^\/v1\/peers\/([a-zA-Z0-9][a-zA-Z0-9_-]{0,30})$/);
    if (req.method === 'DELETE' && match) {
      const task = queue.then(() => deletePeer(match[1])); queue = task.catch(() => {});
      return json(res, 200, await task);
    }
    return json(res, 404, {error:'not found'});
  } catch (e) {
    return json(res, e.status || 500, {error:e.status ? e.message : 'internal error', ...(process.env.NODE_ENV === 'development' ? {detail:e.message} : {})});
  }
});
server.listen(PORT, HOST, () => console.log('ABESS WireGuard API listening on http://' + HOST + ':' + PORT));
