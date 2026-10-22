import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

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
  try { return JSON.parse(await fs.readFile(await statePath(), 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return {peers:[]}; throw e; }
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
async function createPeer(name) {
  if (!ENDPOINT || ENDPOINT.includes('SERVER_PUBLIC_IP_OR_DNS')) throw new Error('Set SERVER_ENDPOINT in /etc/abess-wireguard-api.env');
  const state = await readState();
  if (state.peers.some(p => p.name === name)) throw Object.assign(new Error('peer name already exists'), {status:409});
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
  state.peers.push({name, ip, publicKey, presharedKey, createdAt:new Date().toISOString()});
  await writeState(state);
  return {name, config:'[Interface]\nPrivateKey = ' + privateKey + '\nAddress = ' + ip + '/32\nDNS = ' + DNS + '\n\n[Peer]\nPublicKey = ' + await serverPublicKey() + '\nPresharedKey = ' + presharedKey + '\nEndpoint = ' + ENDPOINT + '\nAllowedIPs = ' + ALLOWED_IPS + '\nPersistentKeepalive = 25\n', note:'Save this config securely; the server does not store the client private key.'};
}
async function deletePeer(name) {
  const state = await readState();
  if (!state.peers.some(p => p.name === name)) throw Object.assign(new Error('peer not found'), {status:404});
  const current = await fs.readFile(WG_CONF, 'utf8');
  const lines = current.split('\n'), out = [];
  let skipping = false;
  for (const line of lines) {
    if (line.trim() === '# managed-by-abess-api:' + name) { skipping = true; continue; }
    if (skipping && line.trim().startsWith('# managed-by-abess-api:')) skipping = false;
    if (skipping && line.trim() === '[Interface]') skipping = false;
    if (!skipping) out.push(line);
  }
  await fs.writeFile(WG_CONF, out.join('\n').replace(/\n{3,}/g, '\n\n'), {mode:0o600});
  try { await syncLiveConfig(); }
  catch (e) { await fs.writeFile(WG_CONF, current, {mode:0o600}); throw new Error('Peer removal failed; config restored: ' + e.message); }
  state.peers = state.peers.filter(p => p.name !== name);
  await writeState(state);
  return {deleted:name};
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  try {
    if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, {ok:true, service:'abess-wireguard-control-api'});
    if (!isAdmin(req)) return json(res, 401, {error:'unauthorized'});
    if (req.method === 'POST' && url.pathname === '/v1/peers') {
      const body = await readBody(req);
      if (!safeName(body.name)) return json(res, 400, {error:'name must match [a-zA-Z0-9][a-zA-Z0-9_-]{0,30}'});
      const task = queue.then(() => createPeer(body.name)); queue = task.catch(() => {});
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
