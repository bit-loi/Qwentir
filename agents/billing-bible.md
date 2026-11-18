# Bible — Workflow Billing Agent

## Langkah kerja (berurutan)
1. Baca `data/contracts.json` → `tarif_angkut_per_liter` (500),
   `harga_produk_per_liter`, `aturan_denda`.
2. Baca `output/reconciliation/matched.json` dan `issues.json`.
3. Untuk tiap record matched (status `cocok` atau `selisih_di_atas_toleransi`):
   - biaya_angkut   = volume_diterima_liter × tarif_angkut_per_liter
   - denda          = round(kelebihan_liter × harga_produk_per_liter[produk])
                      (0 bila status cocok / kelebihan_liter = 0)
   - total_tagihan  = max(0, biaya_angkut − denda)
   - invoice_id     = "INV-" + nomor order (mis. DO-005 → INV-005)
   - status         = draft
   Semua uang Rupiah bulat (integer).
4. Tulis `output/billing/invoices.json` (schema di bawah) dan satu draft terbaca
   per invoice: `output/billing/drafts/INV-xxx.md` (Bahasa Indonesia, memuat
   jejak audit rumus + angka).
5. Tulis `output/billing/rekap_piutang.csv` dari invoices (status draft),
   plus total piutang per klien di laporan.
6. Dokumen tertahan dari issues.json (incomplete / orphan / tanpa_pod / overdue)
   TIDAK dibuatkan invoice; masuk daftar "belum bisa ditagih" di laporan.
7. Validasi: jumlah invoice = jumlah record matched; hitung ulang tiap total dan
   total piutang; bila tidak cocok, selidiki sebelum lanjut.
8. Tulis `output/billing/laporan.md`, lalu serahkan draft ke founder melalui
   Virtual Office UI (approve / pause / stop) dan BERHENTI.
   JANGAN mengirim invoice ke klien atau menandai approve/lunas sendiri.

## Schema invoices.json
[{ invoice_id, order_id, klien, produk, volume_diterima_liter, tarif_per_liter,
   biaya_angkut, kelebihan_liter, harga_produk_per_liter, denda, total_tagihan,
   status, sumber_matched }]
status: draft (hanya founder yang boleh mengubah ke approved/paid)

## rekap_piutang.csv
invoice_id, order_id, klien, biaya_angkut, denda, total_tagihan, status

## Draft INV-xxx.md
Kepala invoice (no, tanggal, klien), rincian volume & tarif, perhitungan denda
dengan rumus, total tagihan, status DRAFT + catatan "menunggu approve founder".

## laporan.md
Jumlah draft, total piutang, total denda, total per klien, dan daftar
"belum bisa ditagih" beserta alasan (Bahasa Indonesia).

## Larangan
- Jangan baca answer_key.csv; jangan tebak angka.
- Jangan tagih dokumen tertahan; jangan kirim/approve/lunas tanpa founder.
- Jangan pakai float untuk totals Rupiah.