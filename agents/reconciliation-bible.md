# Bible — Workflow Reconciliation Agent

## Langkah kerja (berurutan)
1. Baca `data/contracts.json` → `toleransi_susut_persen` (0,5),
   `batas_overdue_pod_hari` (3). Tetapkan as-of = 2026-11-18.
2. Baca `output/intake/orders.json` dan `output/intake/pods.json`.
3. Bangun peta order & POD per order_id; buang record `duplikat` (simpan satu),
   catat jumlah duplikat yang diabaikan.
4. Tahan (hold) ke issues.json:
   - order `incomplete` atau POD `incomplete` → jangan direkonsiliasi.
   - POD `orphan` → tidak ada order pasangannya.
5. Order tanpa POD → issues `tanpa_pod`; bila (as-of − tanggal order) >
   batas_overdue_pod_hari → tambah flag `overdue`.
6. Untuk pasangan order↔POD yang lengkap:
   - susut_liter = volume_muat_liter − volume_diterima_liter
   - susut_persen = susut_liter / volume_muat_liter × 100
   - within_tolerance = susut_persen <= toleransi_susut_persen
   - kelebihan_liter = max(0, susut_liter − volume_muat_liter × toleransi/100)
   - status = `cocok` bila within_tolerance, else `selisih_di_atas_toleransi`.
7. Tulis `output/reconciliation/matched.json` (pasangan + angka di atas).
8. Tulis `output/reconciliation/issues.json` (semua hold + alasan + tindakan).
9. Validasi jumlah: order intake = matched + hold(order) + duplikat diabaikan;
   POD intake = matched + hold(POD/orphan) + duplikat diabaikan. Bila tidak cocok,
   selidiki sebelum lanjut.
10. Tulis `output/reconciliation/laporan.md` (Bahasa Indonesia), lalu oper
    matched.json + issues.json ke Billing Agent dan BERHENTI.
    Jangan menghitung rupiah denda atau invoice.

## Schema matched.json
[{ order_id, produk, volume_muat_liter, volume_diterima_liter, susut_liter,
   susut_persen, toleransi_persen, within_tolerance, kelebihan_liter, status,
   sumber_order, sumber_pod }]
status: cocok | selisih_di_atas_toleransi

## Schema issues.json
[{ order_id, sumber, jenis, alasan, tindakan }]
jenis: order_incomplete | pod_incomplete | orphan | tanpa_pod | overdue | duplikat

## laporan.md
Jumlah cocok / selisih / tertahan per jenis + daftar order_id bermasalah + alasan.

## Larangan
- Jangan baca answer_key.csv; jangan tebak angka kosong.
- Jangan paksa cocokkan orphan / incomplete.
- Jangan hitung denda rupiah atau invoice (tugas Billing).