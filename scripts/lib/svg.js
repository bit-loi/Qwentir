const { fmt } = require('./data');

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const HAND = ['Caveat', 'Patrick Hand', 'Kalam'];
const INK = ['#1a3a8a', '#20242c', '#173a7a'];

function signaturePath(rng, x, y, w, h) {
  let d = `M ${x} ${y + h * 0.6}`;
  const steps = 6;
  for (let i = 0; i < steps; i++) {
    const c1x = x + w * (i / steps) + rng.float(-12, 12);
    const c1y = y + rng.float(0, h);
    const c2x = x + w * ((i + 0.5) / steps) + rng.float(-12, 12);
    const c2y = y + rng.float(0, h);
    const ex = x + w * ((i + 1) / steps);
    const ey = y + h * rng.float(0.3, 0.7);
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${ex.toFixed(1)} ${ey.toFixed(1)}`;
  }
  d += ` q ${(w * 0.12).toFixed(1)} ${(h * 0.4).toFixed(1)} ${(w * 0.22).toFixed(1)} ${(-h * 0.12).toFixed(1)}`;
  const lx = x + w * 0.55, ly = y + h * 0.5;
  d += ` M ${lx.toFixed(1)} ${ly.toFixed(1)} c ${(w * 0.06).toFixed(1)} ${(-h * 0.55).toFixed(1)} ${(w * 0.2).toFixed(1)} ${(-h * 0.5).toFixed(1)} ${(w * 0.16).toFixed(1)} ${(-h * 0.05).toFixed(1)}`;
  d += ` c ${(-w * 0.03).toFixed(1)} ${(h * 0.4).toFixed(1)} ${(-w * 0.16).toFixed(1)} ${(h * 0.4).toFixed(1)} ${(-w * 0.13).toFixed(1)} ${(h * 0.05).toFixed(1)}`;
  d += ` M ${(x + w * 0.2).toFixed(1)} ${(y + h * 0.75).toFixed(1)} L ${(x + w * 0.75).toFixed(1)} ${(y + h * 0.25).toFixed(1)}`;
  return d;
}

function signatureEl(rng, x, y, w, h, color) {
  return `<path d="${signaturePath(rng, x, y, w, h)}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" opacity="0.85"/>`;
}

function stampGroup(rng, cx, cy, color, lines, square) {
  const rot = rng.float(-12, 12).toFixed(1);
  const inner = square
    ? `<rect x="${cx - 95}" y="${cy - 62}" width="190" height="124" rx="10" fill="none" stroke="${color}" stroke-width="4"/>
       <rect x="${cx - 84}" y="${cy - 51}" width="168" height="102" rx="6" fill="none" stroke="${color}" stroke-width="1.6"/>`
    : `<circle cx="${cx}" cy="${cy}" r="92" fill="none" stroke="${color}" stroke-width="4"/>
       <circle cx="${cx}" cy="${cy}" r="76" fill="none" stroke="${color}" stroke-width="1.6"/>`;
  const texts = lines.map((t, i) => {
    const dy = (i - (lines.length - 1) / 2) * 30;
    const size = i === Math.floor(lines.length / 2) ? 24 : 15;
    return `<text x="${cx}" y="${cy + dy + 6}" text-anchor="middle" font-family="PT Sans" font-size="${size}" font-weight="bold" fill="${color}">${esc(t)}</text>`;
  }).join('');
  return `<g transform="rotate(${rot} ${cx} ${cy})" opacity="0.72">${inner}${texts}</g>`;
}

function stampSvg(p, rng) {
  const color = p.orphan ? '#8a1f1f' : '#1f4e9c';
  const lines = p.orphan
    ? [p.dest.split(' ').slice(0, 3).join(' '), 'DITERIMA', p.printedDate]
    : [p.dest.startsWith('SPBU') ? p.dest.split(' ')[1] : p.dest.split(' ').slice(0, 2).join(' '), 'DITERIMA', p.printedDate];
  const square = p.doN != null && p.doN % 2 === 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">${stampGroup(rng, 120, 120, color, lines, square)}</svg>`;
}

function shadowSvg(w, h) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs><radialGradient id="f" cx="0.12" cy="0.9" r="0.55">
      <stop offset="0" stop-color="#000" stop-opacity="0.4"/>
      <stop offset="0.6" stop-color="#000" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#000" stop-opacity="0"/>
    </radialGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#f)"/>
    <ellipse cx="${w * 0.1}" cy="${h * 0.94}" rx="${w * 0.12}" ry="${h * 0.05}" fill="#3a2a1a" opacity="0.35"/>
  </svg>`;
}

function doFields(d) {
  return [
    ['Tujuan', d.missing.includes('tujuan') ? '' : d.dest],
    ['Produk', d.missing.includes('produk') ? '' : d.product],
    ['Volume Muat', d.missing.includes('volume') ? '' : `${fmt(d.volume)} liter`],
    ['Depot Asal', d.depot],
    ['Nopol Truk', d.truck.plate],
    ['Nama Sopir', d.truck.driver],
  ];
}

function doSvg(d, rng) {
  const c = d.issuer.color;
  const fields = doFields(d);
  const sig = signatureEl(rng, 100, 980, 200, 80, '#20242c');
  const stamp = stampGroup(rng, 430, 1020, c, [d.issuer.name.split(' ').slice(0, 2).join(' '), 'PENERBIT', d.printedDate], d.issuer.style === 1);
  const head = `<text x="60" y="1360" font-family="PT Sans" font-size="14" fill="#8a8a8a">Transportir: ${esc('PT Nusantara Tangki Mandiri')} — dokumen pengiriman BBM</text>`;

  if (d.issuer.style === 1) {
    const rows = [['Nomor DO', d.printedDo], ['Tanggal', d.printedDate], ['Pemberi Order', d.issuer.name], ...fields, ['Jadwal Kirim', d.schedule]];
    const grid = rows.map((r, i) => {
      const y = 210 + i * 70;
      return `<rect x="60" y="${y}" width="880" height="70" fill="none" stroke="#4a4a4a" stroke-width="1.4"/>
        <line x1="330" y1="${y}" x2="330" y2="${y + 70}" stroke="#4a4a4a" stroke-width="1.4"/>
        <text x="78" y="${y + 44}" font-family="PT Sans" font-size="19" font-weight="bold" fill="#333">${esc(r[0])}</text>
        <text x="350" y="${y + 44}" font-family="PT Sans" font-size="20" fill="#111">${esc(r[1])}</text>`;
    }).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1414" viewBox="0 0 1000 1414">
      <rect width="1000" height="1414" fill="#fdfcf8"/>
      <rect x="48" y="48" width="904" height="1318" fill="none" stroke="#333" stroke-width="2.4"/>
      <text x="500" y="100" text-anchor="middle" font-family="PT Sans" font-size="26" font-weight="bold" fill="#2e6b3f">${esc(d.issuer.name.toUpperCase())}</text>
      <text x="500" y="132" text-anchor="middle" font-family="PT Sans" font-size="17" fill="#444">FORM PENGELUARAN BBM / DELIVERY ORDER</text>
      <text x="500" y="166" text-anchor="middle" font-family="PT Sans" font-size="16" fill="#444">${esc(d.printedDo)} — ${esc(d.printedDate)}</text>
      ${grid}
      <text x="120" y="950" font-family="PT Sans" font-size="18" fill="#333">Yang Menyerahkan,</text>
      ${sig}${stamp}
      <text x="700" y="950" font-family="PT Sans" font-size="18" fill="#333">Yang Mengangkut,</text>
      <text x="700" y="1050" font-family="PT Sans" font-size="20" font-weight="bold" fill="#111">${esc(d.truck.driver)}</text>
      ${head}</svg>`;
  }

  if (d.issuer.style === 2) {
    const cards = [['Tanggal', d.printedDate], ['Jadwal Kirim', d.schedule], ...fields, ['Pemberi Order', d.issuer.name]];
    const cardEls = cards.map((r, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const x = 60 + col * 460, y = 200 + row * 130;
      return `<rect x="${x}" y="${y}" width="420" height="110" rx="12" fill="#f8f4ee" stroke="#e2d8cc" stroke-width="1.5"/>
        <text x="${x + 22}" y="${y + 36}" font-family="PT Sans" font-size="15" fill="#9a8f83">${esc(r[0])}</text>
        <text x="${x + 22}" y="${y + 76}" font-family="PT Sans" font-size="23" font-weight="bold" fill="#222">${esc(r[1])}</text>`;
    }).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1414" viewBox="0 0 1000 1414">
      <rect width="1000" height="1414" fill="#ffffff"/>
      <rect x="0" y="0" width="1000" height="150" fill="${c}"/>
      <text x="60" y="72" font-family="PT Sans" font-size="30" font-weight="bold" fill="#fff">${esc(d.issuer.name)}</text>
      <text x="60" y="108" font-family="PT Sans" font-size="17" fill="#f3e2d3">Delivery Order BBM — ${esc(d.issuer.city)}</text>
      <text x="940" y="80" text-anchor="end" font-family="PT Sans" font-size="26" font-weight="bold" fill="#fff">${esc(d.printedDo)}</text>
      ${cardEls}
      <text x="120" y="1010" font-family="PT Sans" font-size="18" fill="#555">Penerbit,</text>
      ${sig}${stamp}
      <text x="120" y="1120" font-family="PT Sans" font-size="19" font-weight="bold" fill="#222">${esc(d.issuer.name)}</text>
      ${head}</svg>`;
  }

  const rows = fields.map((r, i) => {
    const y = 400 + i * 66;
    return `<text x="80" y="${y}" font-family="PT Sans" font-size="20" font-weight="bold" fill="#333">${esc(r[0])}</text>
      <text x="380" y="${y}" font-family="PT Sans" font-size="21" fill="#111">${esc(r[1])}</text>
      <line x1="80" y1="${y + 18}" x2="920" y2="${y + 18}" stroke="#d8d8d8" stroke-width="1"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1414" viewBox="0 0 1000 1414">
    <rect width="1000" height="1414" fill="#ffffff"/>
    <rect x="60" y="50" width="92" height="92" rx="10" fill="${c}"/>
    <text x="106" y="108" text-anchor="middle" font-family="PT Sans" font-size="34" font-weight="bold" fill="#fff">ENU</text>
    <text x="172" y="88" font-family="PT Sans" font-size="32" font-weight="bold" fill="${c}">${esc(d.issuer.name)}</text>
    <text x="172" y="118" font-family="PT Sans" font-size="15" fill="#777">Jl. Industri Raya No. 12, ${esc(d.issuer.city)} — telp (021) 555-0142</text>
    <rect x="700" y="52" width="240" height="88" fill="none" stroke="${c}" stroke-width="2.4"/>
    <text x="820" y="88" text-anchor="middle" font-family="PT Sans" font-size="19" font-weight="bold" fill="${c}">DELIVERY ORDER</text>
    <text x="820" y="118" text-anchor="middle" font-family="PT Sans" font-size="16" fill="#333">${esc(d.printedDo)}</text>
    <line x1="60" y1="172" x2="940" y2="172" stroke="${c}" stroke-width="3.4"/>
    <text x="60" y="222" font-family="PT Sans" font-size="26" font-weight="bold" fill="#222">SURAT PERINTAH PENGIRIMAN BBM</text>
    <text x="80" y="280" font-family="PT Sans" font-size="19" fill="#333">Tanggal: ${esc(d.printedDate)}</text>
    <text x="520" y="280" font-family="PT Sans" font-size="19" fill="#333">Jadwal kirim: ${esc(d.schedule)}</text>
    <text x="80" y="320" font-family="PT Sans" font-size="19" fill="#333">Pemberi order: ${esc(d.issuer.name)}</text>
    ${rows}
    <text x="120" y="940" font-family="PT Sans" font-size="18" fill="#555">Penerbit,</text>
    ${sig}${stamp}
    <text x="120" y="1120" font-family="PT Sans" font-size="19" font-weight="bold" fill="#222">${esc(d.issuer.name)}</text>
    ${head}</svg>`;
}

function podSvg(p, rng) {
  const hand = p.hard ? 'Caveat' : HAND[(p.doN || 36) % HAND.length];
  const ink = INK[(p.doN || 36) % INK.length];
  const size = p.hard ? 27 : 37;
  const opacity = p.hard ? 0.6 : 0.92;
  const rows = [
    ['No. DO', p.printedDo],
    ['Tanggal', p.printedDate],
    ['Tujuan', p.dest],
    ['Produk', p.product],
    ['Volume DO', `${fmt(p.volumeDo)} L`],
    ['Volume Diterima', p.recvDisplay],
    ['Nopol', p.plate],
    ['Sopir', p.driver],
    ['Penerima', p.receiver],
  ];
  const fieldEls = rows.map((r, i) => {
    const y = 230 + i * 96;
    const big = r[0] === 'Volume Diterima';
    const fs = big ? size + 7 : size;
    const rot = rng.float(-3, 3).toFixed(1);
    const extra = p.hard && big ? signatureEl(rng, 350, y - 30, 300, 40, ink) : '';
    return `<text x="70" y="${y}" font-family="PT Sans" font-size="20" font-weight="bold" fill="#333">${esc(r[0])}</text>
      <line x1="330" y1="${y + 10}" x2="930" y2="${y + 10}" stroke="#b9b9b9" stroke-width="1" stroke-dasharray="3 4"/>
      <text x="345" y="${y + 4}" font-family="${hand}" font-size="${fs}" fill="${ink}" opacity="${opacity}" transform="rotate(${rot} 345 ${y})">${esc(r[1])}</text>${extra}`;
  }).join('');
  const sig = p.hasSignature ? signatureEl(rng, 120, 1210, 250, 90, ink) : '';
  const recvName = p.hasSignature ? `<text x="120" y="1330" font-family="${hand}" font-size="30" fill="${ink}" opacity="${opacity}">${esc(p.receiver)}</text>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1414" viewBox="0 0 1000 1414">
    <rect width="1000" height="1414" fill="#fbfaf6"/>
    <text x="60" y="62" font-family="PT Sans" font-size="15" fill="#8a8a8a">PT Nusantara Tangki Mandiri</text>
    <text x="60" y="106" font-family="PT Sans" font-size="31" font-weight="bold" fill="#222">BUKTI SERAH TERIMA BBM</text>
    <text x="60" y="136" font-family="PT Sans" font-size="16" fill="#666">Surat Jalan / Proof of Delivery</text>
    <text x="940" y="62" text-anchor="end" font-family="PT Sans" font-size="14" fill="#8a8a8a">No. Form: PJ-${String(p.doN || 900 + (p.orphan ? 1 : 0)).padStart(3, '0')}</text>
    <line x1="60" y1="164" x2="940" y2="164" stroke="#444" stroke-width="2"/>
    ${fieldEls}
    <text x="70" y="1120" font-family="PT Sans" font-size="20" font-weight="bold" fill="#333">Catatan:</text>
    <line x1="330" y1="1130" x2="930" y2="1130" stroke="#b9b9b9" stroke-width="1" stroke-dasharray="3 4"/>
    <text x="120" y="1190" font-family="PT Sans" font-size="18" fill="#555">Penerima,</text>
    ${sig}${recvName}
    <text x="60" y="1392" font-family="PT Sans" font-size="13" fill="#9a9a9a">Lembar serah terima — simpan sebagai arsip pengiriman</text>
  </svg>`;
}

module.exports = { doSvg, podSvg, stampSvg, shadowSvg, signatureEl, esc };
