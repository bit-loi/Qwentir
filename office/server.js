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

/* QWENTIR_ROOT boleh di-override untuk test hermetic (temp dir); default repo ini */
const ROOT = path.resolve(process.env.QWENTIR_ROOT || path.resolve(__dirname, '..'));
const PUBLIC_DIR = path.join(__dirname, 'public');
const WF_DIR = path.join(ROOT, 'output', 'workflow');
const WF_STATE_FILE = path.join(WF_DIR, 'state.json');
const WF_TICK_MS = Number(process.env.QWENTIR_WF_TICK_MS || 4000);
const WF_STALL_MS = Number(process.env.QWENTIR_WF_STALL_MS || 25 * 60 * 1000);
const ROLES = JSON.parse(fs.readFileSync(path.join(__dirname, 'roles.json'), 'utf8')).roles;
const PORT = Number(process.env.PORT || 8787);
const QW_BIN = process.env.QODERWAKE_BIN || 'qoderwake';

/* ---------------- qoderwake CLI wrapper ---------------- */

function qw(args, timeoutMs = 90000) {
  return new Promise((resolve) => {
    let out = '';
    let err = '';
    // no shell: qoderwake adalah executable asli, dan shell mode akan
    // memecah argumen berisi spasi (task message, title). Bin berupa script
    // node (.js) hanya untuk test suite (stub CLI) — jalankan via execPath,
    // karena spawn .cmd/.bat tanpa shell di Windows melempar EINVAL.
    const isNodeScript = /\.js$/i.test(QW_BIN);
    const child = spawn(isNodeScript ? process.execPath : QW_BIN, isNodeScript ? [QW_BIN, ...args] : args);
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

function readBody(req, limit = 1e6) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > limit) req.destroy(); });
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
  // base64 ~28MB = biner ~20MB; limit readBody default (1e6) terlalu kecil untuk ini
  const body = await readBody(ctx.req, 32 * 1024 * 1024);
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
  const persona = Array.isArray(body.persona) ? body.persona.map(String).filter(Boolean) : [];
  const message = personaPreamble(String(body.roleTitle || 'agen Qwentir'), persona, String(body.message));
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

/* ---------------- workflow orchestration: Intake -> Reconciliation -> Billing ----------------
   Founder menekan MULAI sekali; dispatcher mengoper kerja antar agent lewat file
   output terstruktur (kontrak schema di agents/*-bible.md), memvalidasi tiap stage
   sebelum handoff, dan mencatat setiap peristiwa handoff. State persist di
   output/workflow/state.json supaya tahan restart server. Session agen tetap
   dibuat lewat qoderwake CLI yang sama seperti route chat — tidak ada simulasi. */

const STAGE_ORDER = ['intake', 'reconciliation', 'billing'];

const STAGE_FILES = {
  intake: ['output/intake/orders.json', 'output/intake/pods.json', 'output/intake/laporan.md'],
  reconciliation: ['output/reconciliation/matched.json', 'output/reconciliation/issues.json', 'output/reconciliation/laporan.md'],
  billing: ['output/billing/invoices.json', 'output/billing/rekap_piutang.csv', 'output/billing/laporan.md'],
};

const HANDOFF_MESSAGE = {
  intake: (wf) => `Kerjakan batch penuh dokumen DO & POD sesuai bible kamu: enumerasi `
    + `data/orders/, data/pods/, output/do/, output/pod/`
    + (wf.kickoff.files.length ? ` serta file terlampir: ${wf.kickoff.files.join(', ')}` : '')
    + `. Tulis output terstruktur ke output/intake/ (orders.json, pods.json, laporan.md). `
    + (wf.kickoff.message ? `Catatan founder: ${wf.kickoff.message}` : ''),
  reconciliation: () => `Intake selesai dan outputnya lolos validasi kantor. Baca output/intake/orders.json `
    + `dan output/intake/pods.json (ringkasan: output/intake/laporan.md). Kerjakan langkah bible kamu `
    + `atas record-record itu dan tulis output/reconciliation/ (matched.json, issues.json, laporan.md).`,
  billing: () => `Reconciliation selesai dan outputnya lolos validasi kantor. Baca output/reconciliation/matched.json `
    + `dan output/reconciliation/issues.json (ringkasan: output/reconciliation/laporan.md). Susun draft invoice `
    + `sesuai bible ke output/billing/ (invoices.json, drafts/, rekap_piutang.csv, laporan.md). `
    + `Jangan approve atau kirim apa pun — founder yang approve di Virtual Office.`,
};

function personaPreamble(roleTitle, persona, message) {
  if (!Array.isArray(persona) || !persona.length) return message;
  return `Kamu adalah ${roleTitle} di Qwentir Virtual Office. `
    + `Sebelum mengerjakan tugas, baca dulu file persona kamu di repo ini: ${persona.join(', ')}. `
    + `Patuhi isi file-file tersebut selama bekerja.\n\nTugas dari kantor:\n${message}`;
}

function readJsonRel(rel) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); } catch (_) { return undefined; }
}

function missingKeys(rec, keys) {
  return keys.filter((k) => rec[k] === undefined || rec[k] === null || rec[k] === '');
}

/* gerbang handoff: stage berikutnya TIDAK BOLEH jalan sebelum output stage ini
   lolos validasi schema + angka dasar (validasi bisnis mendalam ada di
   scripts/validate-output.js) */
function validateStage(stageId) {
  const problems = [];
  for (const rel of STAGE_FILES[stageId]) {
    if (!fs.existsSync(path.join(ROOT, rel))) problems.push(`output belum ada: ${rel}`);
  }
  if (problems.length) return problems;
  if (stageId === 'intake') {
    const orders = readJsonRel('output/intake/orders.json');
    const pods = readJsonRel('output/intake/pods.json');
    /* Status-aware: hanya record 'lengkap' yang wajib punya semua field + volume
       positif. Record 'incomplete' justru HARUS punya field kosong dan wajib
       mendeklarasikannya di field_kosong (bible: tandai, jangan mengarang data).
       'duplikat'/'orphan' cukup identitas + jejak sumber. Status asing ditolak. */
    if (!Array.isArray(orders) || !orders.length) problems.push('orders.json harus array tidak kosong');
    else orders.forEach((r, i) => {
      const idm = missingKeys(r, ['order_id', 'status', 'sumber_file']);
      if (idm.length) { problems.push(`orders[${i}] (${r.order_id || '?'}) field identitas kosong: ${idm.join(', ')}`); return; }
      if (r.status === 'lengkap') {
        const m = missingKeys(r, ['produk', 'tujuan', 'tanggal']);
        if (m.length) problems.push(`orders[${i}] (${r.order_id}) status lengkap tapi field kosong: ${m.join(', ')}`);
        if (!(Number.isFinite(Number(r.volume_muat_liter)) && Number(r.volume_muat_liter) > 0)) {
          problems.push(`orders[${i}] (${r.order_id}) status lengkap tapi volume_muat_liter bukan angka > 0`);
        }
      } else if (r.status === 'incomplete') {
        if (!Array.isArray(r.field_kosong) || !r.field_kosong.length) {
          problems.push(`orders[${i}] (${r.order_id}) status incomplete tapi field_kosong tidak mendeklarasikan field yang hilang`);
        }
      } else if (!['duplikat', 'orphan'].includes(r.status)) {
        problems.push(`orders[${i}] (${r.order_id}) status asing: ${r.status}`);
      }
    });
    if (!Array.isArray(pods) || !pods.length) problems.push('pods.json harus array tidak kosong');
    else pods.forEach((r, i) => {
      const idm = missingKeys(r, ['order_id', 'status', 'sumber_file']);
      if (idm.length) { problems.push(`pods[${i}] (${r.order_id || '?'}) field identitas kosong: ${idm.join(', ')}`); return; }
      if (r.status === 'lengkap') {
        const m = missingKeys(r, ['penerima']);
        if (m.length) problems.push(`pods[${i}] (${r.order_id}) status lengkap tapi field kosong: ${m.join(', ')}`);
        if (!(Number.isFinite(Number(r.volume_diterima_liter)) && Number(r.volume_diterima_liter) > 0)) {
          problems.push(`pods[${i}] (${r.order_id}) status lengkap tapi volume_diterima_liter bukan angka > 0`);
        }
      } else if (r.status === 'incomplete') {
        if (!Array.isArray(r.field_kosong) || !r.field_kosong.length) {
          problems.push(`pods[${i}] (${r.order_id}) status incomplete tapi field_kosong tidak mendeklarasikan field yang hilang`);
        }
      } else if (!['duplikat', 'orphan'].includes(r.status)) {
        problems.push(`pods[${i}] (${r.order_id}) status asing: ${r.status}`);
      }
    });
  }
  if (stageId === 'reconciliation') {
    const matched = readJsonRel('output/reconciliation/matched.json');
    const issues = readJsonRel('output/reconciliation/issues.json');
    if (!Array.isArray(matched)) problems.push('matched.json harus array');
    else matched.forEach((r, i) => {
      const m = missingKeys(r, ['order_id', 'volume_muat_liter', 'volume_diterima_liter', 'susut_liter', 'susut_persen', 'within_tolerance', 'status']);
      if (m.length) problems.push(`matched[${i}] (${r.order_id || '?'}) field kosong: ${m.join(', ')}`);
      if (!['cocok', 'selisih_di_atas_toleransi'].includes(r.status)) problems.push(`matched[${i}] status asing: ${r.status}`);
    });
    if (!Array.isArray(issues)) problems.push('issues.json harus array');
  }
  if (stageId === 'billing') {
    const invoices = readJsonRel('output/billing/invoices.json');
    const matched = readJsonRel('output/reconciliation/matched.json');
    if (!Array.isArray(invoices) || !invoices.length) problems.push('invoices.json harus array tidak kosong');
    else invoices.forEach((r, i) => {
      const m = missingKeys(r, ['invoice_id', 'order_id', 'klien', 'total_tagihan', 'status']);
      if (m.length) problems.push(`invoices[${i}] (${r.invoice_id || '?'}) field kosong: ${m.join(', ')}`);
      if (!Number.isInteger(r.total_tagihan)) problems.push(`invoices[${i}] total_tagihan bukan integer Rupiah`);
      if (!['draft', 'approved', 'paid'].includes(r.status)) problems.push(`invoices[${i}] status asing: ${r.status}`);
    });
    if (Array.isArray(invoices) && Array.isArray(matched) && invoices.length !== matched.length) {
      problems.push(`jumlah invoice (${invoices.length}) != jumlah record matched (${matched.length})`);
    }
  }
  return problems;
}

/* state workflow: satu objek in-memory sebagai sumber kebenaran selama server
   hidup (route & tick dispatcher berbagi objek yang sama supaya pause yang
   masuk di tengah await tetap terlihat), persist ke disk tiap mutasi */
let WF = null;
try { WF = JSON.parse(fs.readFileSync(WF_STATE_FILE, 'utf8')); } catch (_) { WF = null; }

function wfSave() {
  if (!WF) return;
  WF.updatedAt = new Date().toISOString();
  fs.mkdirSync(WF_DIR, { recursive: true });
  const tmp = `${WF_STATE_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(WF, null, 2));
  fs.renameSync(tmp, WF_STATE_FILE);
}

function wfLog(type, stage, message) {
  if (!WF) return;
  WF.events.push({ at: new Date().toISOString(), type, stage: stage || null, message });
  if (WF.events.length > 500) WF.events.splice(0, WF.events.length - 500);
}

function freshStage() {
  return { status: 'pending', sessionId: null, attempts: 0, startedAt: null, finishedAt: null, cursor: 0, lastEventAt: 0, error: null };
}

function failStage(stageId, error) {
  const stage = WF.stages[stageId];
  stage.status = 'failed';
  stage.finishedAt = new Date().toISOString();
  stage.error = error;
  WF.status = 'failed';
  wfLog('stage_failed', stageId, error);
  wfSave();
}

async function dispatchStage(stageId) {
  const stage = WF.stages[stageId];
  // cegah eksekusi duplikat: stage yang sudah punya session running tidak dibuatkan lagi
  if (stage.status === 'running' && stage.sessionId) {
    return { ok: false, error: `stage ${stageId} sudah berjalan di session ${stage.sessionId}` };
  }
  const role = ROLES.find((r) => r.id === stageId);
  const list = await qw(['waker', 'list', '--json'], 20000);
  const waker = list.ok && Array.isArray(list.data)
    ? list.data.find((w) => { const m = matchRole(w); return m && m.id === stageId; })
    : null;
  if (!waker) {
    failStage(stageId, list.ok
      ? `tidak ada Waker terpetakan ke role ${stageId} — hire dulu dari roster`
      : (list.error || list.stderr || 'waker list gagal'));
    return { ok: false, error: WF.stages[stageId].error };
  }
  const message = personaPreamble(role.title, role.persona, HANDOFF_MESSAGE[stageId](WF));
  const r = await qw([
    'session', 'create',
    '--waker-id', String(waker.agentId),
    '--title', `Qwentir ${stageId} ${WF.workflowId}`,
    '--message', message,
    '--cwd', ROOT,
    '--json',
  ], 120000);
  if (!r.ok) {
    failStage(stageId, r.error || r.stderr || 'session create gagal');
    return { ok: false, error: WF.stages[stageId].error };
  }
  const sid = normalizeSession(r.data).sessionId;
  stage.status = 'running';
  stage.sessionId = sid;
  stage.attempts += 1;
  stage.startedAt = new Date().toISOString();
  stage.finishedAt = null;
  stage.cursor = 0;
  stage.lastEventAt = Date.now();
  stage.error = null;
  WF.currentStage = stageId;
  wfLog('dispatch', stageId, `session ${sid} dibuat untuk ${stageId} (percobaan ke-${stage.attempts})`);
  wfSave();
  return { ok: true, sessionId: sid };
}

let wfTicking = false;
async function wfTick() {
  // pause tetap memproses event: turn yang berjalan dicatat selesai dan
  // handoff-nya ditahan (handoff_held); hanya status running yang dispatch
  if (wfTicking || !WF || (WF.status !== 'running' && WF.status !== 'paused')) return;
  wfTicking = true;
  try {
    const stageId = WF.currentStage;
    const stage = WF.stages[stageId];
    if (!stage || stage.status !== 'running' || !stage.sessionId) return;
    const r = await qw([
      'session', 'events',
      '--session-id', stage.sessionId,
      '--after-sequence-num', String(stage.cursor || 0),
      '--limit', '200',
      '--json',
    ], 30000);
    if (WF.status !== 'running' && WF.status !== 'paused') return; // stop masuk selama await
    if (!r.ok) { wfSave(); return; } // daemon sibuk/offline: coba lagi tick berikutnya
    const list = Array.isArray(r.data) ? r.data : (r.data && r.data.events) || [];
    let turnDone = false;
    let badState = null;
    for (const ev of list) {
      const seq = Number(ev.sequence_num != null ? ev.sequence_num : (ev.sequenceNum || 0));
      if (seq > (stage.cursor || 0)) stage.cursor = seq;
      const type = String(ev.event_type || ev.type || '');
      if (type === 'result') turnDone = true;
      if (type === 'runtime.state.changed') {
        const st = String((ev.payload || {}).state || '');
        if (/^(stopped|error|failed|cancelled)$/i.test(st)) badState = st;
      }
      if (seq > 0) stage.lastEventAt = Date.now();
    }
    if (!turnDone && !badState) {
      // stall hanya berlaku saat running; workflow paused sengaja menahan state
      if (WF.status === 'running' && stage.lastEventAt && Date.now() - stage.lastEventAt > WF_STALL_MS) badState = 'stall (tidak ada event baru)';
      else { wfSave(); return; } // masih bekerja: persist cursor, tunggu tick berikutnya
    }
    if (badState) { failStage(stageId, `session berhenti tidak wajar: ${badState}`); return; }
    const problems = validateStage(stageId);
    if (problems.length) { failStage(stageId, `validasi output ${stageId} gagal: ${problems.join('; ')}`); return; }
    stage.status = 'done';
    stage.finishedAt = new Date().toISOString();
    wfLog('stage_done', stageId, `output ${stageId} lolos validasi kantor`);
    const next = STAGE_ORDER[STAGE_ORDER.indexOf(stageId) + 1];
    if (!next) {
      WF.status = 'completed';
      wfLog('workflow_completed', null, 'pipeline selesai; draft invoice menunggu approve founder');
      wfSave();
      return;
    }
    if (WF.status !== 'running') {
      wfLog('handoff_held', stageId, `${WF.status} aktif — handoff ke ${next} ditahan sampai resume`);
      wfSave();
      return;
    }
    wfLog('handoff', stageId, `oper kerja otomatis ke ${next}`);
    wfSave();
    await dispatchStage(next);
  } finally {
    wfTicking = false;
  }
}
setInterval(() => { wfTick().catch((e) => console.error('[workflow] tick error:', e.message)); }, WF_TICK_MS);

function writeRekapCsv(invoices) {
  const head = 'invoice_id,order_id,klien,biaya_angkut,denda,total_tagihan,status';
  const lines = invoices.map((v) => [
    v.invoice_id, v.order_id, v.klien, v.biaya_angkut, v.denda, v.total_tagihan, v.status,
  ].join(','));
  fs.writeFileSync(path.join(ROOT, 'output/billing/rekap_piutang.csv'), `${[head, ...lines].join('\n')}\n`);
}

route('GET', /^\/api\/workflow$/, async () => {
  let draftCount = 0;
  try {
    const inv = JSON.parse(fs.readFileSync(path.join(ROOT, 'output/billing/invoices.json'), 'utf8'));
    if (Array.isArray(inv)) draftCount = inv.filter((x) => x.status === 'draft').length;
  } catch (_) { /* output billing belum ada */ }
  return { ok: true, workflow: WF, draftCount };
});

route('POST', /^\/api\/workflow\/start$/, async (ctx) => {
  const body = await readBody(ctx.req);
  if (WF && (WF.status === 'running' || WF.status === 'paused')) {
    return { ok: false, error: `workflow ${WF.workflowId} masih ${WF.status} — tunggu selesai, atau stop dulu` };
  }
  WF = {
    workflowId: `WF-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`,
    status: 'running',
    currentStage: 'intake',
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    kickoff: {
      message: String(body.message || '').slice(0, 2000),
      files: Array.isArray(body.files) ? body.files.map(String).slice(0, 50) : [],
    },
    stages: { intake: freshStage(), reconciliation: freshStage(), billing: freshStage() },
    events: [],
  };
  wfLog('workflow_started', null, 'founder memulai workflow — satu klik, tanpa klik manual berikutnya');
  wfSave();
  const r = await dispatchStage('intake');
  return r.ok ? { ok: true, workflow: WF } : { ok: false, error: r.error, workflow: WF };
});

route('POST', /^\/api\/workflow\/pause$/, async () => {
  if (!WF || WF.status !== 'running') return { ok: false, error: 'tidak ada workflow yang sedang berjalan' };
  WF.status = 'paused';
  wfLog('pause', WF.currentStage, 'dispatcher ditahan founder; turn yang sedang jalan dibiarkan selesai');
  wfSave();
  return { ok: true, workflow: WF };
});

route('POST', /^\/api\/workflow\/resume$/, async () => {
  if (!WF || WF.status !== 'paused') return { ok: false, error: 'workflow tidak dalam status paused' };
  WF.status = 'running';
  wfLog('resume', WF.currentStage, 'dispatcher dilanjutkan founder');
  wfSave();
  const stage = WF.stages[WF.currentStage];
  if (stage.status === 'done') {
    const next = STAGE_ORDER[STAGE_ORDER.indexOf(WF.currentStage) + 1];
    if (!next) {
      WF.status = 'completed';
      wfLog('workflow_completed', null, 'semua stage sudah selesai sebelum pause');
      wfSave();
      return { ok: true, workflow: WF };
    }
    wfLog('handoff', WF.currentStage, `oper kerja otomatis ke ${next} (setelah resume)`);
    wfSave();
    const r = await dispatchStage(next);
    return { ok: r.ok, error: r.ok ? undefined : r.error, workflow: WF };
  }
  if (stage.status === 'pending') {
    const r = await dispatchStage(WF.currentStage);
    return { ok: r.ok, error: r.ok ? undefined : r.error, workflow: WF };
  }
  return { ok: true, workflow: WF }; // stage running: tick melanjutkan monitoring
});

route('POST', /^\/api\/workflow\/stop$/, async () => {
  if (!WF || (WF.status !== 'running' && WF.status !== 'paused')) {
    return { ok: false, error: 'tidak ada workflow aktif untuk distop' };
  }
  const stage = WF.stages[WF.currentStage];
  if (stage.status === 'running' && stage.sessionId) {
    await qw(['session', 'stop', '--session-id', stage.sessionId, '--json'], 30000);
  }
  stage.status = 'stopped';
  stage.finishedAt = new Date().toISOString();
  stage.error = 'di-stop founder';
  WF.status = 'stopped';
  wfLog('stop', WF.currentStage, 'workflow distop founder; output stage yang selesai tetap tersimpan');
  wfSave();
  return { ok: true, workflow: WF };
});

route('POST', /^\/api\/workflow\/retry$/, async () => {
  if (!WF || WF.status !== 'failed') return { ok: false, error: 'retry hanya tersedia saat workflow failed' };
  const stageId = WF.currentStage;
  // Retry tanpa menduplikasi kerja yang sudah selesai (Phase 2): bila output
  // stage yang gagal SUDAH ada di disk dan kini lolos gerbang validasi (mis.
  // gate-nya baru diperbaiki), tandai stage done dan lanjut ke stage berikut
  // TANPA memanggil agen lagi — hemat kredit, tidak mengulang kerja valid.
  if (!validateStage(stageId).length) {
    WF.stages[stageId].status = 'done';
    WF.stages[stageId].finishedAt = new Date().toISOString();
    WF.stages[stageId].error = null;
    WF.status = 'running';
    wfLog('retry', stageId, `output ${stageId} yang sudah ada kini lolos validasi — stage ditandai selesai tanpa menjalankan ulang agen`);
    wfLog('stage_done', stageId, `output ${stageId} lolos validasi kantor (diterima saat retry)`);
    const next = STAGE_ORDER[STAGE_ORDER.indexOf(stageId) + 1];
    if (!next) {
      WF.status = 'completed';
      wfLog('workflow_completed', null, 'pipeline selesai; draft invoice menunggu approve founder');
      wfSave();
      return { ok: true, workflow: WF };
    }
    wfLog('handoff', stageId, `oper kerja otomatis ke ${next}`);
    wfSave();
    const rd = await dispatchStage(next);
    return { ok: rd.ok, error: rd.ok ? undefined : rd.error, workflow: WF };
  }
  wfLog('retry', stageId, `founder meminta retry stage ${stageId}; stage yang done tidak diulang`);
  WF.status = 'running';
  WF.stages[stageId].status = 'pending';
  WF.stages[stageId].error = null;
  wfSave();
  const r = await dispatchStage(stageId);
  return { ok: r.ok, error: r.ok ? undefined : r.error, workflow: WF };
});

route('POST', /^\/api\/workflow\/approve$/, async (ctx) => {
  const body = await readBody(ctx.req);
  const abs = path.join(ROOT, 'output/billing/invoices.json');
  let invoices;
  try { invoices = JSON.parse(fs.readFileSync(abs, 'utf8')); } catch (_) {
    return { ok: false, error: 'output/billing/invoices.json belum ada — billing belum selesai' };
  }
  if (!Array.isArray(invoices)) return { ok: false, error: 'invoices.json bukan array' };
  const wanted = Array.isArray(body.invoiceIds) && body.invoiceIds.length ? body.invoiceIds : null;
  const targets = invoices.filter((v) => v.status === 'draft' && (!wanted || wanted.includes(v.invoice_id)));
  if (!targets.length) {
    return { ok: false, error: wanted ? 'invoice tersebut bukan draft (sudah approved?)' : 'tidak ada invoice draft untuk diapprove' };
  }
  const approvedAt = new Date().toISOString();
  const ids = new Set(targets.map((v) => v.invoice_id));
  for (const v of invoices) if (ids.has(v.invoice_id)) v.status = 'approved';
  fs.writeFileSync(abs, JSON.stringify(invoices, null, 2));
  writeRekapCsv(invoices);
  const ledgerRel = path.join(ROOT, 'output/billing/approvals.json');
  let ledger = [];
  try { ledger = JSON.parse(fs.readFileSync(ledgerRel, 'utf8')); } catch (_) { ledger = []; }
  ledger.push({
    approvedAt,
    invoiceIds: [...ids],
    total_tagihan: targets.reduce((s, v) => s + (Number(v.total_tagihan) || 0), 0),
  });
  fs.writeFileSync(ledgerRel, JSON.stringify(ledger, null, 2));
  if (WF) { wfLog('approve', 'billing', `${ids.size} invoice di-approve founder`); wfSave(); }
  return { ok: true, approved: [...ids], approvedAt };
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
  if (WF) console.log(`[virtual-office] workflow ${WF.workflowId} dimuat ulang dengan status: ${WF.status}`);
});
