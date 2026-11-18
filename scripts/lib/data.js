const CARRIER = 'PT Nusantara Tangki Mandiri';
const ISSUERS = [
  { name: 'PT Energi Niaga Utama', style: 0, city: 'Jakarta', color: '#1f4e9c' },
  { name: 'Depot BBM Tanjung Sekong', style: 1, city: 'Cilegon', color: '#2e6b3f' },
  { name: 'PT Niaga Bahan Bakar Indonesia', style: 2, city: 'Bekasi', color: '#b3541e' },
];
const DEPOTS = ['Depot BBM Tanjung Sekong', 'Depot BBM Muara Karang', 'Depot BBM Cikarang Barat', 'Depot BBM Balonggede'];
const DESTS = [
  'SPBU 34.123.01 Kebon Melati',
  'SPBU 34.205.07 Cibitung',
  'SPBU 34.310.12 Tanjung Duren',
  'SPBU 34.402.03 Pondok Gede',
  'PT Kimia Industri Raya',
  'SPBU 34.508.19 Cileungsi',
  'SPBU 34.611.04 Marunda',
  'PT Plastik Nusantara Jaya',
  'SPBU 34.707.22 Serpong',
  'SPBU 34.815.09 Cikupa',
  'Pabrik Gula Tanjung Sari',
  'PT Tekstil Makmur Abadi',
];
const TRUCKS = [
  { plate: 'B 9123 XYZ', cap: 16000, driver: 'Suparman' },
  { plate: 'B 9456 KLM', cap: 8000, driver: 'Budi Santoso' },
  { plate: 'D 8421 AB', cap: 16000, driver: 'Agus Riyadi' },
  { plate: 'B 9789 TUV', cap: 24000, driver: 'Joko Susilo' },
  { plate: 'F 8123 CD', cap: 8000, driver: 'Hendra Wijaya' },
  { plate: 'B 9234 EFG', cap: 16000, driver: 'Slamet Riyanto' },
  { plate: 'D 8567 HIJ', cap: 24000, driver: 'Dedi Kurniawan' },
  { plate: 'B 9345 NOP', cap: 8000, driver: 'Rahmat Hidayat' },
  { plate: 'T 8234 QR', cap: 16000, driver: 'Yusuf Maulana' },
  { plate: 'B 9567 STU', cap: 24000, driver: 'Bambang Prasetyo' },
  { plate: 'D 8678 VWX', cap: 8000, driver: 'Eko Saputra' },
  { plate: 'B 9678 YZA', cap: 16000, driver: 'Taufik Rahman' },
];
const PRODUCTS = ['Pertalite', 'Pertamax', 'Biosolar', 'Dexlite'];
const ALIAS = { Pertalite: 'PTL', Pertamax: 'PMX', Biosolar: 'B30', Dexlite: 'Dex' };
const RECEIVERS = ['Hendra (operator)', 'Sari (admin)', 'Joko (kepala SPBU)', 'Rina (operator)', 'Yanto (security)', 'Anwar (operator)', 'Dewi (admin)', 'Slamet (kepala SPBU)'];
const PRICE = { Pertalite: 10000, Pertamax: 12500, Biosolar: 6800, Dexlite: 14000 };
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const PHOTO_DO = [4, 11, 18, 25, 32];
const SCAN_DO = [2, 7, 9, 14, 17, 21, 24, 28, 33];
const SCAN_POD = [1, 6, 13, 16, 20, 23, 27, 30, 34, 35];
const SELISIH = { 5: 15904, 12: 7920, 19: 23520, 26: 15520 };
const SELISIH_TRUCK = { 5: 5, 12: 1, 26: 2 };
const MIXED_UNIT = [8, 22];
const TYPO_DO = [10];
const TYPO_PLATE = [24];
const POD_INCOMPLETE = [15, 29];
const HARD_HAND = [3, 21];
const ORDER_INCOMPLETE = { 33: 'volume', 34: 'tujuan', 35: 'produk' };
const DUP_DO = [2, 7, 14, 18, 23, 28, 31, 32];
const PCTS = [0, 0.001, 0.002, 0.003, 0.004];
const QUALITY = ['tilt', 'whatsapp', 'finger', 'blur', 'crop'];

const pad = (n) => String(n).padStart(3, '0');
const pad2 = (n) => String(n).padStart(2, '0');
const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const rupiah = (n) => 'Rp' + fmt(n);
const addDays = (iso, d) => {
  const t = new Date(`${iso}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + d);
  return t.toISOString().slice(0, 10);
};
const parts = (iso) => iso.split('-').map(Number);
const longDate = (iso) => {
  const [y, m, d] = parts(iso);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};
const dmy = (iso) => {
  const [y, m, d] = parts(iso);
  return `${pad2(d)}/${pad2(m)}/${y}`;
};
const dMonY = (iso) => {
  const [y, m, d] = parts(iso);
  return `${pad2(d)}-${MON[m - 1]}-${String(y).slice(2)}`;
};
const dmY2 = (iso) => {
  const [y, m, d] = parts(iso);
  return `${d}/${m}/${String(y).slice(2)}`;
};

function buildDataset() {
  const dos = [];
  for (let n = 1; n <= 35; n++) {
    let truck = TRUCKS[(n - 1) % TRUCKS.length];
    if (SELISIH_TRUCK[n] != null) truck = TRUCKS[SELISIH_TRUCK[n]];
    let volume = truck.cap;
    if ([3, 15, 29].includes(n)) volume = truck.cap - 500;
    if (SELISIH[n] != null) volume = { 5: 16000, 12: 8000, 19: 24000, 26: 16000 }[n];
    const product = PRODUCTS[(n - 1) % PRODUCTS.length];
    const issuer = ISSUERS[(n - 1) % ISSUERS.length];
    const dateISO = `2026-11-${pad2(1 + ((n - 1) * 5) % 17)}`;
    const deliveryISO = addDays(dateISO, 1);
    const hour = ['06:00', '08:00', '13:00'][n % 3];
    const loss = Math.round(volume * PCTS[(n - 1) % PCTS.length]);
    const recv = SELISIH[n] != null ? SELISIH[n] : volume - loss;
    const format = PHOTO_DO.includes(n) ? 'photo' : SCAN_DO.includes(n) ? 'scan' : 'digital';
    const missing = ORDER_INCOMPLETE[n] ? [ORDER_INCOMPLETE[n]] : [];
    const printedDo = [ `DO-${pad(n)}`, `DO/${pad(n)}/XI/2026`, `No. ${pad(n)}-ENU` ][issuer.style];
    const printedDate = [longDate(dateISO), dmy(dateISO), dMonY(dateISO)][issuer.style];
    dos.push({
      n, id: `DO-${pad(n)}`, truck, volume, product,
      dest: DESTS[(n - 1) % DESTS.length],
      depot: DEPOTS[(n - 1) % DEPOTS.length],
      issuer, dateISO, deliveryISO,
      schedule: `${dmy(deliveryISO)} ${hour} WIB`,
      format, missing, printedDo, printedDate, recv,
      receiver: RECEIVERS[(n - 1) % RECEIVERS.length],
    });
  }

  const pods = [];
  for (const d of dos) {
    const n = d.n;
    const isScan = SCAN_POD.includes(n);
    const ext = isScan ? 'pdf' : 'jpg';
    let recvDisplay = `${fmt(d.recv)} liter`;
    if (MIXED_UNIT.includes(n)) {
      recvDisplay = n === 8 ? `${(d.recv / 1000).toFixed(2).replace('.', ',')} KL` : `${fmt(d.recv)} ltr`;
    }
    let printedDo = d.printedDo;
    if (TYPO_DO.includes(n)) printedDo = `DO-0l0`;
    let plate = d.truck.plate;
    if (TYPO_PLATE.includes(n)) plate = plate.replace('1', 'l');
    const pod = {
      doN: n, id: d.id, fileBase: `POD-DO-${pad(n)}`, ext,
      format: isScan ? 'scan' : 'jpg',
      quality: QUALITY[(n - 1) % QUALITY.length],
      printedDo, printedDate: dmY2(d.deliveryISO),
      dest: d.dest,
      product: n % 3 === 0 ? ALIAS[d.product] : d.product,
      volumeDo: d.volume, volumeRecv: d.recv, recvDisplay,
      plate, driver: d.truck.driver, receiver: d.receiver,
      hasStamp: !POD_INCOMPLETE.includes(n),
      hasSignature: !POD_INCOMPLETE.includes(n),
      hard: HARD_HAND.includes(n),
      orphan: false, duplicateOf: null,
      orderIncomplete: !!ORDER_INCOMPLETE[n],
      selisih: SELISIH[n] != null,
      mixedUnit: MIXED_UNIT.includes(n),
      typoDo: TYPO_DO.includes(n),
      typoPlate: TYPO_PLATE.includes(n),
      podIncomplete: POD_INCOMPLETE.includes(n),
    };
    pods.push(pod);
  }

  const orphans = [
    { id: 'DO-036', recv: 7500, dest: 'SPBU 34.901.05 Bintaro', product: 'Biosolar', plate: 'B 9812 KLM', driver: 'Iwan Setiawan', receiver: 'Fajar (operator)' },
    { id: 'DO-037', recv: 10000, dest: 'PT Kimia Industri Raya', product: 'Pertamax', plate: 'D 8901 AB', driver: 'Rizki Ramadhan', receiver: 'Dewi (admin)' },
  ];
  orphans.forEach((o, i) => {
    pods.push({
      doN: null, id: o.id, fileBase: `POD-DO-${pad(36 + i)}`, ext: 'jpg',
      format: 'jpg', quality: i === 0 ? 'tilt' : 'whatsapp',
      printedDo: o.id, printedDate: '16/11/26',
      dest: o.dest, product: o.product, volumeDo: o.recv, volumeRecv: o.recv,
      recvDisplay: `${fmt(o.recv)} liter`, plate: o.plate, driver: o.driver, receiver: o.receiver,
      hasStamp: true, hasSignature: true, hard: false,
      orphan: true, duplicateOf: null, orderIncomplete: false,
      selisih: false, mixedUnit: false, typoDo: false, typoPlate: false, podIncomplete: false,
    });
  });

  DUP_DO.forEach((n, i) => {
    const orig = pods.find((p) => p.doN === n);
    pods.push({
      ...orig,
      fileBase: `IMG-202611${pad2(10 + i)}-WA${String(100 + i).padStart(4, '0')}`,
      duplicateOf: `${orig.fileBase}.${orig.ext}`,
    });
  });

  const rekapTypos = [
    { n: 4, field: 'volume_pod', wrong: (v) => String(v).replace(/(\d)(\d)$/, '$2$1') },
    { n: 9, field: 'nopol', wrong: (v) => v.replace(/([A-Z])([A-Z])$/, '$2$1') },
    { n: 16, field: 'tanggal', wrong: (v) => v.replace(/^(\d\d)/, (m) => pad2(Number(m) + 1)) },
    { n: 27, field: 'volume_do', wrong: (v) => String(Math.round(v / 10)) },
    { n: 30, field: 'produk', wrong: () => 'Pertalite' },
  ];
  const rekap = dos.map((d) => {
    const row = {
      no_do: d.id, tanggal: dmy(d.dateISO), produk: d.product,
      volume_do: d.volume, volume_pod: d.recv, nopol: d.truck.plate, sopir: d.truck.driver,
      status_admin: SELISIH[d.n] != null ? 'selisih' : 'cocok',
    };
    const t = rekapTypos.find((x) => x.n === d.n);
    if (t) row[t.field] = t.wrong(row[t.field]);
    return row;
  });

  const answerRows = [];
  const push = (file, jenis, doBenar, vol, status, alasan) => answerRows.push({ file, jenis, do_benar: doBenar, volume_sebenarnya_liter: vol, status, alasan });

  for (const d of dos) {
    const ext = d.format === 'photo' ? 'jpg' : 'pdf';
    const status = d.missing.length ? 'incomplete' : 'normal';
    const alasan = d.missing.length
      ? `Field ${d.missing.join(', ')} kosong di dokumen; tandai incomplete, jangan ditebak.`
      : `DO lengkap; volume muat ${fmt(d.volume)} L; produk ${d.product}.`;
    push(`do/${d.id}.${ext}`, 'do', d.id, d.volume, status, alasan);
  }

  for (const p of pods) {
    const file = `pod/${p.fileBase}.${p.ext}`;
    let status = 'normal';
    let alasan = `POD cocok dengan DO; volume diterima ${fmt(p.volumeRecv)} L.`;
    if (p.duplicateOf) {
      status = 'duplikat';
      alasan = `Byte identik dengan ${p.duplicateOf}; foto sama dikirim dua kali, proses sekali.`;
    } else if (p.orphan) {
      status = 'orphan';
      alasan = `Nomor DO ${p.id} tidak ada di daftar DO; POD yatim, jangan dibuatkan invoice.`;
    } else if (p.podIncomplete) {
      status = 'incomplete';
      alasan = 'Tanda tangan dan stempel penerima tidak ada; POD incomplete.';
    } else if (p.selisih) {
      const d = dos.find((x) => x.n === p.doN);
      const loss = d.volume - p.volumeRecv;
      const pct = ((loss / d.volume) * 100).toFixed(2).replace('.', ',');
      const allow = Math.round(d.volume * 0.005);
      const excess = loss - allow;
      const denda = excess * PRICE[d.product];
      status = 'selisih_volume';
      alasan = `Susut ${fmt(loss)} L (${pct}%) > toleransi ${fmt(allow)} L; kelebihan ${fmt(excess)} L x ${rupiah(PRICE[d.product])} = ${rupiah(denda)} dipotong dari invoice.`;
    } else if (p.typoDo) {
      status = 'typo';
      alasan = `Nomor DO tertulis "${p.printedDo}" (huruf l), seharusnya ${p.id}.`;
    } else if (p.typoPlate) {
      status = 'typo';
      alasan = `Nopol tertulis "${p.plate}" (huruf l), seharusnya ${dos.find((x) => x.n === p.doN).truck.plate}.`;
    } else if (p.mixedUnit) {
      status = 'typo';
      alasan = `Satuan tertulis "${p.recvDisplay}"; konversi benar = ${fmt(p.volumeRecv)} L.`;
    } else if (p.hard) {
      status = 'normal';
      alasan = `Tulisan tangan sulit dibaca; volume sebenarnya ${fmt(p.volumeRecv)} L; agent wajib lapor confidence rendah.`;
    } else if (p.orderIncomplete) {
      status = 'normal';
      alasan = 'POD tampak lengkap secara visual, tetapi order incomplete; agent harus berhenti dan tidak menebak dari POD.';
    } else {
      const d = dos.find((x) => x.n === p.doN);
      const loss = d.volume - p.volumeRecv;
      const pct = ((loss / d.volume) * 100).toFixed(2).replace('.', ',');
      alasan = `POD cocok dengan DO; selisih ${fmt(loss)} L (${pct}%) dalam toleransi 0,5%.`;
    }
    push(file, 'pod', p.id, p.volumeRecv, status, alasan);
  }

  push('rekap_admin.csv', 'rekap', '-', '-', 'typo',
    'Salah ketik admin: DO-004 volume_pod digit tertukar; DO-009 nopol dua huruf akhir tertukar; DO-016 tanggal +1 hari; DO-027 volume_do kurang nol; DO-030 produk salah. Bandingkan dengan dokumen asli.');

  const contracts = {
    nomor_kontrak: 'ENU-NTM/2026/001',
    klien: 'PT Energi Niaga Utama',
    transportir: CARRIER,
    periode_kontrak: '2026-01-01 s.d. 2026-12-31',
    toleransi_susut_persen: 0.5,
    tarif_angkut_per_liter: 500,
    harga_produk_per_liter: PRICE,
    alias_produk: { PTL: 'Pertalite', PMX: 'Pertamax', B30: 'Biosolar', Dex: 'Dexlite', 'RON 90': 'Pertalite', 'RON 92': 'Pertamax', Solar: 'Biosolar', SOL: 'Biosolar' },
    aturan_denda: {
      dasar: 'susut di atas toleransi dihitung sebagai kelebihan liter',
      kelebihan_liter: 'susut_liter - (volume_muat_liter x toleransi_susut_persen / 100)',
      denda: 'kelebihan_liter x harga_produk_per_liter',
      penerapan: 'dipotong dari invoice',
    },
    batas_overdue_pod_hari: 3,
  };

  return { dos, pods, rekap, rekapTypos, answerRows, contracts, CARRIER };
}

module.exports = { buildDataset, fmt, rupiah, pad, longDate, dmy, dMonY, dmY2, addDays, CARRIER, PRICE, TRUCKS, DESTS, RECEIVERS, PRODUCTS, DEPOTS };
