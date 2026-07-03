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

## 📚 Technical Highlights (Academic UAS Guidelines)

### 1. Lock-Free Vehicle Partitioning & Reduction Phase
To maximize parallel speedup on multi-core systems, the atomic busy-waiting lock contention (`Atomics.compareExchange`) has been removed. In the C++ engine:
* The vehicle array is partitioned linearly among the OpenMP threads.
* Each thread updates its subset of vehicles independently, logging crossing requests into thread-local arrays without memory locks.
* At the end of each simulation detak/tick, a reduction phase combines thread requests, resolving intersection conflicts and traffic light logic safely and contention-free.

### 2. Modulo Traffic Lights Cycle
Every intersection (vertex) features a simulated traffic light (0 = Green, 1 = Red) changing automatically based on modulo tick counts. Intersections are visually color-coded on the Canvas border (Red for red lights, Green for green lights). Vehicles entering a Red intersection transition to a `Waiting` state lock-free.

### 3. Synchronization Overhead Measurement
Timing inside OpenMP barriers is captured via high-resolution monotonic clocks (`omp_get_wtime`). This isolates computational runtime from thread synchronization/waiting overhead, providing precise input metrics for Amdahl's Law speedup graphs.

---

## 📂 Penjelasan Fungsi Setiap Berkas di Proyek Ini

Berikut adalah pemetaan fungsi dari setiap komponen berkas pada proyek hibrida SmartCity Traffic Simulator:

### A. Komponen Backend (C++ & Build System)

* **[traffic_engine.cpp](traffic_engine.cpp):** Core processing engine simulasi. Bertugas melakukan komputasi berat secara paralel menggunakan OpenMP:
  * Menghitung rute terpendek Floyd-Warshall (`CALCULATE_FW`).
  * Mensimulasikan pembaruan posisi kendaraan secara paralel tanpa kunci (*lock-free partitioning*).
  * Mengatur siklus lampu lalu lintas modulo tick.
  * Menghitung *Synchronization Overhead Time* dan menyajikan antarmuka I/O perintah stdin/stdout JSON.
* **[Makefile](Makefile):** Berkas otomasi kompilasi. Menyediakan perintah kompilasi cepat menggunakan G++ MSYS2 dengan optimasi level tinggi (`-O3`) serta pengaktifan pustaka OpenMP (`-fopenmp`) yang aman untuk terminal Windows.
* **[requirements.txt](requirements.txt):** Berkas dokumentasi yang mencantumkan dependensi sistem perkakas (compiler GCC, Make, Node.js) untuk memandu penataan lingkungan lokal.
* **[CONCEPT_EXPLANATION.md](CONCEPT_EXPLANATION.md):** Berkas dokumentasi teori, konsep, dan arsitektur simulasi hibrida C++ OpenMP dibandingkan dengan model Web Workers lama.

### B. Komponen Server & IPC

* **[server.js](server.js):** Server Node.js lokal. Memiliki peran ganda:
  * Menyajikan berkas front-end (HTML/JS/CSS) dengan header keamanan COOP dan COEP.
  * Bertindak sebagai WebSocket IPC pipe yang menjembatani browser dengan backend C++. Ia meluncurkan `traffic_engine.exe` sebagai subprocess, mengalirkan perintah dari browser ke C++, serta menyemburkan data koordinat kendaraan dari C++ kembali ke browser.

### C. Komponen Front-End (Web UI & Client Logic)

* **[index.html](index.html):** Struktur visual dasbor UI simulator bertema premium dark. Menyediakan panel kontrol (pemilihan mode, thread, tick rate), indikator monitor thread, tombol ekspor, tab metrik live, dan tab grafik analisis Hukum Amdahl.
* **[styles.css](styles.css):** Lembar gaya CSS3 premium yang membungkus antarmuka simulator dengan estetika modern (glassmorphism, skema warna HSL gelap, transisi halus, tata letak grid responsif).
* **[js/app.js](js/app.js):** Logika utama front-end. Bertugas menghubungkan elemen kontrol tombol HTML UI dengan siklus simulasi, menangkap interaksi klik mouse pada Canvas untuk pemblokiran jalan dinamis, serta menggambar visual grafik Hukum Amdahl menggunakan SVG.
* **[js/simulation.js](js/simulation.js):** Pengendali status simulasi sisi klien. Berperan mengirimkan pesan WebSocket ke server Node.js, menerima pembaruan koordinat kendaraan dari C++, dan langsung menyuntikkannya ke Shared Memory views lokal.
* **[js/graph.js](js/graph.js):** Mengatur representasi grafis kota $G=(V,E)$ menggunakan struktur memori bertipe array (Float32/Int32).
* **[js/renderer.js](js/renderer.js):** Modul visualisasi Canvas 2D. Membaca posisi kendaraan dan status jalan dari Shared Memory untuk merender visual aliran lalu lintas langsung, kilauan lampu lalu lintas (Merah/Hijau), serta gradien kepadatan jalan (density heatmap).
* **[js/tests.js](js/tests.js):** Modul pengujian diagnostik otomatis. Memverifikasi operasi graf (CRUD), rekonstruksi rute, dan kecocokan matematis 100% matriks Floyd-Warshall Sequential vs Parallel backend C++.

### D. Komponen Konfigurasi IDE (VS Code)

* **[.vscode/c_cpp_properties.json](.vscode/c_cpp_properties.json):** Konfigurasi IntelliSense C++ dasar untuk merujuk pada instalasi MSYS2 UCRT64 G++ lokal.
* **[.vscode/settings.json](.vscode/settings.json):** Konfigurasi khusus ekstensi clangd untuk mendeteksi compiler driver sehingga pustaka bawaan kompiler MSYS2 dapat dimuat secara mulus tanpa error diagnostic palsu.
* **[compile_flags.txt](compile_flags.txt):** Berkas parameter kompilasi sisi parser agar editor memahami standar bahasa C++20 dan fitur OpenMP yang digunakan dalam kode.
