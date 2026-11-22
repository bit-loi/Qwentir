# Laporan Intake - Batch Demo Penuh

Tanggal proses: 2026-11-22. Agent: Rusdi (Intake). Kontrak: ENU-NTM/2026/001.

## 1. Enumerasi input

| Direktori | Jumlah file |
|---|---|
| data/orders/ | 50 |
| data/pods/ | 45 |
| output/do/ | 35 |
| output/pod/ | 45 |
| **Total** | **175** |

Metode ekstraksi: .txt parse teks; PDF digital pdftotext; PDF scan diekstrak gambarnya (pypdf) lalu dibaca visual; JPG dibaca visual. Transkripsi visual POD diverifikasi ulang (spot-check) untuk dokumen berconfidence rendah/menengah dan anomali.

## 2. Jumlah record per status

Konvensi: satu record per file input. Record pertama per order_id (urutan enumerasi: data/orders, data/pods, output/do, output/pod) menjadi record kanonik; file berikutnya dengan order_id sama atau byte identik diberi status=duplikat dan diabaikan oleh agent berikutnya (perbedaan isi dicatat di catatan).

| Status | orders.json | pods.json |
|---|---|---|
| lengkap | 44 | 42 |
| incomplete | 3 | 0 |
| duplikat | 38 | 46 |
| orphan | 0 | 2 |
| **Total record** | **85** | **90** |

## 3. Validasi jumlah

- Order: 85 file input = 47 record kanonik (44 lengkap + 3 incomplete) + 38 duplikat diabaikan. COCOK.
- POD: 90 file input = 42 record kanonik lengkap + 2 orphan + 46 duplikat diabaikan. COCOK.
- Total: 175 file = 85 + 90 record. COCOK.

## 4. Daftar masalah

| File | Jenis | Alasan |
|---|---|---|
| data/orders/DO-033.txt | incomplete | Field wajib kosong: volume_muat_liter. |
| data/orders/DO-034.txt | incomplete | Field wajib kosong: tujuan. |
| data/orders/DO-035.txt | incomplete | Field wajib kosong: produk. |
| data/pods/POD-901.txt | orphan | order_id DO-901 tidak ada di daftar order. |
| data/pods/POD-902.txt | orphan | order_id DO-902 tidak ada di daftar order. |
| output/pod/POD-DO-003.jpg | confidence rendah | Volume Diterima tertimpa coretan tanda tangan; angka tidak terbaca pasti (samar '15.4?4 liter'); tidak ditebak. Duplikat order_id DO-003; record kanonik: data/pods/POD-003.txt. Perbedaan isi: volume_diterima_liter: None vs kanonik 15941; tanggal_terima: 2026-11-12 vs kanonik 2026-11-04. |
| output/pod/POD-DO-010.jpg | typo nomor DO | Tertulis 'DO-0l0'; dikoreksi ke DO-010 karena tujuan/nopol/sopir cocok; confidence medium. |
| output/pod/POD-DO-015.jpg | foto terpotong | Area tanda tangan/stempel tidak terlihat; ttd_ada & stempel_ada = null. |
| output/pod/POD-DO-029.jpg | tanpa ttd/stempel | Area penerima kosong; ttd_ada=false, stempel_ada=false. |
| output/pod/POD-DO-021.jpg | coretan pada volume | Volume tertimpa coretan namun masih terbaca 16.000 liter; confidence medium. |
| data/pods/POD-008.txt | satuan non-liter | 7,984 KL -> 7984 liter; stempel & tanggal terima tidak disebutkan. |
| data/pods/POD-022.txt | satuan non-liter | 23993 ltr -> 23993 liter; stempel & tanggal terima tidak disebutkan. |
| output/pod/POD-DO-008.jpg | satuan non-liter | 7,98 KL -> 7980 liter (berbeda dari POD txt 7984). |
| output/pod/POD-DO-022.jpg | satuan non-liter | 23.976 ltr -> 23976 liter (berbeda dari POD txt 23993). |
| output/pod/POD-DO-036.jpg | isi menyimpang | Form PJ-901: tujuan SPBU 34.901.05 Bintaro, volume 7.500 L, penerima Fajar - tidak cocok dengan order DO-036 maupun POD txt. |
| output/pod/POD-DO-037.jpg | isi menyimpang | Form PJ-901: volume 10.000 L, stempel PT Kimia Industri - tidak cocok dengan order DO-037 maupun POD txt. |
| output/pod/IMG-20261110-WA0100.jpg | duplikat byte | Byte-identik dengan output/pod/POD-DO-002.jpg. |
| output/pod/IMG-20261111-WA0101.jpg | duplikat byte | Byte-identik dengan output/pod/POD-DO-007.jpg. |
| output/pod/IMG-20261112-WA0102.jpg | duplikat byte | Byte-identik dengan output/pod/POD-DO-014.jpg. |
| output/pod/IMG-20261113-WA0103.jpg | duplikat byte | Byte-identik dengan output/pod/POD-DO-018.jpg. |
| output/pod/IMG-20261114-WA0104.pdf | duplikat byte | Byte-identik dengan output/pod/POD-DO-023.pdf. |
| output/pod/IMG-20261115-WA0105.jpg | duplikat byte | Byte-identik dengan output/pod/POD-DO-028.jpg. |
| output/pod/IMG-20261116-WA0106.jpg | duplikat byte | Byte-identik dengan output/pod/POD-DO-031.jpg. |
| output/pod/IMG-20261117-WA0107.jpg | duplikat byte | Byte-identik dengan output/pod/POD-DO-032.jpg. |
| data/pods/POD-001_copy.txt | duplikat byte | Byte-identik dengan data/pods/POD-001.txt. |
| data/orders/DO-007_copy.txt | duplikat order_id | Salinan/resi ulang dengan order_id sama; isi sama kecuali baris subjek. |
| data/orders/DO-019_copy.txt | duplikat order_id | Salinan/resi ulang dengan order_id sama; isi sama kecuali baris subjek. |
| data/orders/DO-031_copy.txt | duplikat order_id | Salinan/resi ulang dengan order_id sama; isi sama kecuali baris subjek. |

### Konflik isi antar dokumen ber-order_id sama (duplikat)

Versi PDF/JPG di output/do sering berbeda tanggal/volume/klien/nopol/sopir dari txt di data/orders. Record kanonik = txt (pertama dienumerasi); perbedaan dirinci di catatan tiap record duplikat orders.json.

- 34 record DO duplikat memiliki perbedaan isi terhadap kanonik (lihat orders.json).
- DO-033: volume muat kosong di txt DAN di PDF scan -> tetap incomplete, tidak ditebak.
- DO-034: tujuan kosong di txt DAN di PDF digital -> tetap incomplete.
- DO-035: produk kosong di txt DAN di PDF digital -> tetap incomplete.
- POD versi visual (output/pod) hampir seluruhnya berbeda angka volume/tanggal dari POD txt dengan order_id sama; keduanya disimpan, kanonik = txt, perbedaan di catatan pods.json.

## 5. Catatan operasional

- Order tanpa POD pada batch ini: DO-041, DO-042, DO-043, DO-044, DO-045.
- POD-901 & POD-902 yatim (orphan); tidak ada order DO-901/DO-902.
- Normalisasi diterapkan: alias produk (PTL/RON 90->Pertalite, PMX/RON 92->Pertamax, B30/Solar->Biosolar, Dex->Dexlite); KL x1000; ltr/liter->liter; tanggal ke ISO; nomor DO/xxx/XI/2026 dan No. xxx-ENU -> DO-xxx.
- Tidak ada perhitungan selisih volume, denda, atau invoice (tugas Reconciliation Agent).

## 6. Handoff

orders.json + pods.json siap dioper ke Reconciliation Agent. Intake BERHENTI di sini.
