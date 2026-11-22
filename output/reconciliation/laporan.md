# Laporan Rekonsiliasi — Qwentir

Tanggal proses: 2026-11-22. Agent: Andi (Reconciliation).
Kontrak: ENU-NTM/2026/001. As-of rekonsiliasi: **2026-11-18**.

## 1. Parameter

| Parameter | Nilai |
|---|---|
| toleransi_susut_persen | 0,5% |
| batas_overdue_pod_hari | 3 hari |
| Sumber order | output/intake/orders.json |
| Sumber POD | output/intake/pods.json |

## 2. Ringkasan

| Hasil | Jumlah |
|---|---|
| Pasangan direkonsiliasi (matched) | 39 |
| — status `cocok` | 35 |
| — status `selisih_di_atas_toleransi` | 4 |
| Order tertahan | 8 |
| POD tertahan | 5 |
| Order duplikat diabaikan | 38 record |
| POD duplikat diabaikan | 46 record |

Total volume pada 39 pasangan: muat **600.000 liter**, diterima **598.051 liter**,
susut **1.949 liter** (0,3248%). Kelebihan di atas toleransi: **648 liter**.

## 3. Selisih di atas toleransi

| order_id | Produk | Muat (L) | Diterima (L) | Susut (L) | Susut (%) | Kelebihan (L) |
|---|---|---:|---:|---:|---:|---:|
| DO-005 | Pertalite | 8.000 | 7.952 | 48 | 0,6 | 8 |
| DO-012 | Dexlite | 16.000 | 15.840 | 160 | 1,0 | 80 |
| DO-019 | Biosolar | 24.000 | 23.520 | 480 | 2,0 | 360 |
| DO-026 | Pertamax | 8.000 | 7.760 | 240 | 3,0 | 200 |

Kelebihan liter dihitung sebagai `susut_liter − volume_muat_liter × 0,5%`
dan menjadi basis Billing. Tidak ada perhitungan rupiah di sini.

## 4. Tertahan per jenis

| Jenis | Jumlah | order_id |
|---|---:|---|
| order_incomplete | 3 | DO-033, DO-034, DO-035 |
| tanpa_pod | 5 | DO-041, DO-042, DO-043, DO-044, DO-045 |
| overdue | 2 | DO-044, DO-045 |
| orphan | 2 | DO-901, DO-902 |

Rincian alasan:

- **DO-033** (order_incomplete): `volume_muat_liter` kosong.
- **DO-034** (order_incomplete): `tujuan` kosong.
- **DO-035** (order_incomplete): `produk` kosong.
- **DO-041** (tanpa_pod): tidak ada POD; umur order 1 hari (17 Nov), belum overdue.
- **DO-042** (tanpa_pod): tidak ada POD; umur order 2 hari (16 Nov), belum overdue.
- **DO-043** (tanpa_pod): tidak ada POD; umur order 1 hari (17 Nov), belum overdue.
- **DO-044** (tanpa_pod + overdue): tidak ada POD; umur order 8 hari (10 Nov) > 3 hari.
- **DO-045** (tanpa_pod + overdue): tidak ada POD; umur order 6 hari (12 Nov) > 3 hari.
- **DO-901** (orphan): POD tanpa order pasangan di daftar order.
- **DO-902** (orphan): POD tanpa order pasangan di daftar order.

POD untuk DO-033, DO-034, dan DO-035 ada dan lengkap, tetapi **tidak
direkonsiliasi** karena order-nya incomplete. Angka kosong tidak ditebak.

## 5. Duplikat

Record duplikat dibuang, satu record kanonik per order_id dipertahankan:

- orders.json: 38 record duplikat diabaikan (DO-001 s.d. DO-035; kanonik = data/orders/*.txt).
- pods.json: 46 record duplikat diabaikan (DO-001 s.d. DO-037; kanonik = data/pods/*.txt).

Perbedaan isi pada salinan (mis. volume/tanggal berbeda di PDF/JPG) tidak
mengubah hasil, karena hanya record kanonik yang dipakai.

## 6. Validasi jumlah

| Sumber | File input | Record kanonik | Duplikat | Rekonsiliasi |
|---|---:|---:|---:|---|
| orders.json | 85 | 47 | 38 | 39 matched + 3 incomplete + 5 tanpa_pod = 47 |
| pods.json | 90 | 44 | 46 | 39 matched + 3 POD order incomplete + 2 orphan = 44 |

- Order: 85 = 47 + 38. **COCOK.**
- POD: 90 = 44 + 46. **COCOK.**
- Total input 175 file = 85 + 90. **COCOK.**

## 7. Handoff

matched.json + issues.json dioper ke Billing Agent. Reconciliation BERHENTI di
sini; tidak menghitung denda rupiah atau invoice.
