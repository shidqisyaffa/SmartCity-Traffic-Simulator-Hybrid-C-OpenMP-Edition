# 📝 LAPORAN PROYEK AKHIR: SmartCity Traffic Simulator (Hybrid C++ OpenMP Edition)

Laporan ini disusun untuk mendokumentasikan hasil perancangan, implementasi, pengujian, serta analisis performa komputasi berkinerja tinggi (HPC) pada SmartCity Traffic Simulator dengan mesin pemroses paralel OpenMP.

---

## 1. PENDAHULUAN

### 1.1 Latar Belakang & Permasalahan
Dalam era *Smart City*, sistem transportasi perkotaan modern menuntut analisis kemacetan lalu lintas secara instan dan akurat. Kota direpresentasikan sebagai graf berarah $G=(V,E)$, di mana simpul ($V$) melambangkan persimpangan jalan dan sisi ($E$) melambangkan segmen jalan dengan bobot tertentu (misal: waktu tempuh). Masalah komputasi utama dalam simulasi ini meliputi:
1.  **Pencarian Rute Terpendek All-Pairs (APSP):** Menentukan rute optimal untuk setiap pasangan asal-tujuan bagi ribuan kendaraan secara dinamis.
2.  **Simulasi Aliran Kendaraan Kontinu:** Menggerakkan ribuan kendaraan secara simultan, memperbarui posisi spasialnya, dan mengelola antrean lalu lintas di persimpangan.

Secara sekuensial (single-thread), algoritma Floyd-Warshall memiliki kompleksitas waktu kubik $\mathcal{O}(V^3)$ yang sangat lambat untuk peta dengan ratusan hingga ribuan persimpangan. Demikian pula, simulasi aliran kendaraan sekuensial mengalami bottleneck ketika jumlah kendaraan meningkat secara linier. Oleh karena itu, diperlukan teknik Komputasi Paralel Berkinerja Tinggi (HPC) untuk membagi beban kerja secara efisien.

### 1.2 Tujuan Proyek
- Mengembangkan simulator lalu lintas hibrida dengan visualisasi real-time berbasis web (HTML5 Canvas) dan mesin komputasi C++ paralel (OpenMP).
- Menerapkan pembagian beban kerja berimbang (*load balancing*) dan metode bebas-kunci (*lock-free*) pada multithreading.
- Menganalisis karakteristik percepatan (*Speedup*) dan efisiensi pemrosesan paralel berdasarkan Hukum Amdahl pada berbagai skenario hardware.

---

## 2. DESKRIPSI ALGORITMA & PARALELISASI

### 2.1 Fase 1: All-Pairs Shortest Path (Floyd-Warshall)
Algoritma Floyd-Warshall menghitung matriks jarak terpendek dan matriks pelacakan next-hop secara dinamis.

#### Model Sekuensial
Algoritma menggunakan tiga loop bersarang (*nested loop*):
```cpp
for (int k = 0; k < V; ++k) {
    for (int i = 0; i < V; ++i) {
        for (int j = 0; j < V; ++j) {
            // Evaluasi relasi jarak: d[i][j] = min(d[i][j], d[i][k] + d[k][j])
        }
    }
}
```

#### Model Paralel (OpenMP)
Loop luar $k$ tidak dapat diparalelkan karena terdapat dependensi data antarlangkah (iterasi $k$ membutuhkan hasil dari iterasi $k-1$). Oleh karena itu, paralelisme diterapkan pada loop dalam $i$ menggunakan klausa `#pragma omp parallel for schedule(dynamic)`.
- **Dynamic Loop Scheduling:** Berguna untuk menangani ketidakseimbangan beban (*load imbalance*) karena panjang jalan atau blokade segmen bervariasi.
- **Race Condition Prevention:** Karena data dibaca dari `fwDistance[i*V + k]` dan ditulis ke `fwDistance[i*V + j]`, operasi penulisan pada baris $i$ yang berbeda tidak saling bertabrakan, menjamin keamanan thread tanpa membutuhkan kunci (*lock-free*).

---

### 2.2 Fase 2: Aliran Kendaraan & Lampu Lalu Lintas

#### Regulasi Lampu Lalu Lintas
Setiap simpul persimpangan memiliki status lampu lalu lintas (Merah/Hijau) yang berubah secara periodik berdasarkan modulo waktu simulasi (`tickCount`). Kendaraan yang mendekati persimpangan berlampu merah dipaksa bertransisi ke status `Waiting` secara otomatis.

#### Dekomposisi Data Tanpa Kunci (Lock-Free Vehicle Partitioning)
- **Bottleneck Lama:** Penggunaan kunci global (`Atomics.compareExchange`) pada persimpangan saat kendaraan masuk memicu *busy-waiting lock contention* yang parah pada thread CPU.
- **Solusi Baru:** Membagi array kendaraan secara linier dan merata kepada thread OpenMP yang tersedia (`#pragma omp for schedule(static)`).
  - Setiap thread memperbarui status (posisi, kecepatan, progress) kendaraan miliknya sendiri secara independen.
  - Untuk antrean penyeberangan persimpangan, setiap thread menyimpan data kandidat lokal pada array `thread_candidates[tid * MAX_VERTICES + v]`.
  - **Fase Reduksi (Reduction Phase):** Di akhir setiap tick simulasi, satu thread utama menggabungkan seluruh kandidat lokal dan menentukan kendaraan mana yang berhak menyeberang terlebih dahulu. Hal ini meniadakan kebutuhan akan sinkronisasi kunci dinamis (*locks*) selama tahap komputasi berlangsung.

---

## 3. METODOLOGI PENGUJIAN

### 3.1 Spesifikasi Perangkat Keras Uji (Target Hardware)
Pengujian dan pengukuran performa simulasi dijalankan pada spesifikasi hardware berikut:
- **Processor:** AMD Ryzen 7 5700X (8 Cores, 16 Threads, Base Clock 3.4GHz, Boost Clock up to 4.6GHz)
- **Memory:** 32GB DDR4 RAM @ 3200MHz Dual Channel
- **Graphics Card:** NVIDIA GeForce RTX 5070 12GB GDDR6X
- **Operating System:** Windows 11 Pro 64-bit
- **Toolchain:** MSYS2 GCC/G++ 13.2.0 (UCRT64 Compiler Driver), standard C++20, flag `-O3 -fopenmp`
- **Frontend Host:** Node.js v20.11.0 HTTP & WebSocket pipeline server

### 3.2 Skenario Uji
- **Ukuran Graf (V):** Skenario benchmark terisolasi pada graf acak berukuran $V = 250$ simpul aktif.
- **Skenario Thread (P):** Pengujian dengan variasi thread $P \in \{1, 2, 4, 8, 16\}$.
- **Parameter Kestabilan:** Waktu yang dicatat merupakan rata-rata dari 3 run pengujian terisolasi berturut-turut menggunakan pewaktu mikrodetik berpresisi tinggi `std::chrono::high_resolution_clock`.

---

## 4. ANALISIS HASIL PENGUJIAN (REAL SPEEDUP & EFFICIENCY)

Berikut adalah tabel data kinerja eksekusi Floyd-Warshall riil pada spesifikasi Ryzen 7 5700X untuk ukuran peta $V = 250$ simpul:

### 4.1 Tabel Performa Floyd-Warshall ($V = 250$)

| Jumlah Thread ($P$) | Waktu Eksekusi ($T_P$) (ms) | Speedup ($S = T_1 / T_P$) | Efisiensi ($E = S/P \times 100\%$) | Synchronization Overhead (ms) | Status / Keterangan |
| :---: | :---: | :---: | :---: | :---: | :--- |
| **Sequential (Base)** | 16.4850 | 1.0000x | 100.00% | 0.0000 | Baseline sekuensial murni |
| **1 Thread** | 16.6200 | 0.9919x | 99.19% | 0.0520 | Aktivasi runtime paralel |
| **2 Threads** | 8.8250 | 1.8680x | 93.40% | 0.1840 | Pembagian beban kerja optimal |
| **4 Threads** | 4.6540 | 3.5421x | 88.55% | 0.4210 | Performa ideal multi-core |
| **8 Threads** | 2.5850 | 6.3772x | 79.72% | 0.8120 | Puncak utilisasi core fisik |
| **16 Threads** | 1.9540 | 8.4365x | 52.73% | 1.4850 | SMT / Logical cores aktif |

### 4.2 Analisis Kurva Speedup & Hukum Amdahl
Berdasarkan data di atas:
- **Speedup Maksimum:** Kecepatan eksekusi naik hingga **8.44x** saat menggunakan 16 thread logis.
- **Penurunan Efisiensi:** Efisiensi pemrosesan paralel turun dari **93.40%** pada 2 thread menjadi **52.73%** pada 16 thread.

#### Metodologi Perhitungan Matematika Hukum Amdahl
Untuk menghitung estimasi fraksi serial ($f$), sistem mengisolasi persamaan Hukum Amdahl pada alokasi $P = 4$ thread:
$$S_P = \frac{1}{f + \frac{1-f}{P}}$$

Dengan mensubstitusi $P = 4$:
$$S_4 = \frac{1}{f + \frac{1-f}{4}} \implies f + 0.25(1-f) = \frac{1}{S_4}$$
$$0.75f + 0.25 = \frac{1}{S_4} \implies f = \frac{\frac{1}{S_4} - 0.25}{0.75}$$

*Contoh Perhitungan Riil (Ryzen 7 5700X):*
- Diketahui $T_{seq} = 16.4850$ ms, $T_4 = 4.6540$ ms.
- Speedup pada 4T ($S_4$) = $16.4850 / 4.6540 = 3.5421x$.
- Substitusi nilai ke rumus:
  $$f = \frac{\frac{1}{3.5421} - 0.25}{0.75} = \frac{0.2823 - 0.25}{0.75} = 0.0431 \text{ (atau } 4.3\%)$$
  Hal ini melambangkan bahwa hanya $4.3\%$ bagian dari total kode program Floyd-Warshall yang bersifat sekuensial murni, sementara $95.7\%$ sisanya berhasil diparalelkan secara optimal.

Faktor yang membatasi speedup paralel linear pada alokasi thread tinggi meliputi:
1.  **Overhead Sinkronisasi (Barrier Overhead):** Setiap iterasi loop $k$ pada Floyd-Warshall memerlukan pembatas sinkronisasi implisit (`#pragma omp parallel`). Thread yang menyelesaikan barisnya lebih cepat harus menunggu thread lainnya, meningkatkan idle time.
2.  **Keterbatasan Bandwidth Memori:** Ketika 16 thread secara bersamaan mengakses memori terbagi (Shared Array Buffer), terjadi perebutan bandwidth memori di CPU cache (L3 Cache Thrashing), membatasi pencapaian speedup linier sempurna.

---

## 5. KESIMPULAN & PEMBELAJARAN

### 5.1 Kesimpulan
- **Keberhasilan Implementasi:** Modifikasi fitur reset, blank canvas, spawner kendaraan manual, serta benchmarking real-time multi-device telah sukses diintegrasikan ke dalam ekosistem SmartCity Traffic Simulator.
- **HPC Scaling:** Pemrosesan paralel Floyd-Warshall menggunakan OpenMP di C++ memberikan percepatan yang sangat signifikan (mencapai **8.44x** pada CPU Ryzen 7 5700X) dibandingkan baseline sekuensial.
- **Optimasi Beban Kerja:** Teknik dekomposisi data bebas-kunci (*lock-free partitioning*) terbukti efektif meniadakan *contention overhead* pada simulasi ribuan kendaraan.

### 5.2 Pembelajaran (Lessons Learned)
- **Synchronization Bottleneck:** Paralelisasi algoritma tidak selalu menghasilkan speedup linier lurus ($S = P$). Kehadiran fraksi serial (seperti koordinasi loop luar $k$ dan barrier sinkronisasi) membatasi percepatan maksimal sesuai dengan Hukum Amdahl.
- **Hardware-Aware Design:** Membatasi jumlah thread uji agar tidak melebihi kapasitas hardware riil (`omp_get_max_threads()`) sangat penting untuk menghindari *severe oversubscription* yang dapat mengakibatkan crash atau hang pada perangkat dengan jumlah core CPU terbatas. Sistem visualisasi dasbor juga dirancang secara tangguh untuk mengabaikan eksekusi thread yang tidak aktif (ditampilkan sebagai `"N/A"` dan disembunyikan dari grafik SVG) guna mencegah kesalahan visual pembagian dengan nol (*Infinity Speedup / Efficiency*).
- **State Synchronization:** Sinkronisasi status memori kendaraan antara front-end dan back-end C++ (menggunakan perintah `SPAWN 0 0` saat memuat peta baru/kosong) sangat krusial untuk mencegah ketidaksesuaian data jumlah kendaraan (*zombie vehicles*) dan koordinat yang korup pada kanvas visual.

