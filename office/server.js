#!/usr/bin/env node
/**
 * Qwentir Virtual Office — local bridge server.
 * Zero-dependency Node HTTP server that:
 *   1. serves the 8-bit office UI from office/public
 *   2. proxies the local QoderWake daemon through the `qoderwake` CLI
 *      (waker list / session create / send / events / detail / stop / waker create)
 * Sessions are created with --cwd <repo root> so every Waker works inside
 * this Qwentir repository and can read data/, agents/ and output/ directly.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(__dirname, 'public');
const ROLES = JSON.parse(fs.readFileSync(path.join(__dirname, 'roles.json'), 'utf8')).roles;
const PORT = Number(process.env.PORT || 8787);
const QW_BIN = process.env.QODERWAKE_BIN || 'qoderwake';

/* ---------------- qoderwake CLI wrapper ---------------- */

function qw(args, timeoutMs = 90000) {
  return new Promise((resolve) => {
    let out = '';
    let err = '';
    // no shell: qoderwake is a real executable, and shell mode would
    // break arguments that contain spaces (task messages, titles)
    const child = spawn(QW_BIN, args);
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch (_) { /* noop */ }
    }, timeoutMs);
    child.stdout.on('data', (c) => { out += c; });
    child.stderr.on('data', (c) => { err += c; });
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ ok: false, error: `qoderwake CLI tidak ditemukan: ${e.message}` });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const text = out.trim();
      try {
        const parsed = JSON.parse(text);
        // daemon envelopes: { success, data } or bare { data } — unwrap so
        // routes always see the payload itself
        const isEnvelope = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          && ('data' in parsed)
          && (parsed.success === undefined || typeof parsed.success === 'boolean');
        resolve({ ok: code === 0, data: isEnvelope ? parsed.data : parsed, stderr: err.trim() });
      } catch (_) {
        resolve({ ok: code === 0, data: text, raw: true, stderr: err.trim() });
      }
    });
  });
}

/* CLI qoderwake bisa memakan beberapa detik; cache TTL + single-flight biar
   polling UI yang beruntun tidak menumpuk proses spawn. */
const cliCache = new Map();
function qwCached(key, args, timeoutMs, ttlMs) {
  const hit = cliCache.get(key);
  if (hit) {
    if (hit.promise) return hit.promise;
    if (Date.now() - hit.at < ttlMs) return Promise.resolve(hit.val);
  }
  const promise = qw(args, timeoutMs).then((val) => {
    cliCache.set(key, { at: Date.now(), val });
    return val;
  });
  cliCache.set(key, { promise });
  return promise;
}

function pick(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

function normalizeSession(d) {
  const s = d && d.session ? d.session : d || {};
  return {
    sessionId: pick(s, ['sessionId', 'id', 'session_id']),
    wakerId: pick(s, ['wakerId', 'agentId', 'waker_id']),
    title: pick(s, ['title', 'name']) || '',
    status: pick(s, ['status', 'state']) || 'unknown',
  };
}

/* ---------------- role mapping ---------------- */

function matchRole(waker) {
  const hay = `${waker.name} ${waker.description || ''}`.toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const role of ROLES) {
    const score = (role.matchKeywords || []).filter((k) => hay.includes(k)).length;
    if (score > bestScore) { bestScore = score; best = role; }
  }
  return bestScore > 0 ? best : null;
}

/* ---------------- HTTP helpers ---------------- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendJson(res, code, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 1e6) req.destroy(); });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function serveStatic(res, urlPath) {
  const rel = urlPath === '/' ? '/index.html' : urlPath;
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(buf);
  });
}

/* ---------------- API routes ---------------- */

const routes = [];
function route(method, pattern, handler) { routes.push({ method, pattern, handler }); }

route('GET', /^\/api\/status$/, async () => {
  const r = await qwCached('status', ['status'], 15000, 3000);
  const d = r.data || {};
  return {
    ok: r.ok,
    daemon: r.ok ? 'online' : 'offline',
    device: d.device ? d.device.status : 'unknown',
    sessionsTotal: d.sessions ? d.sessions.total : 0,
    sessionsRunning: d.sessions ? d.sessions.running : 0,
    agents: d.agents || 0,
    repo: ROOT,
    error: r.ok ? undefined : r.error || r.stderr,
  };
});

route('GET', /^\/api\/roles$/, async () => ({ roles: ROLES }));

route('GET', /^\/api\/wakers$/, async () => {
  const r = await qwCached('wakers', ['waker', 'list', '--json'], 20000, 5000);
  if (!r.ok || !Array.isArray(r.data)) {
    return { ok: false, error: r.error || r.stderr || 'waker list gagal', wakers: [] };
  }
  const wakers = r.data.map((w) => {
    const role = matchRole(w);
    return {
      agentId: w.agentId,
      employeeId: w.employeeId,
      name: w.name,
      description: w.description || '',
      online: w.machine ? w.machine.online_status === 'online' : false,
      roleId: role ? role.id : null,
      roleTitle: role ? role.title : null,
    };
  });
  return { ok: true, wakers };
});

route('POST', /^\/api\/hire$/, async (ctx) => {
  const body = await readBody(ctx.req);
  let name;
  let description;
  const role = ROLES.find((x) => x.id === body.roleId);
  if (role && role.hire) {
    name = role.hire.name;
    description = role.hire.description;
  } else {
    // hire bebas: "hire another agent" dari footer roster
    name = String(body.name || '').trim().slice(0, 60);
    description = String(body.description || '').trim().slice(0, 300);
    if (!name || !description) return { ok: false, error: 'name & description wajib diisi' };
  }
  const r = await qw([
    'waker', 'create',
    '--name', name,
    '--description', description,
    '--json',
  ], 60000);
  const created = normalizeWakerId(r.data);
  return { ok: r.ok, wakerId: created, error: r.ok ? undefined : (r.error || r.stderr) };
});

function normalizeWakerId(d) {
  if (!d) return undefined;
  const s = typeof d === 'object' ? d : {};
  return pick(s, ['agentId', 'id', 'wakerId', 'employeeId']);
}

route('POST', /^\/api\/upload$/, async (ctx) => {
  const body = await readBody(ctx.req);
  const rawName = String(body.name || 'file.bin');
  const safe = rawName.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-60) || 'file.bin';
  const data = String(body.dataBase64 || '');
  if (!data) return { ok: false, error: 'dataBase64 kosong' };
  if (data.length > 28 * 1024 * 1024) return { ok: false, error: 'file terlalu besar (maks ~20MB)' };
  const inbox = path.join(ROOT, 'inbox');
  fs.mkdirSync(inbox, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fname = `${stamp}_${safe}`;
  const target = path.join(inbox, fname);
  try {
    fs.writeFileSync(target, Buffer.from(data, 'base64'));
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
  return { ok: true, path: `inbox/${fname}` };
});

route('POST', /^\/api\/sessions$/, async (ctx) => {
  const body = await readBody(ctx.req);
  if (!body.wakerId || !body.message) return { ok: false, error: 'wakerId & message wajib' };
  // persona role (agents/*-bible/identity/persona.md) dibacakan otomatis sekali
  // saat session pertama supaya Waker bekerja sesuai bible & identity-nya
  let message = String(body.message);
  const persona = Array.isArray(body.persona) ? body.persona.map(String).filter(Boolean) : [];
  if (persona.length) {
    message = `Kamu adalah ${String(body.roleTitle || 'agen Qwentir')} di Qwentir Virtual Office. `
      + `Sebelum mengerjakan tugas, baca dulu file persona kamu di repo ini: ${persona.join(', ')}. `
      + `Patuhi isi file-file tersebut selama bekerja.\n\nTugas dari kantor:\n${message}`;
  }
  const r = await qw([
    'session', 'create',
    '--waker-id', String(body.wakerId),
    '--title', String(body.title || 'Virtual Office task'),
    '--message', message,
    '--cwd', ROOT,
    '--json',
  ], 120000);
  if (!r.ok) return { ok: false, error: r.error || r.stderr || 'session create gagal' };
  return { ok: true, session: normalizeSession(r.data) };
});

route('POST', /^\/api\/sessions\/([^/]+)\/send$/, async (ctx) => {
  const body = await readBody(ctx.req);
  if (!body.message) return { ok: false, error: 'message wajib' };
  const r = await qw([
    'session', 'send',
    '--session-id', ctx.params[0],
    '--message', String(body.message),
    '--json',
  ], 120000);
  return { ok: r.ok, error: r.ok ? undefined : (r.error || r.stderr) };
});

route('GET', /^\/api\/sessions\/([^/]+)\/events$/, async (ctx, query) => {
  const after = Number(query.get('after') || 0);
  const r = await qw([
    'session', 'events',
    '--session-id', ctx.params[0],
    '--after-sequence-num', String(after),
    '--limit', '200',
    '--json',
  ], 30000);
  if (!r.ok) return { ok: false, error: r.error || r.stderr, events: [] };
  const list = Array.isArray(r.data) ? r.data : (r.data && r.data.events) || [];
  return { ok: true, events: list };
});

route('GET', /^\/api\/sessions\/([^/]+)\/detail$/, async (ctx) => {
  const r = await qw(['session', 'detail', '--session-id', ctx.params[0], '--json'], 10000);
  if (!r.ok) return { ok: false, error: r.error || r.stderr };
  return { ok: true, session: normalizeSession(r.data), raw: r.data };
});

route('POST', /^\/api\/sessions\/([^/]+)\/stop$/, async (ctx) => {
  const r = await qw(['session', 'stop', '--session-id', ctx.params[0], '--json'], 30000);
  return { ok: r.ok, error: r.ok ? undefined : (r.error || r.stderr) };
});

/* ---------------- server ---------------- */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);

  if (!pathname.startsWith('/api/')) return serveStatic(res, pathname);

  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = pathname.match(r.pattern);
    if (!m) continue;
    try {
      const payload = await r.handler({ req, params: m.slice(1) }, url.searchParams);
      return sendJson(res, 200, payload);
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: String(e && e.message || e) });
    }
  }
  return sendJson(res, 404, { ok: false, error: 'route tidak ditemukan' });
});

server.listen(PORT, () => {
  console.log(`[virtual-office] http://localhost:${PORT}`);
  console.log(`[virtual-office] repo cwd untuk semua session: ${ROOT}`);
});
