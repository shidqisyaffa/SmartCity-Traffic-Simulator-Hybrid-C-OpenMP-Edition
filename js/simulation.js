/**
 * SmartCity Traffic Simulator - Simulation Engine (js/simulation.js)
 * Coordinates simulation step events, syncs graph modifications, 
 * and handles WebSockets communication with the C++ OpenMP backend.
 */

import { MAX_VERTICES, CityGraph } from './graph.js';

export const MAX_VEHICLES = 10000;

export class Simulation {
  constructor() {
    this.state = "stopped";   // running, paused, stopped
    this.mode = "parallel";   // sequential, parallel
    this.tickCount = 0;
    this.tickRate = 50;       // millisecond tick rate (default 20 FPS / 50ms)
    this.numThreads = 4;
    
    // Performance metrics
    this.metrics = {
      fwSequentialTime: 0,
      fwParallelTime: 0,
      fwSyncOverhead: 0,
      updateSequentialTime: 0,
      updateParallelTime: 0,
      updateSyncOverhead: 0,
      throughput: 0,
      totalFinished: 0
    };

    // Pre-allocated SharedArrayBuffers (Thread-safe memory layout)
    this.buffers = {
      weights: new SharedArrayBuffer(MAX_VERTICES * MAX_VERTICES * 4), // Float32
      blocked: new SharedArrayBuffer(MAX_VERTICES * MAX_VERTICES * 4), // Int32
      coords: new SharedArrayBuffer(MAX_VERTICES * 2 * 4),            // Float32
      activeNodes: new SharedArrayBuffer(MAX_VERTICES * 1),           // Uint8
      fwDistance: new SharedArrayBuffer(MAX_VERTICES * MAX_VERTICES * 4), // Float32
      fwNext: new SharedArrayBuffer(MAX_VERTICES * MAX_VERTICES * 4),      // Int32
      
      vehicleInts: new SharedArrayBuffer(MAX_VEHICLES * 8 * 4),       // Int32
      vehicleFloats: new SharedArrayBuffer(MAX_VEHICLES * 8 * 4),     // Float32
      vehiclePaths: new SharedArrayBuffer(MAX_VEHICLES * 100 * 4),    // Int32 (max path length = 100)
      
      sync: new SharedArrayBuffer(1050 * 4)                           // Int32: Barrier + 1000 intersection locks
    };

    // Instantiate components over Shared Memory
    this.graph = new CityGraph(this.buffers);
    this.workerPool = {
      terminate() {
        console.log("Mock WorkerPool: terminate called.");
      }
    };

    // Typed Array Views for direct main thread reads/writes
    this.vehicleIntsView = new Int32Array(this.buffers.vehicleInts);
    this.vehicleFloatsView = new Float32Array(this.buffers.vehicleFloats);
    this.vehiclePathsView = new Int32Array(this.buffers.vehiclePaths);
    
    this.fwDistanceView = new Float32Array(this.buffers.fwDistance);
    this.fwNextView = new Int32Array(this.buffers.fwNext);
    this.syncView = new Int32Array(this.buffers.sync);

    this.totalVehicles = 0;
    this.activeVehicles = 0;
    this.onTickCallback = null;
    this.trafficLights = new Uint8Array(MAX_VERTICES);

    // WebSocket state
    this.socket = null;
    this.pendingResolver = null;

    // Reset Graph & Memory
    this.graph.clear();
    this.clearVehiclesMemory();

    // Connect to WebSocket server on instantiation
    this.connectWebSocket();
  }

  /**
   * Establish WebSocket connection to Node.js backend.
   */
  connectWebSocket() {
    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}`;
      console.log(`[WebSocket] Connecting to ${wsUrl}...`);
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        console.log("[WebSocket] Connected to C++ backend pipeline server successfully.");
        resolve();
      };

      this.socket.onerror = (err) => {
        console.error("[WebSocket] Connection error:", err);
        reject(err);
      };

      this.socket.onmessage = (e) => {
        this.handleSocketMessage(e.data);
      };

      this.socket.onclose = () => {
        console.warn("[WebSocket] Connection closed. Attempting reconnect in 2 seconds...");
        setTimeout(() => this.connectWebSocket(), 2000);
      };
    });
  }

  /**
   * Handle incoming messages from WebSocket server.
   */
  handleSocketMessage(dataStr) {
    try {
      const response = JSON.parse(dataStr);
      if (this.pendingResolver && response.type === this.pendingResolver.type) {
        const resolve = this.pendingResolver.resolve;
        this.pendingResolver = null;
        resolve(response);
      }
    } catch (err) {
      console.error("[WebSocket] Error parsing response line:", err, dataStr);
    }
  }

  /**
   * Helper to await WebSocket transition to OPEN state.
   */
  ensureSocketOpen() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const check = () => {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
          resolve();
        } else if (Date.now() - startTime > 5000) {
          reject(new Error("WebSocket failed to open within 5 seconds."));
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });
  }

  /**
   * Send a command text and return promise waiting for response type.
   */
  async sendRequest(commandStr, typeExpected) {
    await this.ensureSocketOpen();
    return new Promise((resolve, reject) => {
      this.pendingResolver = { resolve, type: typeExpected };
      this.socket.send(commandStr);
    });
  }

  /**
   * Sync the frontend graph weights, coords, blocks and active states to C++.
   */
  async syncGraphToBackend() {
    await this.ensureSocketOpen();
    const V = this.getGraphBoundary();
    if (V === 0) return;

    // Clear backend graph first
    this.socket.send("CLEAR_GRAPH");

    // Add active vertices
    for (let i = 0; i < V; i++) {
      if (this.graph.activeNodes[i] >= 1) { // active
        const x = this.graph.coords[i * 2];
        const y = this.graph.coords[i * 2 + 1];
        this.socket.send(`ADD_VERTEX ${i} ${x} ${y}`);
      }
    }

    // Add weights and block state
    for (let i = 0; i < V; i++) {
      if (this.graph.activeNodes[i] !== 1) continue;
      for (let j = 0; j < V; j++) {
        if (this.graph.activeNodes[j] !== 1 || i === j) continue;
        const w = this.graph.weights[i * MAX_VERTICES + j];
        if (w !== Infinity) {
          // Send directed edge
          this.socket.send(`ADD_EDGE ${i} ${j} ${w} 0`);
          if (this.graph.blocked[i * MAX_VERTICES + j] === 1) {
            this.socket.send(`BLOCK_ROAD ${i} ${j} 1`);
          }
        }
      }
    }
  }

  /**
   * Reset vehicle memory spaces to 0.
   */
  clearVehiclesMemory() {
    this.vehicleIntsView.fill(0);
    this.vehicleFloatsView.fill(0);
    this.vehiclePathsView.fill(0);
    
    // Clear sync buffer locks
    this.syncView.fill(0);
    
    this.totalVehicles = 0;
    this.activeVehicles = 0;
    this.metrics.totalFinished = 0;
    this.metrics.throughput = 0;
  }

  /**
   * Dummy worker pool initializer (maintained for signature compatibility).
   */
  async initializeWorkerPool() {
    // Computations migrated to C++ binary. No Web Workers pool required.
    return true;
  }

  /**
   * Determine the size V of the active graph boundary.
   */
  getGraphBoundary() {
    let V_actual = 0;
    for (let i = 0; i < MAX_VERTICES; i++) {
      if (this.graph.activeNodes[i] === 1) {
        V_actual = i + 1;
      }
    }
    return V_actual;
  }

  /**
   * Run Floyd-Warshall shortest path algorithm on C++ backend.
   */
  async calculateShortestPaths() {
    const V = this.getGraphBoundary();
    if (V === 0) return 0;

    const tStart = performance.now();

    // 1. Sync local graph updates to C++ backend
    await this.syncGraphToBackend();

    // 2. Request backend calculation
    const response = await this.sendRequest(`CALCULATE_FW ${this.mode} ${this.numThreads} ${V}`, "FW");

    // 3. Unpack computed distance and routing matrices back to Shared Memory Views
    const boundary = response.boundary;
    const fwDist = response.fwDistance;
    const fwNxt = response.fwNext;

    for (let i = 0; i < boundary; i++) {
      for (let j = 0; j < boundary; j++) {
        const srcIdx = i * boundary + j;
        const dstIdx = i * MAX_VERTICES + j;

        const val = fwDist[srcIdx];
        this.fwDistanceView[dstIdx] = val === null ? Infinity : val;
        this.fwNextView[dstIdx] = fwNxt[srcIdx];
      }
    }

    const tEnd = performance.now();

    if (this.mode === "sequential") {
      this.metrics.fwSequentialTime = response.exec_time;
      this.metrics.fwParallelTime = 0;
      this.metrics.fwSyncOverhead = 0;
      return this.metrics.fwSequentialTime;
    } else {
      this.metrics.fwParallelTime = response.exec_time;
      this.metrics.fwSequentialTime = 0;
      this.metrics.fwSyncOverhead = response.sync_overhead;
      return this.metrics.fwParallelTime;
    }
  }

  /**
   * Spawns a vehicle count with routes computed from current graph via C++ backend.
   * @param {number} count - Total vehicles to generate
   */
  async generateVehicles(count) {
    this.clearVehiclesMemory();

    const seed = Math.floor(Math.random() * 1000000);
    console.log(`[C++ Backend] Spawning ${count} vehicles with seed ${seed}...`);

    // Sync graph first to make sure graph boundary matches
    await this.syncGraphToBackend();

    const response = await this.sendRequest(`SPAWN ${count} ${seed}`, "SPAWN");

    this.totalVehicles = response.totalVehicles;
    this.activeVehicles = response.totalVehicles;

    // Load arrays directly into Shared Memory views
    const ints = response.vehicleInts;
    const floats = response.vehicleFloats;
    const paths = response.vehiclePaths;

    for (let i = 0; i < ints.length; i++) {
      this.vehicleIntsView[i] = ints[i];
    }
    for (let i = 0; i < floats.length; i++) {
      this.vehicleFloatsView[i] = floats[i];
    }
    for (let i = 0; i < paths.length; i++) {
      this.vehiclePathsView[i] = paths[i];
    }

    console.log(`Simulation: Spawned ${this.totalVehicles} vehicles successfully via C++.`);
  }

  /**
   * Run one simulation step (tick update) using passive TICK_REQUEST.
   */
  async step() {
    if (this.state !== "running") return;

    // 1. Send TICK_REQUEST to passive C++ server
    const response = await this.sendRequest(`TICK_REQUEST ${this.mode} ${this.numThreads} ${this.tickRate}`, "TICK");

    this.tickCount = response.tickCount;
    const ints = response.vehicleInts;
    const floats = response.vehicleFloats;
    const activeNodesData = response.activeNodes;

    // 2. Load traffic lights & positions back to Typed Array Views
    const trafficLightsData = response.trafficLights;
    if (trafficLightsData) {
      for (let i = 0; i < trafficLightsData.length; i++) {
        this.trafficLights[i] = trafficLightsData[i];
      }
    }
    for (let i = 0; i < activeNodesData.length; i++) {
      this.graph.activeNodes[i] = activeNodesData[i];
    }
    for (let i = 0; i < ints.length; i++) {
      this.vehicleIntsView[i] = ints[i];
    }
    for (let i = 0; i < floats.length; i++) {
      this.vehicleFloatsView[i] = floats[i];
    }

    // 3. Compile metrics and statistics
    let active = response.metrics.active;
    let finished = response.metrics.finished;
    let waiting = response.metrics.waiting;
    let stuck = response.metrics.stuck;

    const finishedCountThisTick = finished - this.metrics.totalFinished;
    this.metrics.totalFinished = finished;
    this.activeVehicles = active;

    const dt = this.tickRate / 1000;
    this.metrics.throughput = finishedCountThisTick / dt;

    if (this.mode === "sequential") {
      this.metrics.updateSequentialTime = response.exec_time;
      this.metrics.updateParallelTime = 0;
      this.metrics.updateSyncOverhead = 0;
    } else {
      this.metrics.updateParallelTime = response.exec_time;
      this.metrics.updateSequentialTime = 0;
      this.metrics.updateSyncOverhead = response.sync_overhead;
    }

    // 4. Update worker thread monitor states (C++ thread states mapped to syncView)
    // C++ thread execution activity mapping
    this.syncView.fill(0);
    if (this.mode === "parallel") {
      // Mock C++ active thread states inside syncView (offset 4 to 4 + numThreads)
      for (let t = 0; t < this.numThreads; t++) {
        this.syncView[4 + t] = 2; // 2 = VEHICLE_UPDATE
      }
    }

    if (this.onTickCallback) {
      this.onTickCallback({
        tick: this.tickCount,
        active: active,
        finished: finished,
        waiting: waiting,
        stuck: stuck,
        throughput: this.metrics.throughput,
        syncOverhead: response.sync_overhead
      });
    }

    // Auto-stop if all vehicles arrived or got stuck
    if (active === 0) {
      this.state = "finished";
      console.log("Simulation finished: All vehicles processed.");
    }
  }

  /**
   * Runs scientific isolated C++ Floyd-Warshall benchmark loop
   */
  async runCPlusPlusBenchmark() {
    return await this.sendRequest("BENCHMARK", "BENCHMARK_RESULTS");
  }

  /**
   * Tick loop driven by main-thread timers
   */
  runLoop() {
    if (this.state !== "running") return;
    
    const nextTick = () => {
      if (this.state !== "running") return;
      this.step().then(() => {
        setTimeout(nextTick, this.tickRate);
      });
    };
    
    setTimeout(nextTick, this.tickRate);
  }

  /**
   * Start simulation.
   */
  async start() {
    this.state = "running";
    this.runLoop();
  }

  /**
   * Pause simulation.
   */
  pause() {
    this.state = "paused";
  }

  /**
   * Resume simulation.
   */
  resume() {
    this.state = "running";
    this.runLoop();
  }

  /**
   * Stop simulation.
   */
  stop() {
    this.state = "stopped";
  }

  /**
   * Reset simulation states.
   */
  reset() {
    this.state = "stopped";
    this.tickCount = 0;
    this.clearVehiclesMemory();
  }

  /**
   * Reconstruct route helper using precalculated next-hop matrix (fwNext)
   */
  reconstructPath(start, end) {
    if (this.fwNextView[start * MAX_VERTICES + end] === -1) return [];
    const path = [start];
    let curr = start;
    while (curr !== end) {
      curr = this.fwNextView[curr * MAX_VERTICES + end];
      if (curr === -1) return []; // Broken path
      path.push(curr);
      if (path.length > MAX_VERTICES) return []; // Loop protection
    }
    return path;
  }
}
