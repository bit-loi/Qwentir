# Bible — Workflow Intake Agent

## Langkah kerja (berurutan)
1. Baca `data/contracts.json` → muat `alias_produk`, `toleransi_susut_persen`,
   satuan, dan `batas_overdue_pod_hari`.
2. Enumerasi input: `data/orders/`, `data/pods/`, `output/do/`, `output/pod/`.
   Catat daftar file sebagai basis rekonsiliasi jumlah.
3. Ekstraksi per file:
   - `.txt` → parse teks langsung.
   - PDF digital → ekstrak teks mesin (machine-readable).
   - PDF scan / JPG → baca visual (vision); bila tulisan sulit, tandai confidence rendah.
4. Normalisasi ke bentuk kanonik:
   - Produk: PTL / RON 90 → Pertalite; PMX / RON 92 → Pertamax;
     B30 / Solar → Biosolar; Dex → Dexlite.
   - Satuan: "KL" × 1000; "ltr" / "liter" → liter; simpan `satuan_asli`.
   - Tanggal: DD/MM/YYYY, DD-MMM-YY, D/M/YY, "1 November 2026" → ISO YYYY-MM-DD.
   - Nomor DO: `DO-001`, `DO/001/XI/2026`, `No. 001-ENU` → `DO-XXX`.
     Typo OCR (mis. `DO-0l0`) diperbaiki hanya bila yakin; jika ragu, tandai.
5. Kelengkapan:
   - Order wajib: order_id, produk, volume_muat_liter, tujuan, tanggal.
   - POD wajib: order_id, volume_diterima_liter, penerima.
   - Ada yang kosong → `status=incomplete` + isi `field_kosong[]`. JANGAN menebak.
6. Duplikat: order_id sama ATAU konten/byte identik → `status=duplikat`;
   simpan satu record, catat file kembar di catatan.
7. Orphan: POD yang order_id-nya tidak ada di daftar order → `status=orphan`.
8. Tulis output: `output/intake/orders.json`, `output/intake/pods.json`,
   `output/intake/laporan.md` (schema di bawah).
9. Validasi jumlah: total file input = total record + duplikat yang diabaikan.
   Laporkan jumlah per status; bila tidak cocok, selidiki sebelum lanjut.
10. Oper `orders.json` + `pods.json` ke Reconciliation Agent, lalu BERHENTI.
    Jangan menghitung selisih, denda, atau invoice (itu tugas agent berikutnya).

## Schema orders.json
[{ order_id, produk, volume_muat_liter, depot_asal, tujuan, tanggal, klien,
   nopol, sopir, sumber_file, status, field_kosong[] }]
status: lengkap | incomplete | duplikat

## Schema pods.json
[{ order_id, volume_diterima_liter, penerima, tanggal_terima, ttd_ada, stempel_ada,
   sumber_file, status, satuan_asli, catatan, confidence }]
status: lengkap | incomplete | duplikat | orphan

## laporan.md
Ringkasan jumlah per status + daftar masalah (file, jenis, alasan) dalam Bahasa Indonesia.

## Larangan
- Jangan membaca `data/answer_key.csv` / `output/answer_key.csv`.
- Jangan menebak field kosong atau angka yang tidak terbaca.
- Jangan menghitung selisih volume / denda / invoice.