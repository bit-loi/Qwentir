# Laporan Billing — Qwentir

Tanggal proses: 2026-11-22. Agent: Rahma (Billing).
Kontrak: ENU-NTM/2026/001 — PT Energi Niaga Utama.
Sumber: output/reconciliation/matched.json (39 record) + issues.json.

## 1. Ringkasan

| Item | Nilai |
|---|---:|
| Draft invoice dibuat | 39 |
| Volume diterima ditagihkan | 598.051 L |
| Total biaya angkut | Rp 299.025.500 |
| Total denda susut | Rp 6.148.000 |
| **Total piutang (draft)** | **Rp 292.877.500** |

Tarif angkut: Rp 500/liter. Semua nilai Rupiah bulat (integer).
Status seluruh invoice: **draft** — menunggu approve founder.

## 2. Total Piutang per Klien

| Klien | Jumlah Invoice | Biaya Angkut | Denda | Total Tagihan |
|---|---:|---:|---:|---:|
| PT Energi Niaga Utama | 39 | Rp 299.025.500 | Rp 6.148.000 | Rp 292.877.500 |
| **TOTAL** | **39** | **Rp 299.025.500** | **Rp 6.148.000** | **Rp 292.877.500** |

## 3. Denda Susut (di atas toleransi 0.5%)

| Invoice | Order | Produk | Kelebihan | Harga/L | Denda |
|---|---|---|---:|---:|---:|
| INV-005 | DO-005 | Pertalite | 8 L | Rp 10.000 | Rp 80.000 |
| INV-012 | DO-012 | Dexlite | 80 L | Rp 14.000 | Rp 1.120.000 |
| INV-019 | DO-019 | Biosolar | 360 L | Rp 6.800 | Rp 2.448.000 |
| INV-026 | DO-026 | Pertamax | 200 L | Rp 12.500 | Rp 2.500.000 |
| **TOTAL** | | | | | **Rp 6.148.000** |

Rumus: denda = kelebihan_liter × harga_produk_per_liter, dipotong dari biaya angkut.
35 invoice lain tanpa denda (susut dalam toleransi).

## 4. Belum Bisa Ditagih (10 dokumen)

Komposisi: 3 order tidak lengkap, 5 order tanpa POD (DO-044 & DO-045 juga
overdue), 2 POD orphan. Dokumen berikut TIDAK dibuatkan invoice dan tidak
ditagih pada batch ini.

| Order | Jenis | Alasan |
|---|---|---|
| DO-033 | order tidak lengkap | Field wajib kosong: volume_muat_liter. |
| DO-034 | order tidak lengkap | Field wajib kosong: tujuan. |
| DO-035 | order tidak lengkap | Field wajib kosong: produk. |
| DO-901 | POD orphan (tanpa order) | Tidak ada order DO-901 di orders.json. |
| DO-902 | POD orphan (tanpa order) | Tidak ada order DO-902 di orders.json. |
| DO-041 | POD belum diterima | Order lengkap tetapi tidak ada POD dengan order_id ini. |
| DO-042 | POD belum diterima | Order lengkap tetapi tidak ada POD dengan order_id ini. |
| DO-043 | POD belum diterima | Order lengkap tetapi tidak ada POD dengan order_id ini. |
| DO-044 | POD belum diterima + POD overdue (> 3 hari) | Order lengkap tetapi tidak ada POD dengan order_id ini. POD belum diterima 8 hari setelah tanggal order 2026-11-10 (batas 3 hari, as-of 2026-11-18). |
| DO-045 | POD belum diterima + POD overdue (> 3 hari) | Order lengkap tetapi tidak ada POD dengan order_id ini. POD belum diterima 6 hari setelah tanggal order 2026-11-12 (batas 3 hari, as-of 2026-11-18). |

## 5. Validasi

- Jumlah invoice = jumlah record matched: 39 = 39. **COCOK.**
- Total tagihan dihitung ulang per invoice (biaya angkut − denda, min 0), seluruhnya integer Rupiah.
- Total piutang = penjumlahan total_tagihan 39 invoice =
  Rp 292.877.500. **COCOK** dengan rekap_piutang.csv (39 baris).
- Tidak ada order tertahan yang dibuatkan invoice.

## 6. Handoff

Draft invoice (39) diserahkan ke founder melalui Virtual Office.
Menunggu keputusan founder: **approve / pause / stop**. Billing tidak mengirim
invoice ke klien dan tidak menandai approved/paid sendiri.
