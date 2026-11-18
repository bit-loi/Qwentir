const { Rng } = require('./rng');
const { fmt, pad, dmy, addDays, CARRIER, TRUCKS, DESTS, DEPOTS, RECEIVERS, PRODUCTS } = require('./data');

const TODAY = '2026-11-18';
const KLIENT = 'PT Energi Niaga Utama';

const OVER = { 5: 0.006, 12: 0.01, 19: 0.02, 26: 0.03 };
const INCOMPLETE = { 33: 'volume', 34: 'tujuan', 35: 'produk' };
const NO_POD = [41, 42, 43, 44, 45];
const OVERDUE = { 44: '2026-11-10', 45: '2026-11-12' };
const MESSY = { 8: 'KL', 22: 'ltr' };
const ORDER_DUP = [7, 19, 31];
const POD_DUP = 1;
const ORPHAN = [901, 902];

const ALIASES = {
  Pertalite: ['Pertalite', 'PTL', 'RON 90'],
  Pertamax: ['Pertamax', 'PMX', 'RON 92'],
  Biosolar: ['Biosolar', 'B30', 'Solar'],
  Dexlite: ['Dexlite', 'Dex'],
};

function baseOrder(n, rng) {
  const truck = TRUCKS[(n - 1) % TRUCKS.length];
  const product = PRODUCTS[(n - 1) % PRODUCTS.length];
  const volume = truck.cap;
  let date = addDays('2026-11-01', (n - 1) % 17);
  if (OVERDUE[n]) date = OVERDUE[n];
  if (NO_POD.includes(n) && !OVERDUE[n]) date = addDays(TODAY, -rng.int(1, 2));
  const shrink = rng.int(0, Math.floor(volume * 0.004));
  let received = volume - shrink;
  if (OVER[n]) received = Math.round(volume * (1 - OVER[n]));
  return {
    n,
    id: `DO-${pad(n)}`,
    truck,
    product,
    alias: rng.pick(ALIASES[product]),
    volume,
    received,
    dest: DESTS[(n - 1) % DESTS.length],
    depot: DEPOTS[(n - 1) % DEPOTS.length],
    receiver: RECEIVERS[(n - 1) % RECEIVERS.length],
    date,
    receiveDate: addDays(date, 1),
    style: rng.int(0, 1),
  };
}

function orderText(o, copy) {
  const vol = INCOMPLETE[o.n] === 'volume' ? '' : `${fmt(o.volume)} liter`;
  const dest = INCOMPLETE[o.n] === 'tujuan' ? '' : o.dest;
  const prod = INCOMPLETE[o.n] === 'produk' ? '' : o.alias;
  if (o.style === 0) {
    return [
      'SURAT PERINTAH KIRIM BBM',
      `No. Order   : ${o.id}${copy ? ' (salinan)' : ''}`,
      `Tanggal     : ${dmy(o.date)}`,
      `Klien       : ${KLIENT}`,
      `Transportir : ${CARRIER}`,
      `Produk      : ${prod}`,
      `Volume muat : ${vol}`,
      `Depot asal  : ${o.depot}`,
      `Tujuan      : ${dest}`,
      `Nopol       : ${o.truck.plate}`,
      `Sopir       : ${o.truck.driver}`,
      '',
    ].join('\n');
  }
  return [
    `From: logistik@eneraginiaga.example`,
    `To: ops@nusantarata.ngki.example`,
    `Subject: Kirim ${o.id}${copy ? ' (resi ulang)' : ''}`,
    '',
    `Pak, tolong kirim ${o.id} ya.`,
    `Produk ${prod}, muat ${vol}, dari ${o.depot} ke ${dest}.`,
    `Truk ${o.truck.plate} (${o.truck.driver}), tanggal ${dmy(o.date)}.`,
    'Thanks.',
    '',
  ].join('\n');
}

function podText(o, rng) {
  const messy = MESSY[o.n];
  let volStr;
  if (messy === 'KL') volStr = `${(o.received / 1000).toFixed(3).replace('.', ',')} KL`;
  else if (messy === 'ltr') volStr = `${o.received} ltr`;
  else volStr = `${fmt(o.received)} liter`;
  if (messy) {
    return `DO-${pad(o.n)} brngkas di ${o.dest},, vol ${volStr} ,, ttd ada, penerima ${o.receiver}\n`;
  }
  if (o.style === 0) {
    return `DO-${pad(o.n)} sudah bongkar di ${o.dest}, ${volStr}, sudah ttd + stempel. Penerima: ${o.receiver}. Status: lengkap.\n`;
  }
  return [
    'BERITA ACARA BONGKAR',
    `No. DO        : DO-${pad(o.n)}`,
    `Tanggal terima: ${dmy(o.receiveDate)}`,
    `Volume diterima: ${volStr}`,
    `Penerima      : ${o.receiver}`,
    'Status        : lengkap (ttd + stempel)',
    '',
  ].join('\n');
}

function buildTextDataset(seed) {
  const rng = new Rng(seed + 1);
  const orders = [];
  const pods = [];
  const answer = [];
  const byN = new Map();

  for (let n = 1; n <= 47; n++) {
    const o = baseOrder(n, rng);
    byN.set(n, o);
    orders.push({ file: `${o.id}.txt`, text: orderText(o, false) });
    if (!NO_POD.includes(n)) pods.push({ file: `POD-${pad(n)}.txt`, text: podText(o, rng), id: o.id });

    if (OVER[n]) {
      const susut = o.volume - o.received;
      answer.push([o.id, 'selisih_di_atas_toleransi', `Volume diterima ${fmt(o.received)} L; susut ${(OVER[n] * 100).toFixed(1).replace('.', ',')}% > toleransi 0,5%; hitung denda atas kelebihan liter.`]);
    }
    if (INCOMPLETE[n]) {
      answer.push([o.id, 'order_incomplete', `Field ${INCOMPLETE[n]} kosong pada order; tandai incomplete, jangan menebak nilai.`]);
    }
    if (NO_POD.includes(n)) {
      const od = OVERDUE[n];
      answer.push([o.id, 'order_tanpa_pod', od ? `Tidak ada POD dan sudah overdue (tanggal ${dmy(od)}, > 3 hari).` : 'Tidak ada POD sampai batas waktu; tandai belum lengkap.']);
    }
    if (MESSY[n]) {
      answer.push([o.id, 'pod_berantakan', `POD memakai satuan ${MESSY[n]} dan typo; normalisasi ke liter = ${fmt(o.received)} L.`]);
    }
  }

  for (const n of ORDER_DUP) {
    const o = byN.get(n);
    orders.push({ file: `DO-${pad(n)}_copy.txt`, text: orderText(o, true) });
    answer.push([o.id, 'order_duplikat', `File DO-${pad(n)}_copy.txt duplikat dari DO-${pad(n)}.txt; gabungkan, jangan dihitung dua kali.`]);
  }

  const dupSrc = pods.find((p) => p.id === `DO-${pad(POD_DUP)}`);
  pods.push({ file: `POD-${pad(POD_DUP)}_copy.txt`, text: dupSrc.text, id: dupSrc.id });
  answer.push([dupSrc.id, 'pod_duplikat', `File POD-${pad(POD_DUP)}_copy.txt isi sama dengan POD-${pad(POD_DUP)}.txt; duplikat, abaikan.`]);

  for (const n of ORPHAN) {
    const id = `DO-${pad(n)}`;
    const recv = rng.int(8, 24) * 1000;
    pods.push({ file: `POD-${pad(n)}.txt`, text: `${id} sudah bongkar, ${fmt(recv)} liter, ttd ada. Penerima: ${rng.pick(RECEIVERS)}.\n`, id });
    answer.push([id, 'pod_orphan', `order_id ${id} tidak ada di daftar order; POD yatim, tahan untuk klarifikasi.`]);
  }

  return { orders, pods, answer };
}

module.exports = { buildTextDataset };