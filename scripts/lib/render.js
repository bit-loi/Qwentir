const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');
const sharp = require('sharp');
const PDFDocument = require('pdfkit');
const { doSvg, podSvg, stampSvg, shadowSvg } = require('./svg');
const { fmt } = require('./data');

const FONT_DIR = path.join(__dirname, '..', '..', 'assets', 'fonts');
const FONTS = ['Caveat.ttf', 'PatrickHand.ttf', 'Kalam.ttf', 'PTSans.ttf', 'PTSans-Bold.ttf'].map((f) => path.join(FONT_DIR, f));
const FIXED_DATE = new Date('2026-11-18T00:00:00Z');
const BASE_W = 1000;

function svgToPng(svg, width, transparent) {
  const r = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'PT Sans' },
    background: transparent ? 'rgba(0,0,0,0)' : 'rgba(255,255,255,1)',
  });
  return r.render().asPng();
}

function makeNoise(w, h, rng, strength) {
  const buf = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    const v = 128 + rng.int(-strength, strength);
    buf[i * 3] = v; buf[i * 3 + 1] = v; buf[i * 3 + 2] = v;
  }
  return sharp(buf, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
}

function makeGradient(w, h) {
  const buf = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    const v = Math.round(255 - 45 * (y / h));
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      buf[i] = v; buf[i + 1] = v; buf[i + 2] = v;
    }
  }
  return sharp(buf, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
}

async function degrade(png, o, rng) {
  let buf = png;
  if (o.rotate) buf = await sharp(buf).rotate(o.rotate, { background: o.bg || '#f4f1ea' }).png().toBuffer();
  const m = await sharp(buf).metadata();
  if (o.noise) buf = await sharp(buf).composite([{ input: await makeNoise(m.width, m.height, rng, o.noise), blend: 'overlay' }]).png().toBuffer();
  if (o.gradient) buf = await sharp(buf).composite([{ input: await makeGradient(m.width, m.height), blend: 'multiply' }]).png().toBuffer();
  if (o.shadow) {
    const sh = await sharp(svgToPng(shadowSvg(m.width, m.height), m.width, true)).blur(8).png().toBuffer();
    buf = await sharp(buf).composite([{ input: sh, blend: 'multiply' }]).png().toBuffer();
  }
  if (o.blur) buf = await sharp(buf).blur(o.blur).png().toBuffer();
  if (o.gray) buf = await sharp(buf).grayscale().png().toBuffer();
  if (o.crop) {
    const mm = await sharp(buf).metadata();
    const l = Math.round(mm.width * o.crop), t = Math.round(mm.height * o.crop);
    buf = await sharp(buf).extract({ left: l, top: t, width: mm.width - 2 * l, height: mm.height - 2 * t }).png().toBuffer();
  }
  if (o.resize) buf = await sharp(buf).resize(o.resize).png().toBuffer();
  return buf;
}

const toJpeg = (png, quality) => sharp(png).jpeg({ quality, mozjpeg: true }).toBuffer();

function pdfBuffer(doc) {
  return new Promise((res) => {
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => res(Buffer.concat(chunks)));
    doc.end();
  });
}

function newPdf(title) {
  return new PDFDocument({
    size: 'A4', margin: 0,
    info: { Title: title, Producer: 'Qwentir Dataset', CreationDate: FIXED_DATE, ModDate: FIXED_DATE },
  });
}

async function wrapScanPdf(png, title) {
  const doc = newPdf(title);
  doc.image(png, 0, 0, { fit: [595.28, 841.89], align: 'center', valign: 'center' });
  return pdfBuffer(doc);
}

function pdfSignature(doc, rng, x, y, w, h, color) {
  doc.save().lineWidth(1.6).strokeColor(color).strokeOpacity(0.85);
  doc.moveTo(x, y + h * 0.6);
  for (let i = 0; i < 6; i++) {
    doc.bezierCurveTo(
      x + w * (i / 6) + rng.float(-8, 8), y + rng.float(0, h),
      x + w * ((i + 0.5) / 6) + rng.float(-8, 8), y + rng.float(0, h),
      x + w * ((i + 1) / 6), y + h * rng.float(0.3, 0.7)
    );
  }
  doc.stroke();
  const lx = x + w * 0.55, ly = y + h * 0.5;
  doc.moveTo(lx, ly);
  doc.bezierCurveTo(lx + w * 0.06, ly - h * 0.55, lx + w * 0.2, ly - h * 0.5, lx + w * 0.16, ly - h * 0.05);
  doc.bezierCurveTo(lx + w * 0.13, ly + h * 0.35, lx, ly + h * 0.35, lx + w * 0.03, ly);
  doc.stroke();
  doc.moveTo(x + w * 0.2, y + h * 0.75).lineTo(x + w * 0.75, y + h * 0.25).stroke();
  doc.restore();
}

function pdfStamp(doc, rng, cx, cy, color, lines, square) {
  doc.save().strokeOpacity(0.7).fillOpacity(0.7).strokeColor(color).fillColor(color);
  if (square) {
    doc.lineWidth(2.4).rect(cx - 57, cy - 37, 114, 74).stroke();
    doc.lineWidth(1).rect(cx - 50, cy - 30, 100, 60).stroke();
  } else {
    doc.lineWidth(2.4).circle(cx, cy, 55).stroke();
    doc.lineWidth(1).circle(cx, cy, 45).stroke();
  }
  lines.forEach((t, i) => {
    const dy = (i - (lines.length - 1) / 2) * 17;
    doc.fontSize(i === 1 ? 13 : 8.5).font('Helvetica-Bold').text(t, cx - 60, cy + dy - 5, { width: 120, align: 'center' });
  });
  doc.restore();
}

function digitalDoPdf(d, rng) {
  const doc = newPdf(d.id);
  const c = d.issuer.color;
  const fields = [
    ['Tujuan', d.missing.includes('tujuan') ? '' : d.dest],
    ['Produk', d.missing.includes('produk') ? '' : d.product],
    ['Volume Muat', d.missing.includes('volume') ? '' : `${fmt(d.volume)} liter`],
    ['Depot Asal', d.depot],
    ['Nopol Truk', d.truck.plate],
    ['Nama Sopir', d.truck.driver],
  ];
  const stampLines = [d.issuer.name.split(' ').slice(0, 2).join(' '), 'PENERBIT', d.printedDate];

  if (d.issuer.style === 1) {
    doc.lineWidth(1.6).strokeColor('#333').rect(30, 30, 535, 780).stroke();
    doc.fillColor('#2e6b3f').font('Helvetica-Bold').fontSize(15).text(d.issuer.name.toUpperCase(), 40, 48, { width: 515, align: 'center' });
    doc.fillColor('#444').font('Helvetica').fontSize(10).text('FORM PENGELUARAN BBM / DELIVERY ORDER', 40, 70, { width: 515, align: 'center' });
    doc.text(`${d.printedDo} — ${d.printedDate}`, 40, 86, { width: 515, align: 'center' });
    const rows = [['Nomor DO', d.printedDo], ['Tanggal', d.printedDate], ['Pemberi Order', d.issuer.name], ...fields, ['Jadwal Kirim', d.schedule]];
    rows.forEach((r, i) => {
      const y = 110 + i * 46;
      doc.lineWidth(0.9).strokeColor('#4a4a4a').rect(36, y, 523, 46).stroke();
      doc.moveTo(196, y).lineTo(196, y + 46).stroke();
      doc.fillColor('#333').font('Helvetica-Bold').fontSize(10.5).text(r[0], 46, y + 17, { width: 140 });
      doc.fillColor('#111').font('Helvetica').fontSize(11).text(r[1], 206, y + 17, { width: 340 });
    });
    doc.fillColor('#333').font('Helvetica').fontSize(10).text('Yang Menyerahkan,', 70, 640);
    pdfSignature(doc, rng, 70, 660, 140, 50, '#20242c');
    pdfStamp(doc, rng, 300, 690, c, stampLines, true);
    doc.fillColor('#333').text('Yang Mengangkut,', 400, 640);
    doc.fillColor('#111').font('Helvetica-Bold').fontSize(11).text(d.truck.driver, 400, 700);
  } else if (d.issuer.style === 2) {
    doc.rect(0, 0, 595.28, 90).fill(c);
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(17).text(d.issuer.name, 36, 26, { width: 380 });
    doc.font('Helvetica').fontSize(9.5).fillColor('#f3e2d3').text(`Delivery Order BBM — ${d.issuer.city}`, 36, 52);
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#fff').text(d.printedDo, 400, 30, { width: 160, align: 'right' });
    const cards = [['Tanggal', d.printedDate], ['Jadwal Kirim', d.schedule], ...fields, ['Pemberi Order', d.issuer.name]];
    cards.forEach((r, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const x = 36 + col * 272, y = 116 + row * 78;
      doc.lineWidth(0.9).strokeColor('#e2d8cc').fillColor('#f8f4ee').roundedRect(x, y, 250, 66, 7).fillAndStroke();
      doc.fillColor('#9a8f83').font('Helvetica').fontSize(8.5).text(r[0], x + 13, y + 12, { width: 224 });
      doc.fillColor('#222').font('Helvetica-Bold').fontSize(12).text(r[1], x + 13, y + 30, { width: 224 });
    });
    doc.fillColor('#555').font('Helvetica').fontSize(10).text('Penerbit,', 70, 620);
    pdfSignature(doc, rng, 70, 640, 140, 50, '#20242c');
    pdfStamp(doc, rng, 300, 670, c, stampLines, false);
    doc.fillColor('#222').font('Helvetica-Bold').fontSize(10.5).text(d.issuer.name, 70, 720);
  } else {
    doc.rect(36, 30, 55, 55).fill(c);
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(20).text('ENU', 36, 48, { width: 55, align: 'center' });
    doc.fillColor(c).font('Helvetica-Bold').fontSize(18).text(d.issuer.name, 102, 38, { width: 300 });
    doc.fillColor('#777').font('Helvetica').fontSize(8.5).text(`Jl. Industri Raya No. 12, ${d.issuer.city} — telp (021) 555-0142`, 102, 62, { width: 300 });
    doc.lineWidth(1.6).strokeColor(c).rect(420, 30, 140, 55).stroke();
    doc.fillColor(c).font('Helvetica-Bold').fontSize(11).text('DELIVERY ORDER', 420, 42, { width: 140, align: 'center' });
    doc.fillColor('#333').font('Helvetica').fontSize(9.5).text(d.printedDo, 420, 62, { width: 140, align: 'center' });
    doc.lineWidth(2.2).strokeColor(c).moveTo(36, 102).lineTo(560, 102).stroke();
    doc.fillColor('#222').font('Helvetica-Bold').fontSize(14).text('SURAT PERINTAH PENGIRIMAN BBM', 36, 122);
    doc.fillColor('#333').font('Helvetica').fontSize(10.5).text(`Tanggal: ${d.printedDate}`, 48, 156);
    doc.text(`Jadwal kirim: ${d.schedule}`, 300, 156, { width: 260 });
    doc.text(`Pemberi order: ${d.issuer.name}`, 48, 176, { width: 500 });
    fields.forEach((r, i) => {
      const y = 216 + i * 40;
      doc.fillColor('#333').font('Helvetica-Bold').fontSize(11).text(r[0], 48, y, { width: 170 });
      doc.fillColor('#111').font('Helvetica').fontSize(11.5).text(r[1], 228, y, { width: 330 });
      doc.lineWidth(0.6).strokeColor('#d8d8d8').moveTo(48, y + 16).lineTo(556, y + 16).stroke();
    });
    doc.fillColor('#555').font('Helvetica').fontSize(10).text('Penerbit,', 70, 500);
    pdfSignature(doc, rng, 70, 520, 140, 50, '#20242c');
    pdfStamp(doc, rng, 300, 550, c, stampLines, false);
    doc.fillColor('#222').font('Helvetica-Bold').fontSize(10.5).text(d.issuer.name, 70, 620);
  }
  doc.fillColor('#8a8a8a').font('Helvetica').fontSize(8).text('Transportir: PT Nusantara Tangki Mandiri — dokumen pengiriman BBM', 36, 800, { width: 520 });
  return pdfBuffer(doc);
}

async function renderDo(d, rng) {
  if (d.format === 'digital') return { buffer: await digitalDoPdf(d, rng), ext: 'pdf' };
  const base = svgToPng(doSvg(d, rng), BASE_W);
  if (d.format === 'scan') {
    const png = await degrade(base, { rotate: rng.float(-3, 3), noise: 18, gradient: true, blur: 0.4, bg: '#f6f4ef' }, rng);
    return { buffer: await wrapScanPdf(png, d.id), ext: 'pdf' };
  }
  const png = await degrade(base, { rotate: rng.float(-5, 5), shadow: true, blur: 0.5, crop: 0.04, resize: 900, bg: '#c9c2b4' }, rng);
  return { buffer: await toJpeg(png, 45), ext: 'jpg' };
}

async function renderPod(p, rng) {
  let base = svgToPng(podSvg(p, rng), BASE_W);
  if (p.hasStamp) {
    const stamp = await sharp(svgToPng(stampSvg(p, rng), 240, true)).blur(1.3).png().toBuffer();
    base = await sharp(base).composite([{ input: stamp, left: 500, top: 1060 }]).png().toBuffer();
  }
  const extraBlur = p.hard ? 0.6 : 0;
  if (p.format === 'scan') {
    const png = await degrade(base, { rotate: rng.float(-2, 2), noise: 22, gradient: true, gray: true, blur: 0.3 + extraBlur, bg: '#efefef' }, rng);
    return { buffer: await wrapScanPdf(png, p.id), ext: 'pdf' };
  }
  const q = p.quality;
  const opts = {
    tilt: { rotate: rng.float(-6, 6), blur: 0.4 + extraBlur, resize: 1100, bg: '#d8d2c4', quality: 62 },
    whatsapp: { rotate: rng.float(-2, 2), blur: 0.7 + extraBlur, resize: 760, bg: '#e8e4da', quality: 30 },
    finger: { rotate: rng.float(-4, 4), shadow: true, blur: 0.5 + extraBlur, resize: 1000, bg: '#d8d2c4', quality: 55 },
    blur: { rotate: rng.float(-3, 3), blur: 1.4 + extraBlur, resize: 1000, bg: '#e8e4da', quality: 58 },
    crop: { rotate: rng.float(-5, 5), crop: 0.06, shadow: true, resize: 950, bg: '#c9c2b4', quality: 50 },
  }[q];
  const png = await degrade(base, opts, rng);
  return { buffer: await toJpeg(png, opts.quality), ext: 'jpg' };
}

module.exports = { renderDo, renderPod, svgToPng };
