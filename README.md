# Qwentir — Dataset Dummy (Teks + Dokumen)

Dataset fiktif untuk menguji agent back-office Qwentir (Intake → Reconciliation → Billing).
Tersedia dua lapis: **dataset teks** (`data/orders`, `data/pods`) dan **dataset dokumen lapangan**
(`output/do`, `output/pod`). Semua nama perusahaan, orang, SPBU, depot, nopol, dan angka adalah **fiktif**.

## Regenerasi

```bash
npm install
node scripts/generate-dataset.js
```

Seed tetap `20261118` (lihat `scripts/generate-dataset.js`). Dua kali run menghasilkan byte yang identik
(sudah diverifikasi dengan sha256). Tidak ada API eksternal saat runtime; font handwriting dibundel di
`assets/fonts/` (lisensi OFL: Caveat, Patrick Hand, Kalam, PT Sans).

## Struktur output

```
output/
  do/               35 Delivery Order  (21 PDF digital, 9 PDF scan, 5 JPG foto HP)
  pod/              45 Proof of Delivery (34 JPG foto/WA, 11 PDF scan; termasuk 8 duplikat + 2 orphan)
  rekap_admin.csv   rekap ketikan admin, 35 baris, 5 salah ketik sengaja
  answer_key.csv    81 baris kunci jawaban (satu baris per dokumen) — JANGAN dibaca agent
data/
  contracts.json    tarif, toleransi susut 0,5%, aturan denda, batas overdue POD 3 hari
  orders/           50 file teks order (surat perintah kirim / email singkat)
  pods/             45 file teks POD (pesan WhatsApp / berita acara bongkar)
  answer_key.csv    20 baris kunci jawaban masalah dataset teks — JANGAN dibaca agent
scripts/
  generate-dataset.js   orkestrator (satu perintah regenerasi, teks + dokumen)
  lib/{rng,data,svg,render,textdata}.js
  inspect-pdf.mjs       alat dev untuk merasterisasi PDF saat inspeksi (mupdf, devDependency)
```

## Komposisi masalah — dataset teks (data/answer_key.csv, 20 baris)

| Jenis masalah | Jumlah | Contoh |
|---|---:|---|
| Selisih di atas toleransi | 4 | DO-005 (0,6%), DO-012 (1%), DO-019 (2%), DO-026 (3%) |
| Order incomplete (field kosong) | 3 | DO-033 volume, DO-034 tujuan, DO-035 produk |
| Order tanpa POD | 5 | DO-041..DO-045 (DO-044 & DO-045 overdue > 3 hari) |
| Order duplikat | 3 | DO-007_copy, DO-019_copy, DO-031_copy |
| POD duplikat | 1 | POD-001_copy (isi sama dengan POD-001) |
| POD orphan | 2 | DO-901, DO-902 |
| POD format berantakan | 2 | DO-008 "7,984 KL", DO-022 "ltr" |

Sisa 33 order bersih dengan POD cocok dan susut di bawah toleransi 0,5%.
Total file: 50 order (47 unik + 3 salinan duplikat), 45 POD (42 cocok + 1 duplikat + 2 orphan).

## Komposisi masalah — dataset dokumen (output/answer_key.csv, 81 baris)

| Masalah | Jumlah | Contoh |
|---|---:|---|
| Selisih volume di atas toleransi | 4 | DO-005 (0,6%), DO-012 (1%), DO-019 (2%), DO-026 (3%) |
| Order incomplete (field kosong) | 3 | DO-033 volume, DO-034 tujuan, DO-035 produk |
| POD incomplete (ttd/stempel hilang) | 2 | DO-015, DO-029 |
| Satuan campur (KL / ltr) | 2 | DO-008 "7,98 KL", DO-022 "ltr" |
| Typo nomor DO / nopol | 2 | DO-010 "DO-0l0", DO-024 nopol huruf l |
| Tulisan tangan sulit dibaca | 2 | DO-003, DO-021 |
| POD duplikat (byte identik, nama beda) | 8 | POD-DO-002.jpg = IMG-20261110-WA0100.jpg |
| POD orphan (DO tidak ada) | 2 | DO-036, DO-037 |
| Salah ketik rekap admin | 5 | DO-004, DO-009, DO-016, DO-027, DO-030 |

## Asumsi desain

- Tiga gaya kop DO seolah dari tiga pemberi order berbeda (PT Energi Niaga Utama, Depot BBM Tanjung
  Sekong, PT Niaga Bahan Bakar Indonesia); format nomor DO dan tanggal sengaja tidak konsisten
  (`DO-001`, `DO/001/XI/2026`, `No. 001-ENU`; `1 November 2026`, `01/11/2026`, `01-Nov-26`, `2/11/26`).
- Volume sesuai kapasitas truk tangki 8/16/24 KL; POD normal susut 0–0,4% (dalam toleransi 0,5%).
- Tiga order incomplete tetap punya POD yang **tampak lengkap** secara visual: agent wajib berhenti di
  intake dan tidak menebak field kosong dari POD.
- Dokumen tidak memuat petunjuk jawaban apa pun; kebenaran hanya ada di `output/answer_key.csv`
  (kolom: file, jenis, do_benar, volume_sebenarnya_liter, status, alasan).
- Pemetaan status: `normal`, `duplikat`, `incomplete`, `selisih_volume`, `typo` (satuan/DO/nopol),
  `orphan`. Kasus tulisan sulit dibaca berstatus `normal` dengan alasan confidence rendah.
- PDF digital dibuat dengan pdfkit (teks bisa dibaca mesin). PDF scan dan JPG dibuat dari SVG
  (resvg) lalu didegradasi dengan sharp: miring, noise, kontras tidak rata, blur, bayangan/jari,
  crop tepi, kompresi WA, dan grayscale untuk scan hitam-putih.
- Dataset teks (`data/orders`, `data/pods`, `data/answer_key.csv`) dihasilkan bersamaan dengan dataset
  dokumen oleh satu perintah; keduanya memakai seed terpisah sehingga penambahan mode teks tidak
  mengubah byte dokumen di `output/` (diverifikasi sha256 identik). `data/contracts.json` dipakai bersama.
