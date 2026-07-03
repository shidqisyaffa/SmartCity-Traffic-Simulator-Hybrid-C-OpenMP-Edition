# Panduan Konsep & Arsitektur: SmartCity Traffic Simulator

Dokumen ini menjelaskan dasar teori pemrograman paralel, fungsi arsitektur hibrida, serta alur kerja teknis di balik integrasi **C++ OpenMP** dan **HTML5 WebSocket Client** pada proyek SmartCity Traffic Simulator.

---

## 1. Apa Fungsi OpenMP di Proyek Ini?

**OpenMP (Open Multi-Processing)** adalah API pemrograman paralel tingkat tinggi yang dirancang untuk arsitektur memori bersama (*Shared Memory*). Dalam simulator ini, OpenMP bertugas mengoptimalkan dan mempercepat beban komputasi berat dengan membagi pekerjaan matematika ke seluruh core fisik CPU secara bersamaan.

Ada dua fase operasional utama yang dijalankan secara paralel menggunakan OpenMP:

### A. Algoritma Pencarian Rute (Floyd-Warshall)
Algoritma Floyd-Warshall mencari rute terpendek untuk seluruh pasangan titik (*all-pairs shortest paths*) dengan kompleksitas waktu sekuensial $\mathcal{O}(V^3)$. 
* **Penerapan OpenMP:** Loop pencarian luar $i$ dan $j$ diparalelkan di bawah loop $k$ menggunakan pengarah:
  ```cpp
  #pragma omp parallel for schedule(dynamic)
  ```
* **Mengapa Penjadwalan Dinamis (Dynamic)?** Karena kepadatan jalan di kota tidak merata (beberapa jalan terputus atau memiliki bobot tak terhingga `INF`), pembagian beban kerja dinamis mencegah core CPU menganggur (*load imbalance*) dengan mendistribusikan iterasi secara fleksibel saat runtime.

### B. Pergerakan Aliran Kendaraan (Ticking & Collision Resolving)
Ketika ribuan kendaraan bergerak di sepanjang rute secara bersamaan, status koordinat dan antrean di persimpangan harus diperbarui pada setiap detak (*tick*).
* **Penerapan OpenMP:** Array kendaraan dibagi secara linear ke thread-thread OpenMP. Setiap thread menghitung pergerakan fisika kendaraan miliknya secara mandiri.
* **Fase Reduksi (Lock-Free):** Alih-alih memperebutkan akses masuk persimpangan menggunakan pengunci (*locks*), setiap thread mencatat kandidat kendaraan penyeberang di tabel lokal mereka. Pada akhir tick, dilakukan operasi reduksi cepat sekuensial untuk menentukan kendaraan mana yang berhak menyeberang persimpangan terlebih dahulu berdasarkan tingkat prioritasnya.

---

## 2. Apa Bedanya dengan yang Dilakukan di Berkas Awal (JavaScript)?

| Aspek | Berkas Awal (Murni JavaScript) | Sistem Baru (Hibrida C++ + OpenMP) |
| :--- | :--- | :--- |
| **Utas / Threading** | Menggunakan **Web Workers** (thread buatan browser yang berjalan secara terisolasi). | Menggunakan **OpenMP Thread** (thread native bawaan sistem operasi yang berjalan langsung di CPU). |
| **Kecepatan Eksekusi** | Dibatasi oleh *V8 Engine interpreter* browser, pembatasan sandbox web, dan overhead alokasi memori JS. | Berjalan dalam bahasa **C++ Kompilasi Native** dengan optimasi penuh kompiler (`-O3`) tanpa beban interpreter. |
| **Manajemen Kunci (Locking)** | Menggunakan operasi atomik tunggu-sibuk (`Atomics.compareExchange` / *busy-waiting*) yang membuat pemakaian CPU melonjak tinggi (panas) saat macet. | Menggunakan skema **Lock-Free Partitioning & Reduction Phase** di mana persimpangan diselesaikan di akhir tick tanpa membuat thread saling menunggu. |
| **Overhead Komunikasi** | Harus menyalin atau mentransfer data buffer mentah berulang kali antar Worker thread di peramban. | Berbagi memori global langsung di dalam memori C++ (*Shared memory access*) dengan komunikasi WebSocket IPC non-blocking yang sangat ringkas. |
| **Beban Browser** | Browser harus menghitung rute, memperbarui kendaraan, dan menggambar Canvas sekaligus (rawan tab browser *freeze*). | Browser hanya berfokus **menggambar visual Canvas** secara ringan, seluruh perhitungan berat didelegasikan ke mesin luar. |

---

## 3. Untuk Apa Ada Berkas `.cpp` dan `.exe` Sekarang?

Untuk memisahkan antara penulisan logika kode manusia dengan eksekusi komputer berkecepatan tinggi:

* **`traffic_engine.cpp` (Berkas Kode Sumber):**
  Merupakan berkas teks yang berisi logika algoritma simulasi yang ditulis dalam bahasa C++. Berkas ini digunakan oleh programmer untuk membaca, memahami, dan memodifikasi alur logika Floyd-Warshall paralel, antrean lampu lalu lintas, dan pergerakan kendaraan. Komputer tidak dapat menjalankan instruksi berkas teks ini secara langsung.
* **`traffic_engine.exe` (Berkas Aplikasi Executable):**
  Merupakan aplikasi biner hasil kompilasi dari `traffic_engine.cpp` menggunakan kompiler `g++`. Kompiler menerjemahkan baris kode C++ menjadi instruksi biner tingkat rendah (bahasa mesin) yang dimengerti langsung oleh prosesor komputer secara instan.

---

## 4. Bagaimana Mereka Bekerja Bersama di Web?

Berikut adalah alur pertukaran data secara non-blocking ketika simulasi dijalankan:

```text
[ Browser (Canvas UI) ] 
       │ 
       │ (1. Kirim perintah "TICK_REQUEST" via WebSocket)
       ▼
[ server.js (Node.js Server) ] 
       │ 
       │ (2. Salurkan string perintah ke stdin C++)
       ▼
[ traffic_engine.exe (C++ Engine) ] ──► (3. Hitung pergerakan mobil secara paralel pakai OpenMP)
       │ 
       │ (4. Kembalikan data posisi kendaraan berbentuk JSON via stdout)
       ▼
[ server.js (Node.js Server) ]
       │ 
       │ (5. Kirim balik string koordinat JSON via WebSocket)
       ▼
[ Browser (Canvas UI) ] ──► (6. Gambar mobil bergerak dengan mulus di layar peramban)
```

Dengan arsitektur hibrida ini, Anda memperoleh visualisasi interaktif bertema modern yang responsif di sisi front-end web, sekaligus mengamankan performa komputasi paralel native tingkat tinggi menggunakan OpenMP di sisi backend.
