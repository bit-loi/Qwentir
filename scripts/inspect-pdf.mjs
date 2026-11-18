import fs from 'node:fs';
import * as mupdf from 'mupdf';

const [src, dst] = process.argv.slice(2);
const doc = mupdf.Document.openDocument(fs.readFileSync(src), 'application/pdf');
const page = doc.loadPage(0);
const pix = page.toPixmap(mupdf.Matrix.scale(1.2, 1.2), mupdf.ColorSpace.DeviceRGB, false, true);
fs.writeFileSync(dst, pix.asPNG());
console.log('rasterized', src, '->', dst);
