const fs = require('fs');
const path = require('path');
const { Rng } = require('./lib/rng');
const { buildDataset } = require('./lib/data');
const { buildTextDataset } = require('./lib/textdata');
const { renderDo, renderPod } = require('./lib/render');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'output');
const DO_DIR = path.join(OUT, 'do');
const POD_DIR = path.join(OUT, 'pod');
const DATA_DIR = path.join(ROOT, 'data');
const SEED = 20261118;

function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
}
function cleanDir(d) {
  ensureDir(d);
  for (const f of fs.readdirSync(d)) {
    if (/\.(pdf|jpg|png)$/i.test(f)) fs.unlinkSync(path.join(d, f));
  }
}
const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
const csv = (rows) => rows.map((r) => r.map(esc).join(',')).join('\n') + '\n';

async function main() {
  const rng = new Rng(SEED);
  const { dos, pods, rekap, answerRows, contracts } = buildDataset();

  cleanDir(DO_DIR);
  cleanDir(POD_DIR);
  ensureDir(DATA_DIR);
  for (const f of ['_smoke.png', '_smoke.jpg']) {
    const p = path.join(OUT, f);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  for (const d of dos) {
    const { buffer, ext } = await renderDo(d, rng);
    fs.writeFileSync(path.join(DO_DIR, `${d.id}.${ext}`), buffer);
  }

  const podBuffers = new Map();
  for (const p of pods) {
    const name = `${p.fileBase}.${p.ext}`;
    let buffer;
    if (p.duplicateOf) {
      buffer = podBuffers.get(p.duplicateOf);
    } else {
      const r = await renderPod(p, rng);
      buffer = r.buffer;
      podBuffers.set(name, buffer);
    }
    fs.writeFileSync(path.join(POD_DIR, name), buffer);
  }

  const rekapHeader = ['no_do', 'tanggal', 'produk', 'volume_do', 'volume_pod', 'nopol', 'sopir', 'status_admin'];
  fs.writeFileSync(path.join(OUT, 'rekap_admin.csv'), csv([rekapHeader, ...rekap.map((r) => rekapHeader.map((k) => r[k]))]), 'utf8');

  const answerHeader = ['file', 'jenis', 'do_benar', 'volume_sebenarnya_liter', 'status', 'alasan'];
  fs.writeFileSync(path.join(OUT, 'answer_key.csv'), csv([answerHeader, ...answerRows.map((r) => answerHeader.map((k) => r[k]))]), 'utf8');

  fs.writeFileSync(path.join(DATA_DIR, 'contracts.json'), JSON.stringify(contracts, null, 2) + '\n', 'utf8');

  const ORDER_DIR = path.join(DATA_DIR, 'orders');
  const PODTXT_DIR = path.join(DATA_DIR, 'pods');
  const cleanTxt = (d) => {
    ensureDir(d);
    for (const f of fs.readdirSync(d)) if (/\.txt$/i.test(f)) fs.unlinkSync(path.join(d, f));
  };
  cleanTxt(ORDER_DIR);
  cleanTxt(PODTXT_DIR);
  const text = buildTextDataset(SEED);
  for (const o of text.orders) fs.writeFileSync(path.join(ORDER_DIR, o.file), o.text, 'utf8');
  for (const p of text.pods) fs.writeFileSync(path.join(PODTXT_DIR, p.file), p.text, 'utf8');
  const textAnswerHeader = ['order_id', 'jenis_masalah', 'hasil_yang_benar'];
  fs.writeFileSync(path.join(DATA_DIR, 'answer_key.csv'), csv([textAnswerHeader, ...text.answer]), 'utf8');

  const doFiles = fs.readdirSync(DO_DIR);
  const podFiles = fs.readdirSync(POD_DIR);
  const count = (arr, fn) => arr.filter(fn).length;
  const byStatus = {};
  for (const r of answerRows) byStatus[r.status] = (byStatus[r.status] || 0) + 1;

  console.log('=== RINGKASAN DATASET DOKUMEN QWENTIR ===');
  console.log(`seed: ${SEED}`);
  console.log(`output/do  : ${doFiles.length} file`);
  console.log(`  - PDF digital bersih : ${count(dos, (d) => d.format === 'digital')}`);
  console.log(`  - PDF scan           : ${count(dos, (d) => d.format === 'scan')}`);
  console.log(`  - JPG foto HP        : ${count(dos, (d) => d.format === 'photo')}`);
  console.log(`output/pod : ${podFiles.length} file`);
  console.log(`  - JPG foto/WA        : ${count(podFiles, (f) => f.endsWith('.jpg'))}`);
  console.log(`  - PDF scan           : ${count(podFiles, (f) => f.endsWith('.pdf'))}`);
  console.log(`  - duplikat (byte sama): ${count(pods, (p) => p.duplicateOf)}`);
  console.log(`  - orphan             : ${count(pods, (p) => p.orphan)}`);
  console.log(`output/rekap_admin.csv : 1 file (${rekap.length} baris, 5 salah ketik)`);
  console.log(`output/answer_key.csv  : ${answerRows.length} baris`);
  console.log(`data/contracts.json    : 1 file`);
  console.log('status answer_key:', byStatus);

  const txtByType = {};
  for (const r of text.answer) txtByType[r[1]] = (txtByType[r[1]] || 0) + 1;
  console.log('=== RINGKASAN DATASET TEKS QWENTIR ===');
  console.log(`data/orders : ${text.orders.length} file`);
  console.log(`data/pods   : ${text.pods.length} file`);
  console.log(`data/answer_key.csv : ${text.answer.length} baris`);
  console.log('masalah per jenis:', txtByType);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
