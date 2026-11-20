#!/usr/bin/env node
/* Qwentir Virtual Office — bridge test suite (no agent sessions are created,
   so running this consumes zero QoderWake credits).
   Run: node office/test.js   (or: npm run test:office) */
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8791;
const BASE = `http://localhost:${PORT}`;
let server;

async function waitForServer(tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${BASE}/api/status`);
      if (r.ok) return;
    } catch (_) { /* not up yet */ }
    await new Promise((res) => setTimeout(res, 250));
  }
  throw new Error('virtual office server tidak mau hidup di port ' + PORT);
}

before(async () => {
  server = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
  });
  await waitForServer();
});

after(() => { if (server) server.kill(); });

test('static: index.html terserve dengan canvas office', async () => {
  const r = await fetch(`${BASE}/`);
  assert.strictEqual(r.status, 200);
  const html = await r.text();
  assert.match(html, /id="office"/);
  assert.match(html, /sprites\.js/);
});

test('static: aset dikirim dengan no-store (tidak ada cache basi)', async () => {
  const r = await fetch(`${BASE}/office.js`);
  assert.strictEqual(r.status, 200);
  assert.match(r.headers.get('cache-control') || '', /no-store/);
});

test('static: path traversal di luar public ditolak', async () => {
  const r = await fetch(`${BASE}/..%2Fserver.js`);
  assert.ok([403, 404].includes(r.status), `status tak terduga: ${r.status}`);
});

test('api: roles memuat 3 peran Qwentir lengkap dengan tasks', async () => {
  const r = await fetch(`${BASE}/api/roles`);
  const j = await r.json();
  assert.strictEqual(j.roles.length, 3);
  const ids = j.roles.map((x) => x.id).sort();
  assert.deepStrictEqual(ids, ['billing', 'intake', 'reconciliation']);
  for (const role of j.roles) {
    assert.ok(Array.isArray(role.tasks) && role.tasks.length >= 2, `tasks ${role.id}`);
    assert.ok(Array.isArray(role.desk) && role.desk.length === 2, `desk ${role.id}`);
  }
  const billing = j.roles.find((x) => x.id === 'billing');
  assert.ok(billing.hire && billing.hire.name, 'billing harus punya paket hire');
});

test('api: status daemon punya field wajib', async () => {
  const r = await fetch(`${BASE}/api/status`);
  const j = await r.json();
  assert.strictEqual(j.ok, true);
  assert.ok(['online', 'offline'].includes(j.daemon));
  assert.ok(typeof j.sessionsRunning === 'number');
  assert.match(j.repo, /Qwentir$/);
});

test('api: wakers terpetakan ke role Qwentir (skip bila daemon offline)', async () => {
  const st = await (await fetch(`${BASE}/api/status`)).json();
  if (st.daemon !== 'online') return; // daemon mati -> bukan kegagalan bridge
  const j = await (await fetch(`${BASE}/api/wakers`)).json();
  assert.strictEqual(j.ok, true);
  assert.ok(Array.isArray(j.wakers) && j.wakers.length >= 1);
  for (const w of j.wakers) {
    assert.ok(w.agentId && w.name, 'waker butuh agentId & name');
    assert.ok([null, 'intake', 'reconciliation', 'billing'].includes(w.roleId));
  }
});

test('api: upload file masuk ke inbox/ dan isinya utuh', async () => {
  const payload = 'halo dari test virtual office';
  const r = await fetch(`${BASE}/api/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'test note.txt',
      dataBase64: Buffer.from(payload, 'utf8').toString('base64'),
    }),
  });
  const j = await r.json();
  assert.strictEqual(j.ok, true, j.error);
  assert.match(j.path, /^inbox\//);
  const onDisk = fs.readFileSync(path.join(ROOT, j.path), 'utf8');
  assert.strictEqual(onDisk, payload);
  fs.unlinkSync(path.join(ROOT, j.path)); // bersih-bersih
});

test('api: upload menolak payload kosong', async () => {
  const j = await (await fetch(`${BASE}/api/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'x.txt' }),
  })).json();
  assert.strictEqual(j.ok, false);
});

test('api: hire custom tanpa name/description ditolak tanpa menyentuh daemon', async () => {
  const j = await (await fetch(`${BASE}/api/hire`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })).json();
  assert.strictEqual(j.ok, false);
  assert.match(j.error, /wajib/);
});

test('api: session create tanpa payload ditolak tanpa menyentuh daemon', async () => {
  const j = await (await fetch(`${BASE}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })).json();
  assert.strictEqual(j.ok, false);
  assert.match(j.error, /wajib/);
});

test('api: route tak dikenal mengembalikan 404 json', async () => {
  const r = await fetch(`${BASE}/api/ngawur`);
  assert.strictEqual(r.status, 404);
  const j = await r.json();
  assert.strictEqual(j.ok, false);
});
