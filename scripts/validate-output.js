#!/usr/bin/env node
/* Qwentir — validator bisnis independen untuk output pipeline.
   Memverifikasi output agent (output/intake|reconciliation|billing) terhadap:
     - kontrak schema di agents/*-bible.md
     - aturan komersial di data/contracts.json (tarif, toleransi susut, denda)
     - ground truth data/answer_key.csv (HANYA untuk validasi, tidak pernah
       dibaca oleh agent)
   Dipakai sebagai bukti end-to-end test: `node scripts/validate-output.js`.
   Exit code: 0 = semua check lulus, 1 = ada check gagal, 2 = output belum ada.
   Laporan JSON ditulis ke output/workflow/validation_report.json. */
'use strict';

const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const rootIdx = argv.indexOf('--root');
const ROOT = path.resolve(rootIdx >= 0 ? argv[rootIdx + 1] : path.resolve(__dirname, '..'));

function readJson(rel) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); } catch (_) { return undefined; }
}
function readText(rel) {
  try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch (_) { return undefined; }
}
function listFiles(rel) {
  try { return fs.readdirSync(path.join(ROOT, rel)).filter((f) => /\.(txt|pdf|jpg|jpeg|png)$/i.test(f)).map((f) => `${rel}/${f}`); } catch (_) { return []; }
}
function parseCsv(text) {
  // parser CSV sadar-kutip: field boleh dikutip "..." dan memuat koma/desimal koma
  const s = String(text || '');
  const rows = [];
  let row = []; let cur = ''; let q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  const clean = rows.filter((r) => r.some((x) => String(x).trim() !== ''));
  if (!clean.length) return [];
  const head = clean[0].map((h) => h.trim());
  return clean.slice(1).map((cols) => {
    const obj = {};
    head.forEach((h, i) => { obj[h] = (cols[i] || '').trim(); });
    return obj;
  });
}
const round2 = (n) => Math.round(Number(n) * 100) / 100;

const contracts = readJson('data/contracts.json');
const answerKey = parseCsv(readText('data/answer_key.csv'));
const orders = readJson('output/intake/orders.json');
const pods = readJson('output/intake/pods.json');
const matched = readJson('output/reconciliation/matched.json');
const issues = readJson('output/reconciliation/issues.json');
const invoices = readJson('output/billing/invoices.json');
const rekapText = readText('output/billing/rekap_piutang.csv');

if (!contracts) { console.error('VALIDATOR: data/contracts.json tidak terbaca'); process.exit(2); }
if (!Array.isArray(orders) || !Array.isArray(pods) || !Array.isArray(matched) || !Array.isArray(invoices)) {
  console.error('VALIDATOR: output pipeline belum lengkap (intake/reconciliation/billing) — jalankan workflow dulu.');
  process.exit(2);
}

const checks = [];
function check(name, ok, detail) { checks.push({ name, ok: !!ok, detail: detail || '' }); }

/* ---- 1. cakupan intake: tiap file input jadi record (duplikat tetap tercatat) ---- */
const orderFiles = [...listFiles('data/orders'), ...listFiles('output/do')];
const podFiles = [...listFiles('data/pods'), ...listFiles('output/pod')];
check(
  'intake: jumlah record orders = jumlah file order input',
  orderFiles.length === orders.length,
  `file=${orderFiles.length} record=${orders.length}`,
);
check(
  'intake: jumlah record pods = jumlah file POD input',
  podFiles.length === pods.length,
  `file=${podFiles.length} record=${pods.length}`,
);

/* ---- 2. klasifikasi & hasil vs answer_key (schema asli: order_id,jenis_masalah,hasil_yang_benar) ---- */
const matchedByOrder = new Map((matched || []).map((m) => [m.order_id, m]));
const ordersById = (id) => (orders || []).filter((o) => o.order_id === id);
const podsById = (id) => (pods || []).filter((p) => p.order_id === id);
const issuesById = (id) => (issues || []).filter((i) => i.order_id === id);
const matchedCountById = (id) => (matched || []).filter((m) => m.order_id === id).length;
const firstNum = (str) => { const m = String(str || '').match(/-?\d[\d.]*/); return m ? Number(m[0].replace(/\./g, '')) : NaN; };
const keyProblems = [];
for (const row of answerKey) {
  const id = row.order_id; const jenis = row.jenis_masalah; const teks = row.hasil_yang_benar || '';
  if (!id || !jenis) continue;
  if (jenis === 'selisih_di_atas_toleransi') {
    const m = matchedByOrder.get(id);
    const exp = firstNum((teks.match(/diterima\s*([\d.]+)/) || [])[1]);
    if (!m) keyProblems.push(`${id}: selisih diharapkan tapi tidak ada di matched.json`);
    else if (m.status !== 'selisih_di_atas_toleransi') keyProblems.push(`${id}: status ${m.status} != selisih_di_atas_toleransi`);
    else if (Number.isFinite(exp) && Number(m.volume_diterima_liter) !== exp) keyProblems.push(`${id}: volume_diterima ${m.volume_diterima_liter} != kunci ${exp}`);
  } else if (jenis === 'pod_berantakan') {
    const p = podsById(id).find((x) => x.status !== 'duplikat' && x.status !== 'orphan');
    const exp = firstNum((teks.match(/=\s*([\d.]+)/) || [])[1]);
    if (!p) keyProblems.push(`${id}: pod_berantakan diharapkan tapi tidak ada pod`);
    else if (Number.isFinite(exp) && Number(p.volume_diterima_liter) !== exp) keyProblems.push(`${id}: normalisasi volume ${p.volume_diterima_liter} != kunci ${exp}`);
  } else if (jenis === 'order_incomplete') {
    const o = ordersById(id).find((x) => x.status === 'incomplete');
    const field = /volume/i.test(teks) ? 'volume_muat_liter' : /tujuan/i.test(teks) ? 'tujuan' : /produk/i.test(teks) ? 'produk' : null;
    if (!o) keyProblems.push(`${id}: order_incomplete diharapkan tapi tidak ada record incomplete`);
    else if (field && !(o.field_kosong || []).includes(field)) keyProblems.push(`${id}: field_kosong ${(o.field_kosong || []).join(',')} tidak memuat ${field}`);
  } else if (jenis === 'order_tanpa_pod') {
    const iss = issuesById(id);
    if (!iss.some((i) => /tanpa_pod|overdue|belum_lengkap|pod/i.test(i.jenis || ''))) {
      keyProblems.push(`${id}: order_tanpa_pod diharapkan tapi tidak ada issue terkait (${iss.map((i) => i.jenis).join(',') || 'kosong'})`);
    }
  } else if (jenis === 'order_duplikat') {
    const dup = ordersById(id).filter((o) => o.status === 'duplikat');
    if (!dup.length) keyProblems.push(`${id}: order_duplikat diharapkan tapi tidak ada record duplikat`);
    if (matchedCountById(id) > 1) keyProblems.push(`${id}: duplikat terhitung ${matchedCountById(id)}x di matched (harus 1)`);
  } else if (jenis === 'pod_duplikat') {
    const dup = podsById(id).filter((p) => p.status === 'duplikat');
    if (!dup.length) keyProblems.push(`${id}: pod_duplikat diharapkan tapi tidak ada pod duplikat`);
  } else if (jenis === 'pod_orphan') {
    const orph = podsById(id).filter((p) => p.status === 'orphan');
    if (!orph.length) keyProblems.push(`${id}: pod_orphan diharapkan tapi tidak ada pod orphan`);
    if (!issuesById(id).some((i) => /orphan|yatim/i.test(i.jenis || ''))) keyProblems.push(`${id}: orphan tanpa issue`);
  } else {
    keyProblems.push(`${id}: jenis_masalah tak dikenal validator: ${jenis}`);
  }
}
check('answer_key: klasifikasi & hasil intake/reconciliation sesuai kunci', keyProblems.length === 0, keyProblems.join('; '));

/* ---- 3. hitungan reconciliation vs contracts.json ---- */
const tol = Number(contracts.toleransi_susut_persen);
const orderById = new Map((orders || []).map((o) => [o.order_id, o]));
const podById = new Map();
for (const p of pods || []) if (p.status !== 'orphan' && !podById.has(p.order_id)) podById.set(p.order_id, p);
const reconProblems = [];
for (const m of matched || []) {
  const susut = Number(m.volume_muat_liter) - Number(m.volume_diterima_liter);
  const persen = round2((susut / Number(m.volume_muat_liter)) * 100);
  const within = persen <= tol;
  const kelebihan = Math.max(0, susut - (Number(m.volume_muat_liter) * tol) / 100);
  if (round2(m.susut_liter) !== round2(susut)) reconProblems.push(`${m.order_id}: susut_liter ${m.susut_liter} != ${susut}`);
  if (round2(m.susut_persen) !== persen) reconProblems.push(`${m.order_id}: susut_persen ${m.susut_persen} != ${persen}`);
  if (Boolean(m.within_tolerance) !== within) reconProblems.push(`${m.order_id}: within_tolerance ${m.within_tolerance} != ${within}`);
  if (round2(m.kelebihan_liter) !== round2(kelebihan)) reconProblems.push(`${m.order_id}: kelebihan_liter ${m.kelebihan_liter} != ${kelebihan}`);
  const want = within ? 'cocok' : 'selisih_di_atas_toleransi';
  if (m.status !== want) reconProblems.push(`${m.order_id}: status ${m.status} != ${want}`);
}
check('reconciliation: susut, toleransi, dan kelebihan liter sesuai contracts.json', reconProblems.length === 0, reconProblems.join('; '));

/* ---- 4. kelengkapan issues.json (hold tidak boleh bocor) ---- */
const issueKeys = new Set((issues || []).map((i) => `${i.order_id}|${i.jenis}`));
const issueProblems = [];
for (const o of orders || []) {
  if (o.status === 'incomplete' && !issueKeys.has(`${o.order_id}|order_incomplete`)) issueProblems.push(`${o.order_id}: incomplete tanpa issue`);
}
for (const p of pods || []) {
  if (p.status === 'incomplete' && !issueKeys.has(`${p.order_id}|pod_incomplete`)) issueProblems.push(`${p.order_id}: pod incomplete tanpa issue`);
  if (p.status === 'orphan' && !issueKeys.has(`${p.order_id}|orphan`)) issueProblems.push(`${p.order_id}: orphan tanpa issue`);
}
for (const o of orders || []) {
  if (o.status === 'duplikat') continue;
  const hasPod = (pods || []).some((p) => p.order_id === o.order_id && p.status !== 'orphan' && p.status !== 'incomplete');
  if (!hasPod && !([...issueKeys].some((k) => k.startsWith(`${o.order_id}|tanpa_pod`) || k.startsWith(`${o.order_id}|overdue`)))) {
    issueProblems.push(`${o.order_id}: tanpa POD tapi tidak di-issues`);
  }
}
check('reconciliation: semua dokumen tertahan tercatat di issues.json', issueProblems.length === 0, issueProblems.join('; '));

/* ---- 5. hitungan billing vs contracts.json ---- */
const tarif = Number(contracts.tarif_angkut_per_liter);
const hargaProduk = contracts.harga_produk_per_liter || {};
const billProblems = [];
for (const inv of invoices || []) {
  const m = matchedByOrder.get(inv.order_id);
  if (!m) { billProblems.push(`${inv.invoice_id}: order ${inv.order_id} tidak ada di matched`); continue; }
  const angkut = Number(m.volume_diterima_liter) * tarif;
  const harga = Number(hargaProduk[m.produk] || 0);
  const denda = Math.round(Number(m.kelebihan_liter) * harga);
  const total = Math.max(0, angkut - denda);
  if (Number(inv.biaya_angkut) !== angkut) billProblems.push(`${inv.invoice_id}: biaya_angkut ${inv.biaya_angkut} != ${angkut}`);
  if (Number(inv.denda) !== denda) billProblems.push(`${inv.invoice_id}: denda ${inv.denda} != ${denda}`);
  if (Number(inv.total_tagihan) !== total) billProblems.push(`${inv.invoice_id}: total ${inv.total_tagihan} != ${total}`);
  if (!Number.isInteger(inv.total_tagihan)) billProblems.push(`${inv.invoice_id}: total bukan integer Rupiah`);
}
if ((invoices || []).length !== (matched || []).length) {
  billProblems.push(`jumlah invoice ${invoices.length} != matched ${matched.length}`);
}
check('billing: biaya angkut, denda, dan total tagihan sesuai contracts.json', billProblems.length === 0, billProblems.join('; '));

/* ---- 6. dokumen tertahan tidak boleh ditagih ---- */
const heldOrders = new Set((issues || [])
  .filter((i) => ['order_incomplete', 'pod_incomplete', 'orphan', 'tanpa_pod', 'overdue'].includes(i.jenis))
  .map((i) => i.order_id));
const billedHeld = (invoices || []).filter((v) => heldOrders.has(v.order_id)).map((v) => v.invoice_id);
check('billing: dokumen tertahan tidak dibuatkan invoice', billedHeld.length === 0, billedHeld.join(', '));

/* ---- 7. rekap_piutang.csv konsisten ---- */
const rekap = parseCsv(rekapText);
const rekapOk = rekap.length === invoices.length
  && rekap.every((r) => {
    const inv = (invoices || []).find((v) => v.invoice_id === r.invoice_id);
    return inv && Number(r.total_tagihan) === Number(inv.total_tagihan) && r.status === inv.status;
  });
check('billing: rekap_piutang.csv konsisten dengan invoices.json', rekapOk, `baris=${rekap.length} invoice=${invoices.length}`);

/* ---- laporan ---- */
const counts = {
  order_files: orderFiles.length,
  pod_files: podFiles.length,
  orders_records: orders.length,
  pods_records: pods.length,
  duplikat: (orders || []).filter((o) => o.status === 'duplikat').length
    + (pods || []).filter((p) => p.status === 'duplikat').length,
  incomplete: (orders || []).filter((o) => o.status === 'incomplete').length
    + (pods || []).filter((p) => p.status === 'incomplete').length,
  orphan: (pods || []).filter((p) => p.status === 'orphan').length,
  matched_cocok: (matched || []).filter((m) => m.status === 'cocok').length,
  matched_selisih: (matched || []).filter((m) => m.status === 'selisih_di_atas_toleransi').length,
  issues: (issues || []).length,
  invoices: invoices.length,
  invoice_draft: invoices.filter((v) => v.status === 'draft').length,
  invoice_approved: invoices.filter((v) => v.status === 'approved').length,
  total_piutang: invoices.reduce((s, v) => s + (Number(v.total_tagihan) || 0), 0),
  answer_key_rows: answerKey.length,
};
const pass = checks.every((c) => c.ok);
const report = { root: ROOT, generatedAt: new Date().toISOString(), pass, counts, checks };
fs.mkdirSync(path.join(ROOT, 'output', 'workflow'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'output', 'workflow', 'validation_report.json'), JSON.stringify(report, null, 2));

console.log(`QWENTIR VALIDATOR — ${ROOT}`);
for (const c of checks) console.log(`  [${c.ok ? 'PASS' : 'FAIL'}] ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
console.log(`  counts: ${JSON.stringify(counts)}`);
console.log(pass ? 'HASIL: LULUS SEMUA CHECK' : 'HASIL: ADA CHECK GAGAL');
process.exit(pass ? 0 : 1);
