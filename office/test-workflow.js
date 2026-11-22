#!/usr/bin/env node
/* Qwentir — test suite workflow orchestration (Phase 5 & 7).
   Menguji dispatcher handoff, pause/resume/stop/retry, approve ledger, dan
   validator bisnis SEMUA lewat stub qoderwake CLI (env QODERWAKE_BIN), sehingga
   NOL kredit QoderWake terpakai dan tidak ada session agen sungguhan.
   Run: node office/test-workflow.js   (atau: npm run test:workflow) */
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const OFFICE = __dirname;
const REPO = path.resolve(__dirname, '..');
const STUB = path.join(OFFICE, 'test', 'stub-qoderwake.js');
const VALIDATOR = path.join(REPO, 'scripts', 'validate-output.js');
const PORT_A = 8792;
const PORT_B = 8793;
const BASE_A = `http://localhost:${PORT_A}`;
const BASE_B = `http://localhost:${PORT_B}`;

let serverA;
let serverB;
let dirA; // state stub + root repo palsu server A
let dirB;
let rootA;
let rootB;
let rootV; // root khusus test validator

/* stub dipakai langsung sebagai QODERWAKE_BIN: server.js mengenali bin .js
   dan menjalankannya lewat process.execPath (cross-platform, tanpa shell) */
function writeFixtures(root) {
  const w = (rel, content) => {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  };
  w('output/intake/orders.json', [
    { order_id: 'DO-001', produk: 'Pertalite', volume_muat_liter: 10000, depot_asal: 'Plumpang', tujuan: 'SPBU Kebon Jeruk', tanggal: '2026-11-01', klien: 'PT Contoh Energi', nopol: 'B 1 AAA', sopir: 'Udin', sumber_file: 'data/orders/DO-001.txt', status: 'lengkap', field_kosong: [] },
    { order_id: 'DO-002', produk: 'Pertamax', volume_muat_liter: 8000, depot_asal: 'Plumpang', tujuan: 'SPBU Slipi', tanggal: '2026-11-02', klien: 'PT Contoh Energi', nopol: 'B 2 BBB', sopir: 'Budi', sumber_file: 'data/orders/DO-002.txt', status: 'lengkap', field_kosong: [] },
  ]);
  w('output/intake/pods.json', [
    { order_id: 'DO-001', volume_diterima_liter: 9900, penerima: 'Rina', tanggal_terima: '2026-11-01', ttd_ada: true, stempel_ada: true, sumber_file: 'data/pods/POD-001.txt', status: 'lengkap', satuan_asli: 'ltr', catatan: '', confidence: 'tinggi' },
    { order_id: 'DO-002', volume_diterima_liter: 7960, penerima: 'Rina', tanggal_terima: '2026-11-02', ttd_ada: true, stempel_ada: true, sumber_file: 'data/pods/POD-002.txt', status: 'lengkap', satuan_asli: 'ltr', catatan: '', confidence: 'tinggi' },
  ]);
  w('output/intake/laporan.md', 'laporan intake fixture');
  w('output/reconciliation/matched.json', [
    { order_id: 'DO-001', produk: 'Pertalite', volume_muat_liter: 10000, volume_diterima_liter: 9900, susut_liter: 100, susut_persen: 1, toleransi_persen: 0.5, within_tolerance: false, kelebihan_liter: 50, status: 'selisih_di_atas_toleransi', sumber_order: 'data/orders/DO-001.txt', sumber_pod: 'data/pods/POD-001.txt' },
    { order_id: 'DO-002', produk: 'Pertamax', volume_muat_liter: 8000, volume_diterima_liter: 7960, susut_liter: 40, susut_persen: 0.5, toleransi_persen: 0.5, within_tolerance: true, kelebihan_liter: 0, status: 'cocok', sumber_order: 'data/orders/DO-002.txt', sumber_pod: 'data/pods/POD-002.txt' },
  ]);
  w('output/reconciliation/issues.json', []);
  w('output/reconciliation/laporan.md', 'laporan rekonsiliasi fixture');
  w('output/billing/invoices.json', [
    { invoice_id: 'INV-001', order_id: 'DO-001', klien: 'PT Contoh Energi', produk: 'Pertalite', volume_diterima_liter: 9900, tarif_per_liter: 500, biaya_angkut: 4950000, kelebihan_liter: 50, harga_produk_per_liter: 10000, denda: 500000, total_tagihan: 4450000, status: 'draft', sumber_matched: 'output/reconciliation/matched.json' },
    { invoice_id: 'INV-002', order_id: 'DO-002', klien: 'PT Contoh Energi', produk: 'Pertamax', volume_diterima_liter: 7960, tarif_per_liter: 500, biaya_angkut: 3980000, kelebihan_liter: 0, harga_produk_per_liter: 12000, denda: 0, total_tagihan: 3980000, status: 'draft', sumber_matched: 'output/reconciliation/matched.json' },
  ]);
  w('output/billing/rekap_piutang.csv', 'invoice_id,order_id,klien,biaya_angkut,denda,total_tagihan,status\nINV-001,DO-001,PT Contoh Energi,4950000,500000,4450000,draft\nINV-002,DO-002,PT Contoh Energi,3980000,0,3980000,draft\n');
  w('output/billing/laporan.md', 'laporan billing fixture');
}

function startServer(port, root, stateDir) {
  const child = spawn(process.execPath, [path.join(OFFICE, 'server.js')], {
    env: {
      ...process.env,
      PORT: String(port),
      QODERWAKE_BIN: STUB,
      STUB_STATE_DIR: stateDir,
      QWENTIR_ROOT: root,
      QWENTIR_WF_TICK_MS: '150',
    },
    stdio: 'ignore',
  });
  return child;
}

async function waitForServer(base, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${base}/api/status`);
      if (r.ok) return;
    } catch (_) { /* belum hidup */ }
    await new Promise((res) => setTimeout(res, 200));
  }
  throw new Error(`server tidak hidup di ${base}`);
}

/* preflight: server Qwentir lama di port test akan menjawab fetch dan membuat
   test menunggu sia-sia — deteksi dini dengan pesan yang jelas */
async function assertPortFree(base) {
  try {
    await fetch(`${base}/api/status`);
    throw new Error(`port ${base} masih dipakai proses lama — matikan dulu (taskkill / node office/server.js lama)`);
  } catch (e) {
    if (e.message.includes('masih dipakai')) throw e;
    // fetch gagal = port bebas, lanjut
  }
}

async function getWorkflow(base) {
  return (await fetch(`${base}/api/workflow`)).json();
}

async function waitForWorkflow(base, predicate, timeoutMs = 10000) {
  const t0 = Date.now();
  for (;;) {
    const j = await getWorkflow(base);
    if (predicate(j.workflow)) return j.workflow;
    if (Date.now() - t0 > timeoutMs) throw new Error(`timeout menunggu workflow: ${JSON.stringify(j.workflow && j.workflow.status)}`);
    await new Promise((res) => setTimeout(res, 120));
  }
}

function readCalls(stateDir) {
  const raw = fs.readFileSync(path.join(stateDir, 'calls.jsonl'), 'utf8');
  return raw.split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

before(async () => {
  await assertPortFree(BASE_A);
  await assertPortFree(BASE_B);
  dirA = fs.mkdtempSync(path.join(os.tmpdir(), 'qwentir-wf-a-'));
  dirB = fs.mkdtempSync(path.join(os.tmpdir(), 'qwentir-wf-b-'));
  rootA = path.join(dirA, 'root');
  rootB = path.join(dirB, 'root');
  fs.mkdirSync(rootA, { recursive: true });
  fs.mkdirSync(rootB, { recursive: true });
  writeFixtures(rootA); // server A: output valid -> jalur happy path
  // server B sengaja tanpa output -> jalur validasi gagal + retry
  serverA = startServer(PORT_A, rootA, dirA);
  serverB = startServer(PORT_B, rootB, dirB);
  try {
    await waitForServer(BASE_A);
    await waitForServer(BASE_B);
  } catch (e) {
    serverA.kill();
    serverB.kill();
    throw e;
  }
});

after(() => {
  if (serverA) serverA.kill();
  if (serverB) serverB.kill();
  for (const d of [dirA, dirB, rootV].filter(Boolean)) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) { /* noop */ }
  }
});

test('workflow: mulai dari null; approve ditolak selama output billing belum ada', async () => {
  const j = await getWorkflow(BASE_B);
  assert.strictEqual(j.ok, true);
  assert.strictEqual(j.workflow, null);
  const ap = await (await fetch(`${BASE_B}/api/workflow/approve`, { method: 'POST', body: '{}' })).json();
  assert.strictEqual(ap.ok, false);
  assert.match(ap.error, /invoices\.json belum ada/);
});

test('workflow: satu klik start -> intake running; start kedua ditolak (anti duplikat)', async () => {
  const r = await (await fetch(`${BASE_A}/api/workflow/start`, { method: 'POST', body: '{}' })).json();
  assert.strictEqual(r.ok, true, r.error);
  assert.strictEqual(r.workflow.status, 'running');
  assert.strictEqual(r.workflow.currentStage, 'intake');
  assert.strictEqual(r.workflow.stages.intake.status, 'running');
  assert.ok(r.workflow.stages.intake.sessionId);
  const dup = await (await fetch(`${BASE_A}/api/workflow/start`, { method: 'POST', body: '{}' })).json();
  assert.strictEqual(dup.ok, false);
  assert.match(dup.error, /masih running/);
});

test('workflow: handoff otomatis intake->reconciliation->billing sampai completed', async () => {
  const wf = await waitForWorkflow(BASE_A, (w) => w && w.status === 'completed');
  for (const id of ['intake', 'reconciliation', 'billing']) {
    assert.strictEqual(wf.stages[id].status, 'done', `stage ${id}`);
    assert.strictEqual(wf.stages[id].attempts, 1, `attempts ${id}`);
  }
  const types = wf.events.map((e) => e.type);
  for (const t of ['workflow_started', 'dispatch', 'stage_done', 'handoff', 'workflow_completed']) {
    assert.ok(types.includes(t), `event ${t} tidak ada`);
  }
  assert.strictEqual(types.filter((t) => t === 'handoff').length, 2);
  const creates = readCalls(dirA).filter((c) => c.op === 'create');
  assert.deepStrictEqual(creates.map((c) => c.wakerId), ['W-INT', 'W-REC', 'W-BIL']);
  assert.match(creates[1].message, /output\/intake\/orders\.json/, 'handoff ke reconciliation harus menyebut file output intake');
  assert.match(creates[2].message, /output\/reconciliation\/matched\.json/, 'handoff ke billing harus menyebut file output reconciliation');
  assert.match(creates[0].message, /bible/, 'persona bible harus dibacakan pada session intake');
});

test('workflow: approve draft -> approved + ledger + rekap; approve ulang ditolak', async () => {
  const before = await getWorkflow(BASE_A);
  assert.strictEqual(before.draftCount, 2);
  const r = await (await fetch(`${BASE_A}/api/workflow/approve`, { method: 'POST', body: '{}' })).json();
  assert.strictEqual(r.ok, true, r.error);
  assert.deepStrictEqual(r.approved.sort(), ['INV-001', 'INV-002']);
  const inv = JSON.parse(fs.readFileSync(path.join(rootA, 'output/billing/invoices.json'), 'utf8'));
  assert.ok(inv.every((v) => v.status === 'approved'));
  const ledger = JSON.parse(fs.readFileSync(path.join(rootA, 'output/billing/approvals.json'), 'utf8'));
  assert.strictEqual(ledger.length, 1);
  assert.strictEqual(ledger[0].total_tagihan, 4450000 + 3980000);
  const rekap = fs.readFileSync(path.join(rootA, 'output/billing/rekap_piutang.csv'), 'utf8');
  assert.match(rekap, /INV-001,DO-001,.*approved/);
  const again = await (await fetch(`${BASE_A}/api/workflow/approve`, { method: 'POST', body: '{}' })).json();
  assert.strictEqual(again.ok, false);
  assert.match(again.error, /tidak ada invoice draft/);
  const after = await getWorkflow(BASE_A);
  assert.strictEqual(after.draftCount, 0);
});

test('workflow: pause menahan handoff; resume melanjutkan sampai completed', async () => {
  const s = await (await fetch(`${BASE_A}/api/workflow/start`, { method: 'POST', body: '{}' })).json();
  assert.strictEqual(s.ok, true, s.error);
  const p = await (await fetch(`${BASE_A}/api/workflow/pause`, { method: 'POST' })).json();
  assert.strictEqual(p.ok, true, p.error);
  await new Promise((res) => setTimeout(res, 1200)); // stub menyelesaikan turn ke-3 (~450ms)
  const held = await getWorkflow(BASE_A);
  assert.strictEqual(held.workflow.status, 'paused');
  assert.strictEqual(held.workflow.stages.intake.status, 'done', 'turn yang berjalan tetap dicatat selesai saat pause');
  assert.strictEqual(held.workflow.stages.reconciliation.status, 'pending', 'handoff harus tertahan saat pause');
  assert.ok(held.workflow.events.some((e) => e.type === 'handoff_held'), 'peristiwa handoff_held harus tercatat saat pause');
  const createsHeld = readCalls(dirA).filter((c) => c.op === 'create').length;
  const r = await (await fetch(`${BASE_A}/api/workflow/resume`, { method: 'POST' })).json();
  assert.strictEqual(r.ok, true, r.error);
  const wf = await waitForWorkflow(BASE_A, (w) => w && w.status === 'completed');
  assert.strictEqual(wf.stages.intake.attempts, 1);
  const createsNow = readCalls(dirA).filter((c) => c.op === 'create').length;
  assert.strictEqual(createsNow, createsHeld + 2, 'resume hanya menambah session reconciliation + billing');
  assert.ok(wf.events.some((e) => e.type === 'handoff_held'), 'peristiwa handoff_held harus tercatat');
});

test('workflow: stop menghentikan session aktif dan menahan dispatch berikutnya', async () => {
  const s = await (await fetch(`${BASE_A}/api/workflow/start`, { method: 'POST', body: '{}' })).json();
  assert.strictEqual(s.ok, true, s.error);
  const sid = s.workflow.stages.intake.sessionId;
  const st = await (await fetch(`${BASE_A}/api/workflow/stop`, { method: 'POST' })).json();
  assert.strictEqual(st.ok, true, st.error);
  assert.strictEqual(st.workflow.status, 'stopped');
  assert.strictEqual(st.workflow.stages.intake.status, 'stopped');
  const stops = readCalls(dirA).filter((c) => c.op === 'stop');
  assert.ok(stops.some((c) => c.sid === sid), 'session aktif harus di-stop lewat CLI');
  const pauseAfterStop = await (await fetch(`${BASE_A}/api/workflow/pause`, { method: 'POST' })).json();
  assert.strictEqual(pauseAfterStop.ok, false, 'pause setelah stop harus ditolak');
});

test('workflow: output tak valid -> failed tanpa handoff; retry re-run saat output kosong, terima output valid tanpa re-run', async () => {
  const s = await (await fetch(`${BASE_B}/api/workflow/start`, { method: 'POST', body: '{}' })).json();
  assert.strictEqual(s.ok, true, s.error);
  const failed = await waitForWorkflow(BASE_B, (w) => w && w.status === 'failed');
  assert.strictEqual(failed.stages.intake.status, 'failed');
  assert.match(failed.stages.intake.error, /validasi output intake gagal/);
  const creates1 = readCalls(dirB).filter((c) => c.op === 'create');
  assert.strictEqual(creates1.length, 1, 'stage gagal tidak boleh men-trigger handoff');
  const retryTooEarly = await (await fetch(`${BASE_A}/api/workflow/retry`, { method: 'POST' })).json();
  assert.strictEqual(retryTooEarly.ok, false, 'retry hanya untuk workflow failed');

  // retry saat output MASIH kosong -> agen harus dijalankan ulang (percobaan ke-2), lalu gagal lagi
  const r1 = await (await fetch(`${BASE_B}/api/workflow/retry`, { method: 'POST' })).json();
  assert.strictEqual(r1.ok, true, r1.error);
  await waitForWorkflow(BASE_B, (w) => w && w.status === 'failed' && w.stages.intake.attempts === 2);
  assert.strictEqual(readCalls(dirB).filter((c) => c.op === 'create').length, 2, 'retry re-run agen saat output belum ada');

  // sekarang "agen" menghasilkan output valid; retry harus MENERIMA tanpa menjalankan ulang intake
  writeFixtures(rootB);
  const r2 = await (await fetch(`${BASE_B}/api/workflow/retry`, { method: 'POST' })).json();
  assert.strictEqual(r2.ok, true, r2.error);
  const wf = await waitForWorkflow(BASE_B, (w) => w && w.status === 'completed', 15000);
  assert.strictEqual(wf.stages.intake.attempts, 2, 'intake tidak dijalankan ulang saat outputnya sudah valid');
  assert.strictEqual(wf.stages.billing.attempts, 1);
  assert.strictEqual(readCalls(dirB).filter((c) => c.op === 'create').length, 4, 'hanya reconciliation+billing di-dispatch setelah retry diterima');
  assert.ok(wf.events.some((e) => e.type === 'retry'));
  assert.ok(wf.events.some((e) => e.type === 'retry' && /tanpa menjalankan ulang agen/.test(e.message)), 'retry harus mencatat penerimaan output tanpa re-run');
});

test('ui: panel workflow & tombol founder tersedia di index.html', async () => {
  const html = await (await fetch(`${BASE_A}/`)).text();
  for (const id of ['wf-panel', 'wf-status', 'wf-stages', 'wf-log', 'wf-start', 'wf-pause', 'wf-stop', 'wf-retry', 'wf-approve']) {
    assert.ok(html.includes(`id="${id}"`), `elemen ${id} hilang`);
  }
});

test('validator: output konsisten lulus; total tagihan salah -> gagal', async () => {
  rootV = fs.mkdtempSync(path.join(os.tmpdir(), 'qwentir-val-'));
  const w = (rel, content) => {
    const abs = path.join(rootV, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  };
  w('data/contracts.json', JSON.stringify({
    tarif_angkut_per_liter: 500,
    harga_produk_per_liter: { Pertalite: 10000, Pertamax: 12000 },
    toleransi_susut_persen: 0.5,
    batas_overdue_pod_hari: 3,
    alias_produk: {},
  }));
  w('data/answer_key.csv', '"order_id","jenis_masalah","hasil_yang_benar"\n'
    + '"DO-001","selisih_di_atas_toleransi","Volume diterima 9.900 L; susut 1,0% > toleransi 0,5%."\n'
    + '"DO-003","order_tanpa_pod","Tidak ada POD; tandai belum lengkap."\n'
    + '"DO-901","pod_orphan","order_id DO-901 tidak ada; POD yatim, tahan untuk klarifikasi."\n');
  for (const f of ['DO-001.txt', 'DO-002.txt', 'DO-003.txt', 'DO-003_copy.txt']) w(`data/orders/${f}`, 'fixture\n');
  for (const f of ['POD-001.txt', 'POD-002.txt', 'POD-901.txt']) w(`data/pods/${f}`, 'fixture\n');
  w('output/intake/orders.json', JSON.stringify([
    { order_id: 'DO-001', produk: 'Pertalite', volume_muat_liter: 10000, tujuan: 'A', tanggal: '2026-11-01', sumber_file: 'data/orders/DO-001.txt', status: 'lengkap' },
    { order_id: 'DO-002', produk: 'Pertamax', volume_muat_liter: 8000, tujuan: 'B', tanggal: '2026-11-02', sumber_file: 'data/orders/DO-002.txt', status: 'lengkap' },
    { order_id: 'DO-003', produk: 'Pertalite', volume_muat_liter: 5000, tujuan: 'C', tanggal: '2026-11-03', sumber_file: 'data/orders/DO-003.txt', status: 'lengkap' },
    { order_id: 'DO-003', produk: 'Pertalite', volume_muat_liter: 5000, tujuan: 'C', tanggal: '2026-11-03', sumber_file: 'data/orders/DO-003_copy.txt', status: 'duplikat' },
  ]));
  w('output/intake/pods.json', JSON.stringify([
    { order_id: 'DO-001', volume_diterima_liter: 9900, penerima: 'R', sumber_file: 'data/pods/POD-001.txt', status: 'lengkap' },
    { order_id: 'DO-002', volume_diterima_liter: 7960, penerima: 'R', sumber_file: 'data/pods/POD-002.txt', status: 'lengkap' },
    { order_id: 'DO-901', volume_diterima_liter: 4000, penerima: 'R', sumber_file: 'data/pods/POD-901.txt', status: 'orphan' },
  ]));
  w('output/intake/laporan.md', 'x');
  w('output/reconciliation/matched.json', JSON.stringify([
    { order_id: 'DO-001', produk: 'Pertalite', volume_muat_liter: 10000, volume_diterima_liter: 9900, susut_liter: 100, susut_persen: 1, within_tolerance: false, kelebihan_liter: 50, status: 'selisih_di_atas_toleransi' },
    { order_id: 'DO-002', produk: 'Pertamax', volume_muat_liter: 8000, volume_diterima_liter: 7960, susut_liter: 40, susut_persen: 0.5, within_tolerance: true, kelebihan_liter: 0, status: 'cocok' },
  ]));
  w('output/reconciliation/issues.json', JSON.stringify([
    { order_id: 'DO-003', sumber: 'data/orders/DO-003.txt', jenis: 'tanpa_pod', alasan: 'POD belum ada', tindakan: 'tahan' },
    { order_id: 'DO-901', sumber: 'data/pods/POD-901.txt', jenis: 'orphan', alasan: 'order tidak ada', tindakan: 'tahan' },
  ]));
  w('output/reconciliation/laporan.md', 'x');
  w('output/billing/invoices.json', JSON.stringify([
    { invoice_id: 'INV-001', order_id: 'DO-001', klien: 'K', produk: 'Pertalite', volume_diterima_liter: 9900, tarif_per_liter: 500, biaya_angkut: 4950000, kelebihan_liter: 50, harga_produk_per_liter: 10000, denda: 500000, total_tagihan: 4450000, status: 'draft' },
    { invoice_id: 'INV-002', order_id: 'DO-002', klien: 'K', produk: 'Pertamax', volume_diterima_liter: 7960, tarif_per_liter: 500, biaya_angkut: 3980000, kelebihan_liter: 0, harga_produk_per_liter: 12000, denda: 0, total_tagihan: 3980000, status: 'draft' },
  ]));
  w('output/billing/rekap_piutang.csv', 'invoice_id,order_id,klien,biaya_angkut,denda,total_tagihan,status\nINV-001,DO-001,K,4950000,500000,4450000,draft\nINV-002,DO-002,K,3980000,0,3980000,draft\n');
  w('output/billing/laporan.md', 'x');

  const good = spawnSync(process.execPath, [VALIDATOR, '--root', rootV], { encoding: 'utf8' });
  assert.strictEqual(good.status, 0, good.stdout + good.stderr);
  assert.match(good.stdout, /LULUS SEMUA CHECK/);
  const report = JSON.parse(fs.readFileSync(path.join(rootV, 'output/workflow/validation_report.json'), 'utf8'));
  assert.strictEqual(report.pass, true);
  assert.strictEqual(report.counts.invoices, 2);
  assert.strictEqual(report.counts.orphan, 1);

  // sabotase: total tagihan salah Rp1 -> validator wajib gagal
  const invRel = path.join(rootV, 'output/billing/invoices.json');
  const inv = JSON.parse(fs.readFileSync(invRel, 'utf8'));
  inv[0].total_tagihan += 1;
  fs.writeFileSync(invRel, JSON.stringify(inv));
  const bad = spawnSync(process.execPath, [VALIDATOR, '--root', rootV], { encoding: 'utf8' });
  assert.strictEqual(bad.status, 1);
  assert.match(bad.stdout, /total 4450001 != 4450000/);
});
