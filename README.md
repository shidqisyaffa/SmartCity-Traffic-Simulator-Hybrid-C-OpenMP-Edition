# SmartCity Traffic Simulator (Hybrid C++ OpenMP Edition)

A high-performance interactive graphical traffic simulator designed to demonstrate and benchmark the performance, correctness, and scaling of **Sequential Computing** versus **Parallel Computing** using Graph Theory and Discrete Event Simulation.

This project uses a hybrid architecture: the heavy computational simulation engine is implemented in pure **C++ with OpenMP** for maximum parallel performance, while the interactive frontend dashboard is rendered on an **HTML5 Canvas** connected via a real-time WebSocket IPC bridge.

---

## ⚙️ System Requirements & Compiler Setup

To compile and run this application on Windows 11, you need:
1. **Node.js** (version 18.0.0 or higher) - runs the local web server and WebSocket pipe.
2. **MSYS2 (UCRT64)** toolchain with GCC/G++ version 16.1.0 or higher (supports OpenMP `-fopenmp` compilation).
3. **GNU Make** (mingw32-make) to execute the build scripts.

Ensure the MSYS2 UCRT64 binary path (default: `C:\msys64\ucrt64\bin`) is added to your Windows environment `PATH` variable so the compiler and make utilities can be resolved.

No external packages (`npm install` or Python `pip`) are required. The server uses native Node.js libraries.

---

## 🚀 Quick Start & Compilation

Follow these steps to compile the backend and start the simulator locally:

### 1. Compile the C++ Backend Engine
Open your terminal (PowerShell or Command Prompt) and run:
```powershell
# Set MSYS2 path for session (if not in system PATH) and build
$env:PATH = "C:\msys64\ucrt64\bin;" + $env:PATH
mingw32-make
```
This command compiles `traffic_engine.cpp` into `traffic_engine.exe` with aggressive optimizations (`-O3`) and OpenMP threads enabled.

### 2. Start the Local Server
```bash
npm start
```
This launches `server.js` on port 3000. It serves the visual assets and automatically spawns a persistent C++ backend subprocess to pipe inputs and outputs.

### 3. Access the Simulator
Open your browser and navigate to:
```
http://localhost:3000
```

---

## 🧮 Analisis Fundamental: Mengapa Sequential vs Parallel?

### Masalah Komputasi: O(N³) Floyd-Warshall

Inti dari simulator ini adalah algoritma **Floyd-Warshall All-Pairs Shortest Path** (APSP) untuk menghitung rute terpendek seluruh pasangan simpul kota. Kompleksitas waktu algoritma ini adalah **kubik**:

$$T_{seq} = O(N^3)$$

Pada ukuran jaringan kota besar ($N = 1024$ simpul), estimasi jumlah operasi matriks yang harus diselesaikan mencapai **~1,07 miliar** per siklus perhitungan. Jika dijalankan secara **Sekuensial** (1 thread), satu core CPU dipaksa menyelesaikan seluruh operasi sendirian, mengakibatkan:
- **Bottleneck CPU** yang menyebabkan lag berat pada visual frontend.
- **Latency respons** terhadap perubahan peta (blokir jalan, rute ulang kendaraan) menjadi sangat tinggi.
- **Frame-rate rendering Canvas** turun drastis karena WebSocket blocking.

### Solusi Paralel: Dekomposisi Data OpenMP

Dengan OpenMP, loop baris matriks Floyd-Warshall diparalelkan dengan dekomposisi data (iterasi `k` terluar tetap serial karena dependensi data antar-iterasi, sedangkan loop `i` dan `j` diparalelkan):

```cpp
for (int k = 0; k < N; k++) {            // serial — data dependency
    #pragma omp parallel for num_threads(P) schedule(dynamic)
    for (int i = 0; i < N; i++) {
        for (int j = 0; j < N; j++) {
            dist[i][j] = min(dist[i][j], dist[i][k] + dist[k][j]);
        }
    }
}
```

Setiap dari **P** thread mengerjakan partisi baris matriks yang tidak overlapping secara simultan di core fisik AMD Ryzen 7 5700X yang terpisah. Kompleksitas komputasi murni per thread menjadi:

$$T_{par} \approx \frac{O(N^3)}{P}$$

### Tabel Performa Riil (Grid 7×7, V=49 Node)

| Thread (P) | T_P (ms) | Speedup (S) | Efisiensi (E) | Sync Overhead (ms) |
|:---:|:---:|:---:|:---:|:---:|
| Seq (1T)   | 0.074   | 1.00×       | 100%          | 0.000              |
| 2T         | ~1.81   | ~0.04×      | ~2.0%         | ~1.26              |
| 4T         | ~3.06   | ~0.02×      | ~0.6%         | ~2.26              |
| 8T         | ~5.16   | ~0.01×      | ~0.18%        | ~3.94              |
| 16T        | ~9.34   | ~0.008×     | ~0.05%        | ~7.29              |

> **Catatan Akademis:** Pada V=49 (sangat kecil), *overhead* inisialisasi thread OpenMP mendominasi sehingga speedup < 1. Fenomena ini secara ilmiah dikenal sebagai **Parallel Overhead Dominance** — titik crossover terjadi saat ukuran problem cukup besar untuk mengamortisasi biaya manajemen thread. Pada V ≥ 512, speedup paralel mulai nyata terukur.

### Mengapa 8 Thread Optimal? Memory Bandwidth Bottleneck di 16 Thread

Prosesor AMD Ryzen 7 5700X memiliki **8 core fisik** dengan teknologi SMT (Simultaneous Multi-Threading) yang menghadirkan 16 thread logis. Pada alokasi:

- **P = 8 thread**: Masing-masing core fisik mengerjakan satu thread — efisiensi cache L1/L2 per core maksimal, tidak ada sharing resource antar-thread pada satu core. Ini adalah **sweet spot teoritis** sesuai jumlah core fisik.
- **P = 16 thread**: SMT aktif — dua thread virtual berbagi satu set register fisik dan pipeline eksekusi. Akibatnya terjadi:
  - **Memory Bandwidth Bottleneck**: Kedua thread saling bersaing memperebutkan bus memori dan cache line yang sama.
  - **Synchronization Overhead** meningkat drastis: waktu tunggu antar-thread di barrier `#pragma omp barrier` (yang dibutuhkan pada akhir setiap iterasi `k`) menjadi lebih dari 2× lebih lama dibanding P=8.

Ini adalah manifestasi nyata dari **Hukum Amdahl** dan **Batas Skalabilitas (Scalability Limit)** pada arsitektur modern.

---

## 📚 Technical Highlights (Academic UAS Guidelines)

### 1. Lock-Free Vehicle Partitioning & Reduction Phase
To maximize parallel speedup on multi-core systems:
* The vehicle array is partitioned linearly among the OpenMP threads.
* Each thread updates its subset of vehicles independently, logging crossing requests into thread-local arrays without memory locks.
* At the end of each simulation tick, a reduction phase combines thread requests, resolving intersection conflicts and traffic light logic safely and contention-free.

### 2. Traffic-Adaptive Queueing & Congestion Heatmap

Setiap persimpangan memiliki lampu lalu lintas cerdas berbasis volume antrean (**Traffic-Adaptive Queueing**). Lampu hijau tidak berputar secara buta pada lajur kosong, melainkan hanya berputar (*round-robin*) secara dinamis pada lajur masuk (*incoming edges*) yang memiliki antrean kendaraan nyata (`progress >= 1.0f`).
* **Hapus Delay Buatan**: Mengeliminasi delay buatan (`0.5s` crossing delay dan `0.1s` red light delay), sehingga kendaraan langsung bertransisi ke status Moving (`state = 1`) secara instan begitu mendapat prioritas hijau.
* **Heatmap & Penumpukan**: Kendaraan di lajur merah berstatus `Waiting`, mengubah stroke simpul Canvas menjadi **Merah (Macet)** secara real-time. Hal ini memicu akumulasi visual pada *density heatmap* jalan masuk. Jika persimpangan terblokir atau macet, backend paralel OpenMP menghitung ulang rute alternatif tercepat secara instan tanpa membebani frame-rate visual.

### 5. OS Core-Tracking & Hardware Transparency

Sistem melakukan deteksi batas core logis maksimal hardware secara otomatis saat startup menggunakan `omp_get_max_threads()`. Slider thread dibatasi agar tidak melampaui kemampuan hardware. 
Pada setiap tick simulasi, backend C++ memetakan alokasi thread logis ke CPU Core fisik sesungguhnya menggunakan Windows API `GetCurrentProcessorNumber()` atau Linux `sched_getcpu()`. Data ini dipancarkan via WebSocket JSON sehingga dasbor Worker Monitor dapat merender **Thread ID #X** dan **CPU Core Riil: Y** secara real-time serta berdenyut (*pulse*) mengikuti fase kerja thread (FW COMPUTE atau VEHICLE UPDATE).

---

## 📂 Penjelasan Fungsi Setiap Berkas di Proyek Ini

### A. Komponen Backend (C++ & Build System)

* **[traffic_engine.cpp](traffic_engine.cpp):** Core processing engine. Menghitung Floyd-Warshall paralel OpenMP, mensimulasikan kendaraan lock-free, mengelola lampu lalu lintas round-robin, dan mengukur Sync Overhead Time.
* **[Makefile](Makefile):** Otomasi kompilasi G++ MSYS2 dengan optimasi `-O3` dan `-fopenmp`.
* **[requirements.txt](requirements.txt):** Dokumentasi dependensi sistem (GCC, Make, Node.js).
* **[CONCEPT_EXPLANATION.md](CONCEPT_EXPLANATION.md):** Dokumentasi teori, konsep, dan arsitektur hibrida.

### B. Komponen Server & IPC

* **[server.js](server.js):** Server Node.js lokal — menyajikan front-end dan bertindak sebagai WebSocket IPC pipe ke C++ subprocess.

### C. Komponen Front-End (Web UI & Client Logic)

* **[index.html](index.html):** Struktur UI dasbor premium dark — panel kontrol, worker monitor, ekspor, tab Live Metrics, tab Scientific Benchmark.
* **[styles.css](styles.css):** CSS3 glassmorphism premium dengan animasi micro-interaction.
* **[js/app.js](js/app.js):** Logika utama front-end — kontrol UI, canvas interactions, CSV/JSON export, SVG chart rendering.
* **[js/simulation.js](js/simulation.js):** Pengendali status simulasi — WebSocket messaging, Shared Memory management.
* **[js/graph.js](js/graph.js):** Representasi grafis kota $G=(V,E)$ menggunakan typed arrays (Float32/Int32).
* **[js/renderer.js](js/renderer.js):** Visualisasi Canvas 2D — kendaraan, stop-line indicator traffic lights, heatmap kepadatan.
* **[js/tests.js](js/tests.js):** Diagnostik otomatis — verifikasi CRUD graf dan konsistensi matriks Floyd-Warshall.

---

## 🆕 Fitur & Fungsionalitas Baru (Revisi UAS)

### 1. Discrete Thread Slider (2, 4, 8, 16 Thread)
- Slider paralel hanya memperbolehkan nilai **pangkat dua: 2, 4, 8, 16** thread.
- Angka 1 thread dihapus dari slider paralel — gunakan dropdown **Sequential (Single-Thread)** untuk eksekusi 1-thread murni.
- Setiap perubahan memicu kalkulasi ulang Floyd-Warshall secara *real-time*.

### 2. Dynamic Worker Thread Activity Monitor
- **2 atau 4 thread**: Bar progress penuh dengan label IDLE / FW COMPUTE / VEHICLE UPDATE.
- **8 atau 16 thread**: Compact grid mini-boxes dengan animasi glow pulse yang berkedip real-time mengikuti aktivitas backend C++.

### 3. Stop-Line Indicator Traffic Lights
- Lampu lalu lintas divisualisasikan sebagai **garis stop-line** tipis tegak lurus terhadap arah jalan dengan efek glow merah/hijau — elegan dan menyatu dengan tema glassmorphism.

### 4. Editor Canvas & Re-routing Kendaraan
- Klik **Node** → modal spawn kendaraan dari node tersebut.
- Klik **Edge** → modal edit bobot/status jalan.
- Klik **Kendaraan** → overlay detail card + tombol edit rute (`UPDATE_VEHICLE` ke C++).

### 5. Ekspor CSV Multi-Thread
- CSV memuat kolom `Travel Time Thread X (s)` terpisah untuk setiap konfigurasi thread yang pernah digunakan dalam satu sesi.

---

## 📑 Pembagian Tugas Kelompok
Detail kontribusi masing-masing anggota kelompok dapat diakses di dokumen:
* **[persentasi.md](persentasi.md):** Matriks pembagian tugas dan kontribusi 5 anggota kelompok.
