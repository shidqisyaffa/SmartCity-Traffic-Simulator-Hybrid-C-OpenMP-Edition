# 📑 Pembagian Tugas Kelompok (SmartCity Traffic Simulator)

Dokumen ini menjelaskan pembagian tugas, kontribusi, dan tanggung jawab resmi dari **5 anggota kelompok** dalam pengembangan proyek **SmartCity Traffic Simulator (Hybrid C++ OpenMP Edition)** untuk memenuhi revisi tugas akhir UAS.

---

## 👥 Profil Anggota & Distribusi Peran Resmi

### 1. Project Manager (PM)
* **Fokus Utama:** Manajemen Proyek, Integrasi Arsitektur, & Dokumentasi Utama
* **Tanggung Jawab & Kontribusi:**
  * Memimpin desain dan koordinasi integrasi sistem hybrid (C++ backend ↔ Node.js WebSocket Bridge ↔ HTML5 Canvas).
  * Menyusun dan bertanggung jawab penuh atas dokumen **README.md** yang mendokumentasikan gambaran umum, panduan instalasi, dan panduan penggunaan sistem.
  * Memantau milestone pengembangan agar seluruh fitur berjalan sinkron dan terhindar dari bug efek samping.
  * **Deliverable Utama:** Dokumen `README.md`, file orkestrasi `server.js`.

---

### 2. Matrix Architect I & II (2 Anggota)
* **Fokus Utama:** Backend C++ Engine, OpenMP Parallelization, Makefile, & Chrono Clock
* **Tanggung Jawab & Kontribusi:**
  * Mengembangkan mesin backend C++ (`traffic_engine.cpp`) berbasis pemrosesan paralel OpenMP.
  * Mengimplementasikan pembagian beban kerja Floyd-Warshall paralel secara *Block-Row Partition* $\frac{O(N^3)}{P}$ dengan `#pragma omp parallel for`.
  * Mengintegrasikan pencatatan waktu komputasi presisi tinggi menggunakan clock performa sekuensial dan paralel (`std::chrono::high_resolution_clock`).
  * Merancang dan mengoptimalkan **Makefile** untuk kompilasi lintas platform (`-fopenmp`, `-O3`, `-std=c++20`, static compilation).
  * Mengimplementasikan pelacakan Thread ID (`omp_get_thread_num()`) dan CPU Core Riil (`GetCurrentProcessorNumber()` / `sched_getcpu()`) untuk transparansi hardware.
  * **Deliverable Utama:** `traffic_engine.cpp`, `Makefile`, target biner `traffic_engine.exe`.

---

### 3. Graph Architect (1 Anggota)
* **Fokus Utama:** Visualisasi Canvas, Premium Stop-Line Traffic Lights, & CSS Styling
* **Tanggung Jawab & Kontribusi:**
  * Mengembangkan visualisasi Canvas 2D interaktif pada berkas `js/renderer.js`.
  * Mengimplementasikan desain **Stop-Line Indicator (Garis Batas Berhenti Mikro)** dengan efek glow neon semi-transparan (Merah/Hijau) di ujung dalam tepi jalan.
  * Menyusun skema visual node berbasis tingkat kepadatan antrean (Red stroke jika macet/waiting, Green lembut jika lancar).
  * Mendesain tata letak visual dasbor premium dark-mode dengan konsep glassmorphism pada berkas **styles.css**.
  * Merancang responsive grid CSS untuk dasbor metrik dan card popup interaktif.
  * **Deliverable Utama:** `js/renderer.js`, `styles.css`.

---

### 4. Performance Analyst (1 Anggota)
* **Fokus Utama:** Binary Thread Slider, CSV Data Export, Laporan Proyek Akhir, & Concept Explanation
* **Tanggung Jawab & Kontribusi:**
  * Mengimplementasikan slider alokasi thread diskrit berbasis pangkat dua genap (2, 4, 8, 16) yang disesuaikan secara dinamis terhadap batas maksimum core logis hardware pengguna.
  * Mengembangkan modul Worker Thread Monitor untuk merender visual status thread secara dinamis mengikuti slider.
  * Membuat fitur ekspor file laporan **`export.csv`** riil dari data sesi simulasi berjalan.
  * Menyusun dokumen **laporan_proyek_akhir.md** yang menjabarkan hasil pengujian kinerja, analisis Amdahl's Law, dan kesimpulan optimasi paralel.
  * Menyusun berkas **CONCEPT_EXPLANATION.md** untuk memberikan panduan komprehensif bagi dosen penguji mengenai detail operasional simulator.
  * **Deliverable Utama:** Logika ekspor & slider di `js/app.js`, `laporan_proyek_akhir.md`, `CONCEPT_EXPLANATION.md`.

---

## 📊 Matriks Kontribusi Fitur (Revisi UAS Final)

| Modifikasi / Fitur Baru | Kontributor Utama | Berkas Terkait |
| :--- | :--- | :--- |
| **Integrasi WebSocket & README** | Project Manager (PM) | [README.md](README.md), [server.js](server.js) |
| **C++ Floyd-Warshall & OpenMP Loops** | Matrix Architects (I & II) | [traffic_engine.cpp](traffic_engine.cpp) |
| **Makefile & Static Compiler Flags** | Matrix Architects (I & II) | [Makefile](Makefile) |
| **Realtime Chrono Clock (Backend)** | Matrix Architects (I & II) | [traffic_engine.cpp](traffic_engine.cpp) |
| **Core & Thread Tracking Telemetry** | Matrix Architects (I & II) | [traffic_engine.cpp](traffic_engine.cpp), [js/simulation.js](js/simulation.js) |
| **Adaptive Stop-Line Traffic Lights** | Graph Architect | [renderer.js](js/renderer.js) |
| **CSS Glassmorphism Styles** | Graph Architect | [styles.css](styles.css) |
| **Discrete Thread Slider (2/4/8/16)** | Performance Analyst | [js/app.js](js/app.js), [index.html](index.html) |
| **Dynamic Worker Activity Monitor** | Performance Analyst | [js/app.js](js/app.js) |
| **Pre-export CSV Graph Benchmark** | Performance Analyst | [js/app.js](js/app.js) |
| **Laporan Proyek Akhir & Konsep** | Performance Analyst | [laporan_proyek_akhir.md](laporan_proyek_akhir.md), [CONCEPT_EXPLANATION.md](CONCEPT_EXPLANATION.md) |

---

## 🔗 Hubungan Alur Tanggung Jawab

```
 PM (README.md)
  │
  ├─► Matrix Architects (Backend C++, OpenMP, Chrono, Makefile)
  │    └─► Menyediakan data waktu komputasi presisi & telemetry core riil
  │
  ├─► Graph Architect (Canvas Stop-Line, CSS Styling)
  │    └─► Menggambar lampu lalu lintas neon & visualisasi kepadatan node
  │
  └─► Performance Analyst (Slider Genap, CSV Export, Laporan Proyek, Concept)
       └─► Menganalisis throughput, efisiensi paralel, & mengemas dokumen akademik
```
