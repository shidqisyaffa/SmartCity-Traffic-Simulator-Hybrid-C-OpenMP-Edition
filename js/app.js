/**
 * SmartCity Traffic Simulator - Main App Module (js/app.js)
 * Ties UI elements, simulation engine, renderer, and benchmarks together.
 * Manages click selections, drag panning, zoom operations, stats cards, and threads monitors.
 */

import { Simulation, MAX_VEHICLES } from './simulation.js';
import { CityGraph, MAX_VERTICES } from './graph.js';
import { CanvasRenderer } from './renderer.js';
import { runSystemTests } from './tests.js';

document.addEventListener("DOMContentLoaded", async () => {
  // Run Diagnostics Suite
  runSystemTests();

  // Initialize core simulation and canvas renderer
  const sim = new Simulation();
  const canvas = document.getElementById("sim-canvas");
  const renderer = new CanvasRenderer(canvas, sim);
  
  // Track visual loop state
  let animationFrameId = null;

  // DOM UI references
  const compModeSelect = document.getElementById("comp-mode");
  const threadSlider = document.getElementById("thread-count");
  const threadVal = document.getElementById("thread-val");
  const threadGroup = document.getElementById("thread-group");
  const tickSlider = document.getElementById("tick-rate");
  const tickVal = document.getElementById("tick-val");
  const presetSelect = document.getElementById("preset-graph");
  const btnLoadGraph = document.getElementById("btn-load-graph");
  const vehicleSelect = document.getElementById("vehicle-count");
  const btnSpawnVehicles = document.getElementById("btn-spawn-vehicles");
  const btnAddVehicleManual = document.getElementById("btn-add-vehicle-manual");
  const manualVehCountInput = document.getElementById("manual-veh-count");
  const manualVehOriginSelect = document.getElementById("manual-veh-origin");
  const manualVehTargetSelect = document.getElementById("manual-veh-target");
  
  const btnStart = document.getElementById("btn-start");
  const btnPause = document.getElementById("btn-pause");
  const btnResume = document.getElementById("btn-resume");
  const btnStop = document.getElementById("btn-stop");
  const btnReset = document.getElementById("btn-reset");

  const statusBadge = document.getElementById("status-badge");
  const actionNotifier = document.getElementById("action-notifier");

  // Presentation Mode Elements
  const presModeCheckbox = document.getElementById("presentation-mode");
  const presStatusText = document.getElementById("pres-status");

  // Zoom / Pan elements
  const btnZoomIn = document.getElementById("btn-zoom-in");
  const btnZoomOut = document.getElementById("btn-zoom-out");
  const btnZoomFit = document.getElementById("btn-zoom-fit");

  // Dashboard Items
  const metricTick = document.getElementById("metric-tick");
  const metricThroughput = document.getElementById("metric-throughput");
  const metricActive = document.getElementById("metric-active");
  const metricFinished = document.getElementById("metric-finished");
  const metricTime = document.getElementById("metric-time");
  const metricProgressPct = document.getElementById("metric-progress-pct");
  const timelineProgressBar = document.getElementById("timeline-progress-bar");

  // Vehicle Status distribution bars
  const distBarMoving = document.getElementById("dist-bar-moving");
  const distBarWaiting = document.getElementById("dist-bar-waiting");
  const distBarStuck = document.getElementById("dist-bar-stuck");
  const distBarFinished = document.getElementById("dist-bar-finished");

  // Congestion Card Elements
  const congestionAvg = document.getElementById("congestion-avg");
  const congestionMaxRoad = document.getElementById("congestion-max-road");
  const congestionBusyNode = document.getElementById("congestion-busy-node");

  // Graph Statistics Panel
  const statNodesEdges = document.getElementById("stat-nodes-edges");
  const statDensity = document.getElementById("stat-density");
  const statAvgDegree = document.getElementById("stat-avg-degree");
  const statBlockedCount = document.getElementById("stat-blocked-count");

  // Thread activity lists
  const workerActivityList = document.getElementById("worker-activity-list");
  const metricFwTime = document.getElementById("metric-fw-time");
  const metricUpdateTime = document.getElementById("metric-update-time");
  const metricSyncOverhead = document.getElementById("metric-sync-overhead");

  // Interactive buttons
  const btnBlockAll = document.getElementById("btn-block-all");
  const btnUnblockAll = document.getElementById("btn-unblock-all");
  const btnExportCsv = document.getElementById("btn-export-csv");
  const btnExportJson = document.getElementById("btn-export-json");

  // Benchmark tabs & high impact cards
  const tabLive = document.getElementById("tab-live");
  const tabBench = document.getElementById("tab-bench");
  const contentLive = document.getElementById("tab-content-live");
  const contentBench = document.getElementById("tab-content-bench");
  
  const btnRunBenchmark = document.getElementById("btn-run-benchmark");
  const benchResults = document.getElementById("bench-results");
  const chartExecTime = document.getElementById("chart-exec-time");
  const chartSpeedup = document.getElementById("chart-speedup");
  const chartEfficiency = document.getElementById("chart-efficiency");
  const amdahlAnalysis = document.getElementById("amdahl-analysis");

  const benchValSeq = document.getElementById("bench-val-seq");
  const benchValPar = document.getElementById("bench-val-par");
  const benchValSpeedup = document.getElementById("bench-val-speedup");
  const benchValEff = document.getElementById("bench-val-eff");

  // Edit Mode Buttons
  const btnModeSelect = document.getElementById("btn-mode-select");
  const btnModeAddNode = document.getElementById("btn-mode-add-node");
  const btnModeRemoveNode = document.getElementById("btn-mode-remove-node");
  const btnModeAddRoad = document.getElementById("btn-mode-add-road");
  const btnModeRemoveRoad = document.getElementById("btn-mode-remove-road");
  const editHelpText = document.getElementById("edit-mode-help");

  // Dialog Modals
  const editRoadModal = document.getElementById("edit-road-modal");
  const modalNodeFrom = document.getElementById("modal-node-from");
  const modalNodeTo = document.getElementById("modal-node-to");
  const modalRoadWeight = document.getElementById("modal-road-weight");
  const modalRoadTwoway = document.getElementById("modal-road-twoway");
  const modalBtnCancel = document.getElementById("modal-btn-cancel");
  const modalBtnCreate = document.getElementById("modal-btn-create");

  const confirmModal = document.getElementById("confirm-modal");
  const confirmTitle = document.getElementById("confirm-title");
  const confirmMessage = document.getElementById("confirm-message");
  const confirmBtnCancel = document.getElementById("confirm-btn-cancel");
  const confirmBtnOk = document.getElementById("confirm-btn-ok");

  let confirmCallback = null;
  let roadModalFrom = null;
  let roadModalTo = null;

  // Graph Editing States
  let editMode = "select"; // select, add-node, remove-node, add-road, remove-road
  let selectedStartNodeId = null;

  // Setup initial state
  updateUIForStatus("stopped");
  generatePresetGraph("grid"); // load grid by default
  renderer.draw();

  // ── Floating Info Cards — Collapse / Expand ──────────────────
  function bindInfoCardToggle(toggleId, cardId) {
    const btn  = document.getElementById(toggleId);
    const card = document.getElementById(cardId);
    if (!btn || !card) return;
    btn.addEventListener("click", () => {
      card.classList.toggle("is-collapsed");
    });
  }
  bindInfoCardToggle("toggle-vehicle-types",  "card-vehicle-types");
  bindInfoCardToggle("toggle-traffic-heatmap","card-traffic-heatmap");
  // ─────────────────────────────────────────────────────────────


  // Draw loop for Canvas rendering (60 FPS visual smoothness)
  function renderLoop() {
    renderer.draw();
    updateThreadVisuals(); // Update worker bars at rendering tick
    animationFrameId = requestAnimationFrame(renderLoop);
  }
  
  // Start drawing canvas
  renderLoop();

  // ── Graph Edit Mode Handlers & Utilities ──────────────────────
  function getClickedNode(mouseX, mouseY, maxDist = 15) {
    const V = sim.getGraphBoundary();
    let clickedNodeId = null;
    let minDist = maxDist;
    for (let i = 0; i < V; i++) {
      if (sim.graph.activeNodes[i] !== 1) continue;
      const nodeScreen = renderer.toScreen(sim.graph.coords[i * 2], sim.graph.coords[i * 2 + 1]);
      const dist = Math.hypot(mouseX - nodeScreen.x, mouseY - nodeScreen.y);
      if (dist < minDist) {
        minDist = dist;
        clickedNodeId = i;
      }
    }
    return clickedNodeId;
  }

  function getClickedEdge(mouseX, mouseY, maxDist = 8) {
    const V = sim.getGraphBoundary();
    let clickedEdge = null;
    let minDist = maxDist;
    for (let i = 0; i < V; i++) {
      if (sim.graph.activeNodes[i] !== 1) continue;
      const uCoords = renderer.toScreen(sim.graph.coords[i * 2], sim.graph.coords[i * 2 + 1]);
      for (let j = 0; j < V; j++) {
        if (sim.graph.activeNodes[j] !== 1 || i === j) continue;
        const w = sim.graph.weights[i * MAX_VERTICES + j];
        if (w === Infinity) continue;

        const vCoords = renderer.toScreen(sim.graph.coords[j * 2], sim.graph.coords[j * 2 + 1]);
        const dx = vCoords.x - uCoords.x;
        const dy = vCoords.y - uCoords.y;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) continue;

        let t = ((mouseX - uCoords.x) * dx + (mouseY - uCoords.y) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));

        const nearestX = uCoords.x + t * dx;
        const nearestY = uCoords.y + t * dy;
        const dist = Math.hypot(mouseX - nearestX, mouseY - nearestY);
        if (dist < minDist) {
          minDist = dist;
          clickedEdge = { from: i, to: j };
        }
      }
    }
    return clickedEdge;
  }

  function setEditMode(mode) {
    if (sim.state === "running" && mode !== "select") {
      notify("Please pause or stop simulation to edit the graph.");
      return;
    }

    editMode = mode;
    selectedStartNodeId = null;
    renderer.editMode = mode;
    renderer.selectedStartNodeId = null;
    renderer.hoveredNodeId = null;
    renderer.hoveredEdge = null;

    const btns = [btnModeSelect, btnModeAddNode, btnModeRemoveNode, btnModeAddRoad, btnModeRemoveRoad];
    btns.forEach(btn => {
      if (btn) btn.classList.remove("active");
    });

    let activeBtn = null;
    let helpText = "";
    switch(mode) {
      case "select":
        activeBtn = btnModeSelect;
        helpText = "Active Mode: Select. Click on vehicle to highlight path.";
        break;
      case "add-node":
        activeBtn = btnModeAddNode;
        helpText = "Active Mode: Add Node. Click empty space on canvas to place an intersection.";
        break;
      case "remove-node":
        activeBtn = btnModeRemoveNode;
        helpText = "Active Mode: Remove Node. Click an intersection to delete it.";
        break;
      case "add-road":
        activeBtn = btnModeAddRoad;
        helpText = "Active Mode: Add Road. Click start intersection then end intersection.";
        break;
      case "remove-road":
        activeBtn = btnModeRemoveRoad;
        helpText = "Active Mode: Remove Road. Click a road segment to delete it.";
        break;
    }
    
    if (activeBtn) activeBtn.classList.add("active");
    if (editHelpText) editHelpText.textContent = helpText;
    notify(`Switched to ${mode.toUpperCase()} mode.`);
    renderer.draw();
  }

  if (btnModeSelect) btnModeSelect.addEventListener("click", () => setEditMode("select"));
  if (btnModeAddNode) btnModeAddNode.addEventListener("click", () => setEditMode("add-node"));
  if (btnModeRemoveNode) btnModeRemoveNode.addEventListener("click", () => setEditMode("remove-node"));
  if (btnModeAddRoad) btnModeAddRoad.addEventListener("click", () => setEditMode("add-road"));
  if (btnModeRemoveRoad) btnModeRemoveRoad.addEventListener("click", () => setEditMode("remove-road"));

  function showConfirmModal(title, message, callback) {
    confirmTitle.textContent = title;
    confirmMessage.textContent = message;
    confirmCallback = callback;
    confirmModal.classList.remove("hidden");
  }

  function closeConfirmModal() {
    confirmModal.classList.add("hidden");
    confirmCallback = null;
  }

  if (confirmBtnCancel) confirmBtnCancel.addEventListener("click", () => {
    closeConfirmModal();
    notify("Action cancelled.");
  });

  if (confirmBtnOk) confirmBtnOk.addEventListener("click", () => {
    if (confirmCallback) confirmCallback();
    closeConfirmModal();
  });

  function showAddRoadModal(from, to) {
    roadModalFrom = from;
    roadModalTo = to;
    modalNodeFrom.textContent = from;
    modalNodeTo.textContent = to;
    modalRoadWeight.value = 10;
    modalRoadTwoway.value = "twoway";
    editRoadModal.classList.remove("hidden");
  }

  function closeAddRoadModal() {
    editRoadModal.classList.add("hidden");
    selectedStartNodeId = null;
    renderer.selectedStartNodeId = null;
  }

  if (modalBtnCancel) modalBtnCancel.addEventListener("click", () => {
    closeAddRoadModal();
    notify("Road creation cancelled.");
  });

  if (modalBtnCreate) modalBtnCreate.addEventListener("click", async () => {
    const weight = parseFloat(modalRoadWeight.value);
    const direction = modalRoadTwoway.value;
    if (isNaN(weight) || weight <= 0) {
      alert("Weight must be a positive number.");
      return;
    }
    const isTwoWay = direction === "twoway";
    
    sim.graph.addEdge(roadModalFrom, roadModalTo, weight, isTwoWay);
    closeAddRoadModal();
    
    notify("Synchronizing graph with backend...");
    await sim.calculateShortestPaths();
    updateGraphStatsPanel();
    notify(`Road connection created between Intersection #${roadModalFrom} and #${roadModalTo}.`);
    renderer.draw();
  });

  // Helper: notify user in notifier box
  function notify(msg) {
    actionNotifier.textContent = msg;
  }

  // Handle Presentation Mode Toggle
  presModeCheckbox.addEventListener("change", () => {
    const active = presModeCheckbox.checked;
    renderer.presentationMode = active;
    
    if (active) {
      document.body.classList.add("pres-mode-on");
      presStatusText.textContent = "ON";
      presStatusText.classList.add("active");
      notify("Presentation Mode [ON]: Visual glows, line widths and text size scaled up for display.");
    } else {
      document.body.classList.remove("pres-mode-on");
      presStatusText.textContent = "OFF";
      presStatusText.classList.remove("active");
      notify("Presentation Mode [OFF]: Default performance rendering mode restored.");
    }
    renderer.draw();
  });

  // Handle Zoom Operations
  btnZoomIn.addEventListener("click", () => {
    renderer.zoomLevel = Math.min(renderer.zoomLevel * 1.25, 4.0);
    notify(`Zoom Level: ${(renderer.zoomLevel * 100).toFixed(0)}%`);
  });

  btnZoomOut.addEventListener("click", () => {
    renderer.zoomLevel = Math.max(renderer.zoomLevel / 1.25, 0.45);
    notify(`Zoom Level: ${(renderer.zoomLevel * 100).toFixed(0)}%`);
  });

  btnZoomFit.addEventListener("click", () => {
    renderer.resetView();
    notify("View aligned to graph bounds.");
  });

  // Drag Panning Event Handlers
  canvas.addEventListener("mousedown", (e) => {
    renderer.isDragging = true;
    renderer.startX = e.clientX;
    renderer.startY = e.clientY;
    renderer.hasDragged = false;
  });

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);

    renderer.mouseScreenX = mouseX;
    renderer.mouseScreenY = mouseY;

    if (!renderer.isDragging) {
      if (editMode === "remove-node" || editMode === "add-road") {
        renderer.hoveredNodeId = getClickedNode(mouseX, mouseY, 15);
      } else {
        renderer.hoveredNodeId = null;
      }

      if (editMode === "remove-road") {
        renderer.hoveredEdge = getClickedEdge(mouseX, mouseY, 8);
      } else {
        renderer.hoveredEdge = null;
      }

      updateCursorStyle(mouseX, mouseY);
      return;
    }

    const dx = e.clientX - renderer.startX;
    const dy = e.clientY - renderer.startY;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      renderer.hasDragged = true;
    }
    
    renderer.panX += dx;
    renderer.panY += dy;
    
    renderer.startX = e.clientX;
    renderer.startY = e.clientY;
  });

  window.addEventListener("mouseup", () => {
    renderer.isDragging = false;
  });

  function updateCursorStyle(mouseX, mouseY) {
    if (editMode === "select") {
      const node = getClickedNode(mouseX, mouseY, 15);
      const edge = getClickedEdge(mouseX, mouseY, 8);
      if (node !== null || edge !== null) {
        canvas.style.cursor = "pointer";
      } else {
        canvas.style.cursor = "default";
      }
    } else if (editMode === "add-node") {
      canvas.style.cursor = "crosshair";
    } else if (editMode === "remove-node") {
      const node = getClickedNode(mouseX, mouseY, 15);
      if (node !== null) {
        canvas.style.cursor = "pointer";
      } else {
        canvas.style.cursor = "not-allowed";
      }
    } else if (editMode === "add-road") {
      const node = getClickedNode(mouseX, mouseY, 15);
      if (node !== null) {
        canvas.style.cursor = "pointer";
      } else {
        canvas.style.cursor = "cell";
      }
    } else if (editMode === "remove-road") {
      const edge = getClickedEdge(mouseX, mouseY, 8);
      if (edge !== null) {
        canvas.style.cursor = "pointer";
      } else {
        canvas.style.cursor = "not-allowed";
      }
    }
  }

  // Handle mode select
  compModeSelect.addEventListener("change", () => {
    sim.mode = compModeSelect.value;
    if (sim.mode === "sequential") {
      threadGroup.style.opacity = "0.4";
      threadSlider.disabled = true;
      notify("Switched to Sequential computing mode.");
    } else {
      threadGroup.style.opacity = "1";
      threadSlider.disabled = false;
      notify(`Switched to Parallel computing mode with ${sim.numThreads} threads.`);
    }
    updateThreadVisuals();
  });

  // Handle threads slider
  threadSlider.addEventListener("input", async () => {
    const val = parseInt(threadSlider.value);
    threadVal.textContent = val;
    sim.numThreads = val;
    notify(`Thread allocation updated to ${val}.`);
    
    // Spawn threads if simulation is running/paused in parallel mode
    if (sim.state !== "stopped" && sim.mode === "parallel") {
      notify(`Re-spawning worker threads pool to ${val}...`);
      await sim.initializeWorkerPool();
      notify(`Worker pool successfully adjusted to ${val} threads.`);
    }
    updateThreadVisuals();
  });

  // Handle tick interval slider
  tickSlider.addEventListener("input", () => {
    const val = parseInt(tickSlider.value);
    tickVal.textContent = val + "ms";
    sim.tickRate = val;
  });

  // Handle Load Graph
  btnLoadGraph.addEventListener("click", async () => {
    const type = presetSelect.value;
    generatePresetGraph(type);
    renderer.resetView(); // auto-center new topology
    await sim.clearVehicles();
    notify("Recomputing preset routing matrices...");
    await sim.calculateShortestPaths();
    updateDashboardMetrics();
    updateGraphStatsPanel();
  });

  // Handle Spawn Vehicles
  btnSpawnVehicles.addEventListener("click", async () => {
    const count = parseInt(vehicleSelect.value);
    notify(`Calculating shortest routing matrices using Floyd-Warshall...`);
    
    btnSpawnVehicles.disabled = true;
    const fwTime = await sim.calculateShortestPaths();
    
    notify(`Paths calculated in ${fwTime.toFixed(2)}ms. Spawning ${count} vehicles...`);
    await sim.generateVehicles(count);
    
    btnSpawnVehicles.disabled = false;
    renderer.selectedVehicleId = null; // Reset selection
    updateDashboardMetrics();
    notify(`Spawned ${sim.totalVehicles} vehicles. Ready to simulate.`);
  });

  // Handle Manual Vehicle Spawner
  if (btnAddVehicleManual) {
    btnAddVehicleManual.addEventListener("click", async () => {
      const count = parseInt(manualVehCountInput.value);
      if (isNaN(count) || count <= 0) {
        alert("Please enter a valid positive number.");
        return;
      }
      
      const V = sim.getGraphBoundary();
      if (V < 2) {
        notify("Need at least 2 active intersections to spawn and route vehicles.");
        return;
      }

      const origin = parseInt(manualVehOriginSelect.value);
      const target = parseInt(manualVehTargetSelect.value);

      if (origin !== -1 && target !== -1 && origin === target) {
        alert("Start and destination nodes cannot be the same intersection.");
        return;
      }

      btnAddVehicleManual.disabled = true;
      notify("Calculating path matrices...");
      await sim.calculateShortestPaths();
      
      notify(`Spawning ${count} vehicles manually...`);
      const success = await sim.addManualVehicles(count, origin, target);
      
      btnAddVehicleManual.disabled = false;
      if (success) {
        // If simulation was finished, reset state to running or paused to allow continued simulation!
        if (sim.state === "finished" && sim.activeVehicles > 0) {
          updateUIForStatus("paused"); // allow resume
        }
        updateDashboardMetrics();
        notify(`Manually spawned ${count} vehicles. Total: ${sim.totalVehicles}.`);
      } else {
        notify("Failed to spawn vehicles. Make sure graph is connected.");
      }
      renderer.draw();
    });
  }

  // Tab switching
  tabLive.addEventListener("click", () => {
    tabLive.classList.add("active");
    tabBench.classList.remove("active");
    contentLive.classList.remove("hidden");
    contentBench.classList.add("hidden");
  });

  tabBench.addEventListener("click", () => {
    tabBench.classList.add("active");
    tabLive.classList.remove("active");
    contentBench.classList.remove("hidden");
    contentLive.classList.add("hidden");
  });

  // Action buttons events
  btnStart.addEventListener("click", async () => {
    if (sim.totalVehicles === 0) {
      notify("Please spawn vehicles before starting.");
      return;
    }
    
    notify("Starting simulation engine...");
    updateUIForStatus("running");
    
    // Calculate path matrices initially
    await sim.calculateShortestPaths();
    await sim.start();
    notify("Simulation running...");
  });

  btnPause.addEventListener("click", () => {
    sim.pause();
    updateUIForStatus("paused");
    notify("Simulation paused.");
  });

  btnResume.addEventListener("click", () => {
    sim.resume();
    updateUIForStatus("running");
    notify("Simulation resumed.");
  });

  btnStop.addEventListener("click", () => {
    sim.stop();
    updateUIForStatus("stopped");
    notify("Simulation stopped. Workers terminated.");
    updateThreadVisuals();
  });

  btnReset.addEventListener("click", async () => {
    await sim.reset();
    renderer.selectedVehicleId = null; // Clear selection
    updateUIForStatus("stopped");
    notify("Simulation reset. All metrics cleared.");
    updateDashboardMetrics();
    updateThreadVisuals();
  });

  // Tick updates listener
  sim.onTickCallback = (metrics) => {
    updateDashboardMetrics(metrics);
  };

  // Sync dashboard values
  function updateDashboardMetrics(metrics = null) {
    // 1. Timeline & Progress calculations
    const timeVal = sim.tickCount * (sim.tickRate / 1000);
    metricTime.textContent = timeVal.toFixed(1) + "s";

    let finishedCount = 0;
    if (metrics) {
      metricTick.textContent = metrics.tick;
      metricThroughput.textContent = metrics.throughput.toFixed(1) + " v/s";
      metricActive.textContent = metrics.active;
      metricFinished.textContent = metrics.finished;
      finishedCount = metrics.finished;
    } else {
      metricTick.textContent = sim.tickCount;
      metricThroughput.textContent = "0.0 v/s";
      metricActive.textContent = sim.activeVehicles;
      metricFinished.textContent = sim.metrics.totalFinished;
      finishedCount = sim.metrics.totalFinished;
    }

    const progressPct = sim.totalVehicles > 0 
      ? Math.round((finishedCount / sim.totalVehicles) * 100) 
      : 0;
    
    metricProgressPct.textContent = progressPct + "%";
    timelineProgressBar.style.width = progressPct + "%";

    // 2. Vehicle Status Distribution visual bar updates
    let moving = 0, waiting = 0, stuck = 0;
    for (let i = 0; i < sim.totalVehicles; i++) {
      const state = sim.vehicleIntsView[i * 8 + 2];
      if (state === 1) moving++;
      else if (state === 2) waiting++;
      else if (state === 3) stuck++;
    }

    const total = sim.totalVehicles || 1;
    distBarMoving.style.width = ((moving / total) * 100) + "%";
    distBarWaiting.style.width = ((waiting / total) * 100) + "%";
    distBarStuck.style.width = ((stuck / total) * 100) + "%";
    distBarFinished.style.width = ((finishedCount / total) * 100) + "%";

    // 3. Execution time readouts
    if (sim.mode === "sequential") {
      metricFwTime.textContent = sim.metrics.fwSequentialTime.toFixed(2) + " ms";
      metricUpdateTime.textContent = sim.metrics.updateSequentialTime.toFixed(2) + " ms";
      metricSyncOverhead.textContent = "0.00 ms";
    } else {
      metricFwTime.textContent = sim.metrics.fwParallelTime.toFixed(2) + " ms";
      metricUpdateTime.textContent = sim.metrics.updateParallelTime.toFixed(2) + " ms";
      const totalSyncOverhead = sim.metrics.fwSyncOverhead + sim.metrics.updateSyncOverhead;
      metricSyncOverhead.textContent = totalSyncOverhead.toFixed(2) + " ms";
    }

    // 4. Update Congestion Summary calculations
    updateCongestionSummary();

    if (sim.state === "finished") {
      updateUIForStatus("finished");
      notify("Simulation completed.");
    }
  }

  // Update Congestion metrics on dashboard
  function updateCongestionSummary() {
    // Keep last active congestion stats when simulation is finished
    // or when the last tick runs and all vehicles have just arrived (active = 0)
    if (sim.state === "finished" || (sim.state === "running" && sim.activeVehicles === 0)) {
      return;
    }

    const V = sim.getGraphBoundary();
    if (V === 0) {
      congestionAvg.textContent = "0.0%";
      congestionMaxRoad.textContent = "None";
      congestionBusyNode.textContent = "None";
      return;
    }

    // Map active vehicles to edges & count waiting vehicles on intersections
    const edgeVehiclesCount = {};
    const nodeWaitingCount = new Int32Array(MAX_VERTICES);
    const edgeCapacity = 10;
    let totalCongestion = 0;
    let activeEdges = 0;
    let maxEdgeKey = "None";
    let maxEdgeVal = -1;

    for (let i = 0; i < sim.totalVehicles; i++) {
      const state = sim.vehicleIntsView[i * 8 + 2];
      if (state === 1 || state === 2) {
        const currentPathIdx = sim.vehicleIntsView[i * 8 + 5];
        const vPathOffset = i * 100;
        const u = sim.vehiclePathsView[vPathOffset + currentPathIdx];
        const v = sim.vehiclePathsView[vPathOffset + currentPathIdx + 1];

        if (u !== undefined && v !== undefined) {
          const key = `${u} ➔ ${v}`;
          edgeVehiclesCount[key] = (edgeVehiclesCount[key] || 0) + 1;
          if (edgeVehiclesCount[key] > maxEdgeVal) {
            maxEdgeVal = edgeVehiclesCount[key];
            maxEdgeKey = key;
          }
        }
        
        if (state === 2 && u !== undefined) {
          nodeWaitingCount[u]++; // count waiting at intersection u
        }
      }
    }

    // Average density calculation
    for (let i = 0; i < V; i++) {
      if (sim.graph.activeNodes[i] !== 1) continue;
      for (let j = 0; j < V; j++) {
        if (sim.graph.activeNodes[j] === 1 && i !== j && sim.graph.weights[i * MAX_VERTICES + j] !== Infinity) {
          const count = edgeVehiclesCount[`${i} ➔ ${j}`] || 0;
          totalCongestion += Math.min(count / edgeCapacity, 1.0);
          activeEdges++;
        }
      }
    }

    const avgDensity = activeEdges > 0 ? (totalCongestion / activeEdges) * 100 : 0;
    congestionAvg.textContent = avgDensity.toFixed(1) + "%";
    congestionMaxRoad.textContent = maxEdgeKey;

    // Find busiest intersection node
    let busiestNode = "None";
    let maxNodeWaiting = -1;
    for (let i = 0; i < V; i++) {
      if (sim.graph.activeNodes[i] === 1 && nodeWaitingCount[i] > maxNodeWaiting) {
        maxNodeWaiting = nodeWaitingCount[i];
        if (maxNodeWaiting > 0) {
          busiestNode = `Intersection #${i}`;
        }
      }
    }
    congestionBusyNode.textContent = busiestNode;
  }

  // Update Graph Statistics widget values
  function updateGraphStatsPanel() {
    const V = sim.getGraphBoundary();

    // Populate manual vehicle spawner dropdowns with active nodes
    if (manualVehOriginSelect && manualVehTargetSelect) {
      const prevOrigin = manualVehOriginSelect.value;
      const prevTarget = manualVehTargetSelect.value;
      
      let html = `<option value="-1">Random</option>`;
      for (let i = 0; i < V; i++) {
        if (sim.graph.activeNodes[i] === 1) {
          html += `<option value="${i}">Intersection #${i}</option>`;
        }
      }
      
      manualVehOriginSelect.innerHTML = html;
      manualVehTargetSelect.innerHTML = html;
      
      // Restore selections if still valid
      manualVehOriginSelect.value = prevOrigin;
      if (manualVehOriginSelect.value !== prevOrigin) manualVehOriginSelect.value = "-1";
      
      manualVehTargetSelect.value = prevTarget;
      if (manualVehTargetSelect.value !== prevTarget) manualVehTargetSelect.value = "-1";
    }

    if (V === 0) {
      statNodesEdges.textContent = "0 / 0";
      statDensity.textContent = "0.0%";
      statAvgDegree.textContent = "0.00";
      statBlockedCount.textContent = "0";
      return;
    }

    let edges = 0;
    let blockedCount = 0;
    let activeNodes = 0;

    for (let i = 0; i < V; i++) {
      if (sim.graph.activeNodes[i] === 1) {
        activeNodes++;
        for (let j = 0; j < V; j++) {
          if (sim.graph.activeNodes[j] === 1 && i !== j) {
            const w = sim.graph.weights[i * MAX_VERTICES + j];
            if (w !== Infinity) {
              edges++;
              if (sim.graph.blocked[i * MAX_VERTICES + j] === 1) {
                blockedCount++;
              }
            }
          }
        }
      }
    }

    // Graph Density calculation
    const densityVal = activeNodes > 1 ? (edges / (activeNodes * (activeNodes - 1))) * 100 : 0;
    const avgDegreeVal = activeNodes > 0 ? edges / activeNodes : 0;

    statNodesEdges.textContent = `${activeNodes} / ${edges}`;
    statDensity.textContent = densityVal.toFixed(1) + "%";
    statAvgDegree.textContent = avgDegreeVal.toFixed(2);
    statBlockedCount.textContent = blockedCount;
  }

  // Update visual worker activity progress bars in right panel
  function updateThreadVisuals() {
    if (sim.mode === "sequential" || sim.state === "stopped") {
      workerActivityList.innerHTML = `<div class="description-text" style="text-align:center; padding: 10px 0;">Thread monitor inactive in Sequential Mode.</div>`;
      return;
    }

    let html = "";
    for (let i = 0; i < sim.numThreads; i++) {
      const stateCode = sim.syncView[4 + i]; // Offset by 4 in sync array
      let stateText = "IDLE";
      let barClass = "worker-idle";
      
      if (stateCode === 1) {
        stateText = "FW COMPUTE";
        barClass = "worker-fw";
      } else if (stateCode === 2) {
        stateText = "VEHICLE UPDATE";
        barClass = "worker-update";
      }

      html += `
        <div class="worker-bar-item">
          <div class="worker-bar-lbl">
            <span>Worker #${i + 1}</span>
            <span class="worker-bar-state" style="color: ${stateCode === 1 ? '#a5b4fc' : stateCode === 2 ? '#34d399' : '#9ca3af'}">${stateText}</span>
          </div>
          <div class="worker-bar-track">
            <div class="worker-bar-fill ${barClass}"></div>
          </div>
        </div>
      `;
    }
    workerActivityList.innerHTML = html;
  }

  // Update button visibility
  function updateUIForStatus(status) {
    sim.state = status;
    statusBadge.className = `badge badge-${status}`;
    statusBadge.textContent = status;

    if (status === "running") {
      btnStart.style.display = "none";
      btnPause.style.display = "block";
      btnResume.style.display = "none";
      btnStop.disabled = false;
      btnPause.disabled = false;
      btnResume.disabled = true;
      btnLoadGraph.disabled = true;
      btnSpawnVehicles.disabled = true;
    } else if (status === "paused") {
      btnStart.style.display = "none";
      btnPause.style.display = "none";
      btnResume.style.display = "block";
      btnStop.disabled = false;
      btnPause.disabled = true;
      btnResume.disabled = false;
    } else if (status === "stopped" || status === "finished") {
      btnStart.style.display = "block";
      btnPause.style.display = "none";
      btnResume.style.display = "none";
      btnStop.disabled = true;
      btnPause.disabled = true;
      btnResume.disabled = true;
      btnLoadGraph.disabled = false;
      btnSpawnVehicles.disabled = false;
    }
  }

  // Road intervention selection handler & Vehicle Selection Click
  canvas.addEventListener("mouseup", async (e) => {
    // If dragging has occurred, prevent processing click logic
    if (renderer.hasDragged) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);
    const clickedWorld = renderer.toWorld(mouseX, mouseY);

    if (editMode === "select") {
      let selectedVehicleId = null;
      let minVehicleDist = 12; // selection threshold radius in px

      for (let i = 0; i < sim.totalVehicles; i++) {
        const state = sim.vehicleIntsView[i * 8 + 2];
        if (state !== 1 && state !== 2 && state !== 3) continue;

        const vx = sim.vehicleFloatsView[i * 8 + 3];
        const vy = sim.vehicleFloatsView[i * 8 + 4];
        const dist = Math.hypot(clickedWorld.x - vx, clickedWorld.y - vy);
        
        const screenDist = dist * renderer.scale * renderer.zoomLevel;
        if (screenDist < minVehicleDist) {
          minVehicleDist = screenDist;
          selectedVehicleId = i;
        }
      }

      if (selectedVehicleId !== null) {
        renderer.selectedVehicleId = selectedVehicleId;
        notify(`Selected Vehicle #${selectedVehicleId}. Active path highlighted.`);
        renderer.draw();
        return;
      }

      if (sim.state === "running") {
        notify("Please pause or stop simulation to block/unblock roads.");
        return;
      }

      const clickedEdge = getClickedEdge(mouseX, mouseY, 8);
      if (clickedEdge) {
        const from = clickedEdge.from;
        const to = clickedEdge.to;
        const isBlocked = sim.graph.isBlocked(from, to);

        if (isBlocked) {
          sim.graph.unblockRoad(from, to, true); // unblock two-way
          notify(`Road segment ${from} ➔ ${to} Unblocked.`);
        } else {
          sim.graph.blockRoad(from, to, true); // block two-way
          notify(`Road segment ${from} ➔ ${to} Blocked! Dynamic rerouting triggered.`);
        }

        notify("Recalculating routing matrices...");
        const t = await sim.calculateShortestPaths();
        notify(`Routing matrices updated in ${t.toFixed(2)}ms.`);
        updateGraphStatsPanel();
        renderer.draw();
      } else {
        renderer.selectedVehicleId = null;
        renderer.draw();
      }
    } 
    else if (editMode === "add-node") {
      if (sim.state === "running") {
        notify("Please pause or stop simulation to edit the graph.");
        return;
      }

      const nearNode = getClickedNode(mouseX, mouseY, 25);
      if (nearNode !== null) {
        notify("Too close to an existing node. Choose an empty space.");
        return;
      }

      let newNodeId = -1;
      for (let i = 0; i < MAX_VERTICES; i++) {
        if (sim.graph.activeNodes[i] !== 1) {
          newNodeId = i;
          break;
        }
      }

      if (newNodeId === -1) {
        notify("Maximum node limit reached.");
        return;
      }

      sim.graph.addVertex(newNodeId, clickedWorld.x, clickedWorld.y);
      notify(`Added Intersection #${newNodeId} at (${clickedWorld.x.toFixed(1)}, ${clickedWorld.y.toFixed(1)}).`);
      
      await sim.calculateShortestPaths();
      updateGraphStatsPanel();
      renderer.draw();
    } 
    else if (editMode === "remove-node") {
      if (sim.state === "running") {
        notify("Please pause or stop simulation to edit the graph.");
        return;
      }

      const node = getClickedNode(mouseX, mouseY, 15);
      if (node === null) return;

      showConfirmModal(
        "Remove Intersection",
        `Are you sure you want to remove Intersection #${node}? This will also delete all connected roads.`,
        async () => {
          sim.graph.removeVertex(node);
          notify(`Intersection #${node} and its connections removed.`);
          await sim.calculateShortestPaths();
          updateGraphStatsPanel();
          renderer.draw();
        }
      );
    } 
    else if (editMode === "add-road") {
      if (sim.state === "running") {
        notify("Please pause or stop simulation to edit the graph.");
        return;
      }

      const node = getClickedNode(mouseX, mouseY, 15);
      if (node === null) return;

      if (selectedStartNodeId === null) {
        selectedStartNodeId = node;
        renderer.selectedStartNodeId = node;
        notify(`Selected Node #${node} as origin. Click target node to connect.`);
      } else {
        if (selectedStartNodeId === node) {
          selectedStartNodeId = null;
          renderer.selectedStartNodeId = null;
          notify("Cancelled connection.");
          renderer.draw();
          return;
        }

        showAddRoadModal(selectedStartNodeId, node);
      }
      renderer.draw();
    } 
    else if (editMode === "remove-road") {
      if (sim.state === "running") {
        notify("Please pause or stop simulation to edit the graph.");
        return;
      }

      const edge = getClickedEdge(mouseX, mouseY, 8);
      if (!edge) return;

      showConfirmModal(
        "Remove Road",
        `Are you sure you want to remove the road segment between Intersection #${edge.from} and #${edge.to}?`,
        async () => {
          sim.graph.removeEdge(edge.from, edge.to, true);
          notify(`Road segment between #${edge.from} and #${edge.to} removed.`);
          await sim.calculateShortestPaths();
          updateGraphStatsPanel();
          renderer.draw();
        }
      );
    }
  });

  // Random blockage triggers
  btnBlockAll.addEventListener("click", async () => {
    const V = sim.getGraphBoundary();
    if (V < 2) return;
    
    const edges = [];
    for (let i = 0; i < V; i++) {
      if (sim.graph.activeNodes[i] !== 1) continue;
      for (let j = 0; j < V; j++) {
        if (sim.graph.activeNodes[j] === 1 && i !== j && sim.graph.weights[i * MAX_VERTICES + j] !== Infinity) {
          edges.push({ from: i, to: j });
        }
      }
    }

    if (edges.length > 0) {
      const edge = edges[Math.floor(Math.random() * edges.length)];
      sim.graph.blockRoad(edge.from, edge.to, true);
      notify(`Random road closed: ${edge.from} ➔ ${edge.to}`);
      await sim.calculateShortestPaths();
      updateGraphStatsPanel();
      renderer.draw();
    }
  });

  btnUnblockAll.addEventListener("click", async () => {
    sim.graph.blocked.fill(0);
    notify("All road blocks cleared.");
    await sim.calculateShortestPaths();
    updateGraphStatsPanel();
    renderer.draw();
  });

  // Export JSON
  btnExportJson.addEventListener("click", () => {
    const jsonStr = sim.graph.exportToJSON();
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `smartcity_graph_${Date.now()}.json`;
    a.click();
    notify("Graph configuration JSON downloaded.");
  });

  // Export CSV
  btnExportCsv.addEventListener("click", async () => {
    if (sim.totalVehicles === 0) {
      notify("No vehicle journey logs found.");
      return;
    }

    notify("Running performance benchmark on current map layout...");
    btnExportCsv.disabled = true;
    
    let benchmarkData = null;
    try {
      benchmarkData = await sim.runCurrentGraphBenchmark();
    } catch (err) {
      console.error("Failed to run benchmark on current graph:", err);
    }
    
    btnExportCsv.disabled = false;
    notify("Generating CSV report...");

    let csvContent = "\ufeff"; // BOM for Excel UTF-8 compatibility
    
    // Section 1: Computational Performance Analysis
    csvContent += "--- COMPUTATIONAL PERFORMANCE ANALYSIS (FLOYD-WARSHALL) ---\n";
    csvContent += "Graph size (V intersections)," + sim.getGraphBoundary() + "\n";
    if (benchmarkData && benchmarkData.status === "success") {
      csvContent += "Sequential Execution Time (ms)," + benchmarkData.seq_time.toFixed(4) + "\n\n";
      csvContent += "Thread Count (P),Execution Time (T_P) (ms),Speedup (S),Efficiency (E) (%),Sync Overhead (ms)\n";
      
      let maxSpeedup = -1;
      let optimalThread = 1;
      
      for (let i = 0; i < benchmarkData.threads.length; i++) {
        const p = benchmarkData.threads[i];
        const t_p = benchmarkData.times[i];
        const overhead = benchmarkData.overheads[i];
        
        let t_p_str = t_p.toFixed(4);
        let s_str = "N/A";
        let e_str = "N/A";
        let overhead_str = overhead.toFixed(4);

        if (t_p > 0) {
          const s = benchmarkData.seq_time / t_p;
          const e = (s / p) * 100;
          s_str = s.toFixed(4);
          e_str = e.toFixed(2) + "%";
          
          if (s > maxSpeedup) {
            maxSpeedup = s;
            optimalThread = p;
          }
        } else {
          t_p_str = "N/A (Oversubscribed / Skipped)";
          overhead_str = "N/A";
        }
        
        csvContent += `${p},${t_p_str},${s_str},${e_str},${overhead_str}\n`;
      }
      
      if (maxSpeedup > 0) {
        csvContent += `\nOptimal Thread Count,${optimalThread} (Speedup: ${maxSpeedup.toFixed(2)}x)\n\n`;
      } else {
        csvContent += `\nOptimal Thread Count,N/A\n\n`;
      }
    } else {
      csvContent += "Performance data not available (make sure backend is running)\n\n";
    }

    // Section 2: Vehicle Journey Statistics
    csvContent += "--- VEHICLE JOURNEY STATISTICS ---\n";
    csvContent += "Vehicle ID,Vehicle Type,State Code,Origin,Destination,Progress (%),Travel Time (s)\n";

    for (let i = 0; i < sim.totalVehicles; i++) {
      const offset = i * 8;
      const id = sim.vehicleIntsView[offset];
      const type = sim.vehicleIntsView[offset + 1];
      const state = sim.vehicleIntsView[offset + 2];
      const origin = sim.vehicleIntsView[offset + 3];
      const destination = sim.vehicleIntsView[offset + 4];
      
      const progress = sim.vehicleFloatsView[offset] * 100;
      const travelTime = sim.vehicleFloatsView[offset + 2];

      const typeStr = type === 0 ? "Mobil" : type === 1 ? "Motor" : "Bus";
      const stateStr = state === 0 ? "Finished" : state === 1 ? "Moving" : state === 2 ? "Waiting" : "Stuck";

      csvContent += `${id},${typeStr},${stateStr},${origin},${destination},${progress.toFixed(1)}%,${travelTime.toFixed(2)}\n`;
    }

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `smartcity_performance_and_statistics_${Date.now()}.csv`;
    a.click();
    notify("Performance and vehicle statistics CSV downloaded successfully.");
  });

  // Graph generators presets
  function generatePresetGraph(type) {
    sim.graph.clear();
    
    if (type === "blank") {
      setEditMode("add-node");
      notify("Blank canvas loaded. Click empty space on canvas to place an intersection.");
    }
    else if (type === "grid") {
      // 7x7 grid (49 nodes)
      const size = 7;
      let id = 0;
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const x = 100 + c * 100;
          const y = 80 + r * 80;
          sim.graph.addVertex(id++, x, y);
        }
      }

      // Add bidirectional connections
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const curr = r * size + c;
          if (c < size - 1) { // connect right
            const w = 50 + Math.floor(Math.random() * 50);
            sim.graph.addEdge(curr, curr + 1, w, true);
          }
          if (r < size - 1) { // connect down
            const w = 50 + Math.floor(Math.random() * 50);
            sim.graph.addEdge(curr, curr + size, w, true);
          }
        }
      }
      notify("Generated standard 7x7 Grid city graph.");
    } 
    else if (type === "circle") {
      // Circular Ring Road
      const rings = 3;
      const nodesPerRing = 20;
      let id = 0;

      // Add center intersection
      const cx = 400;
      const cy = 300;
      sim.graph.addVertex(id++, cx, cy);

      for (let ring = 1; ring <= rings; ring++) {
        const radius = ring * 80;
        for (let i = 0; i < nodesPerRing; i++) {
          const angle = (i * 2 * Math.PI) / nodesPerRing;
          const x = cx + radius * Math.cos(angle);
          const y = cy + radius * Math.sin(angle);
          sim.graph.addVertex(id++, x, y);
        }
      }

      // Connect rings concentric edges
      for (let ring = 1; ring <= rings; ring++) {
        const offset = 1 + (ring - 1) * nodesPerRing;
        for (let i = 0; i < nodesPerRing; i++) {
          const next = offset + ((i + 1) % nodesPerRing);
          const curr = offset + i;
          sim.graph.addEdge(curr, next, 60, true);
        }
      }

      // Connect rings radially
      // Connect center to first ring
      for (let i = 0; i < nodesPerRing; i += 4) {
        sim.graph.addEdge(0, 1 + i, 80, true);
      }
      
      // Connect inner ring to middle ring
      for (let i = 0; i < nodesPerRing; i += 2) {
        const inner = 1 + i;
        const middle = 1 + nodesPerRing + i;
        sim.graph.addEdge(inner, middle, 80, true);
      }

      // Connect middle to outer ring
      for (let i = 0; i < nodesPerRing; i++) {
        const middle = 1 + nodesPerRing + i;
        const outer = 1 + nodesPerRing * 2 + i;
        sim.graph.addEdge(middle, outer, 80, true);
      }

      notify("Generated Circular Concentric Ring road system.");
    }
    else if (type === "complex") {
      // Complex High Density city structure
      const count = 120;
      generateRandomConnectedGraph(count, 0.08);
      notify("Generated High Density Core complex city graph.");
    }
    else if (type.startsWith("custom_")) {
      const size = parseInt(type.split("_")[1]);
      generateRandomConnectedGraph(size, size > 250 ? 0.02 : 0.05);
      notify(`Generated stress-testing layout with ${size} nodes.`);
    }
    updateGraphStatsPanel();
  }

  // Generates randomized graph ensuring single-component connectivity
  function generateRandomConnectedGraph(numNodes, edgeProb) {
    const cx = 400;
    const cy = 300;

    for (let i = 0; i < numNodes; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.pow(Math.random(), 1.5) * 250;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      sim.graph.addVertex(i, x, y);
    }

    // Connect node to nearest neighbors first to prevent disjoint sets
    for (let i = 1; i < numNodes; i++) {
      let nearest = 0;
      let minDist = Infinity;
      const ix = sim.graph.coords[i * 2];
      const iy = sim.graph.coords[i * 2 + 1];

      for (let j = 0; j < i; j++) {
        const jx = sim.graph.coords[j * 2];
        const jy = sim.graph.coords[j * 2 + 1];
        const dist = Math.hypot(ix - jx, iy - jy);
        if (dist < minDist) {
          minDist = dist;
          nearest = j;
        }
      }
      sim.graph.addEdge(i, nearest, Math.max(20, Math.round(minDist / 2)), true);
    }

    // Add secondary mesh connectivity edges
    for (let i = 0; i < numNodes; i++) {
      const ix = sim.graph.coords[i * 2];
      const iy = sim.graph.coords[i * 2 + 1];

      for (let j = i + 1; j < numNodes; j++) {
        if (Math.random() < edgeProb) {
          const jx = sim.graph.coords[j * 2];
          const jy = sim.graph.coords[j * 2 + 1];
          const dist = Math.hypot(ix - jx, iy - jy);
          
          if (dist < 150) {
            sim.graph.addEdge(i, j, Math.max(20, Math.round(dist / 2)), true);
          }
        }
      }
    }
  }

  // scientific benchmarking runs
  btnRunBenchmark.addEventListener("click", async () => {
    btnRunBenchmark.disabled = true;
    notify("Initializing Scientific Benchmark execution...");
    benchResults.classList.add("hidden");
    
    // Pause canvas animation loops to avoid rendering overhead affecting benchmarks
    cancelAnimationFrame(animationFrameId);

    // Save previous state configurations
    const prevMode = sim.mode;
    const prevThreads = sim.numThreads;
    
    notify("Running Floyd-Warshall Benchmark Suite on C++ Backend (V=250 Nodes)...");

    try {
      const response = await sim.runCPlusPlusBenchmark();

      const sequentialBaseline = response.seq_time;
      const results = {
        threads: response.threads,
        times: response.times,
        speedup: [],
        efficiency: [],
        overheads: response.overheads
      };

      let bestParTime = Infinity;
      let maxSpeedup = -1;
      let optimalThreads = 1;

      for (let i = 0; i < results.threads.length; i++) {
        const tVal = results.threads[i];
        const pTime = results.times[i];
        
        let s_p = 0;
        let e_p = 0;

        if (pTime > 0) {
          if (pTime < bestParTime) bestParTime = pTime;
          s_p = sequentialBaseline / pTime;
          e_p = s_p / tVal;

          if (s_p > maxSpeedup) {
            maxSpeedup = s_p;
            optimalThreads = tVal;
          }
        }

        results.speedup.push(s_p);
        results.efficiency.push(e_p);
      }

      if (bestParTime === Infinity) bestParTime = 0;
      if (maxSpeedup === -1) maxSpeedup = 0;

      // Render stats cards
      benchValSeq.textContent = sequentialBaseline.toFixed(1) + " ms";
      benchValPar.textContent = bestParTime > 0 ? bestParTime.toFixed(1) + " ms" : "N/A";
      benchValSpeedup.textContent = maxSpeedup > 0 ? maxSpeedup.toFixed(2) + "x" : "N/A";
      
      const peakEffIdx = results.speedup.indexOf(maxSpeedup);
      const peakEff = (maxSpeedup > 0 && peakEffIdx !== -1) ? Math.round(results.efficiency[peakEffIdx] * 100) : 0;
      benchValEff.textContent = peakEff > 0 ? peakEff + "%" : "N/A";

      // Render scientific custom SVG charts
      renderSVGCharts(sequentialBaseline, results);
      
      // Draw Amdahl's Law automatically
      const s4 = results.speedup[2]; // 4 threads speedup
      const rawF = s4 > 0 ? ((1 / s4) - 0.25) / 0.75 : 0;
      const f = Math.min(1.0, Math.max(0.0, rawF));

      const peakIdx = results.speedup.indexOf(maxSpeedup);
      const peakOverhead = (peakIdx !== -1) ? results.overheads[peakIdx] : 0;

      if (maxSpeedup > 0) {
        let serialExplanation = "";
        if (f >= 1.0) {
          serialExplanation = `Berdasarkan <strong>Hukum Amdahl</strong>, estimasi fraksi serial sistem ini adalah <strong>100.0%</strong>. Hal ini dikarenakan ukuran beban kerja graf benchmark ini terlalu kecil (V=250 nodes) sehingga overhead inisialisasi thread paralel OpenMP mendominasi seluruh waktu komputasi, menyebabkan perlambatan dibanding baseline sekuensial.`;
        } else {
          serialExplanation = `Berdasarkan <strong>Hukum Amdahl</strong>, estimasi fraksi serial sistem ini adalah <strong>${(f * 100).toFixed(1)}%</strong>. Rata-rata waktu sinkronisasi overhead (Synchronization Overhead Time) pada thread puncak adalah <strong>${peakOverhead.toFixed(2)} ms</strong>.`;
        }

        // Add math explanation card!
        const t4Val = results.times[2];
        const s4Val = results.speedup[2];
        let mathStepsHtml = "";
        
        if (t4Val > 0) {
          mathStepsHtml = `
            <div style="margin-top: 12px; padding: 12px; background: rgba(17, 24, 39, 0.4); border-radius: 8px; border: 1px solid var(--border-glass); font-family: monospace; font-size: 0.8rem; color: var(--text-secondary); line-height: 1.4;">
              <strong style="color: var(--text-primary);">📊 Langkah Kalkulasi Matematis (P = 4 Thread):</strong><br>
              1. Rumus Amdahl: S_p = 1 / [ f + (1 - f) / P ]<br>
              2. Mengisolasi f (pada P = 4):<br>
              &nbsp;&nbsp;&nbsp;f = ((1 / S_4) - 0.25) / 0.75<br>
              3. Data Pengukuran:<br>
              &nbsp;&nbsp;&nbsp;- T_seq = ${sequentialBaseline.toFixed(4)} ms<br>
              &nbsp;&nbsp;&nbsp;- T_par (4T) = ${t4Val.toFixed(4)} ms<br>
              &nbsp;&nbsp;&nbsp;- Speedup (S_4) = T_seq / T_4 = ${sequentialBaseline.toFixed(4)} / ${t4Val.toFixed(4)} = ${s4Val.toFixed(4)}x<br>
              4. Kalkulasi:<br>
              &nbsp;&nbsp;&nbsp;f = ((1 / ${s4Val.toFixed(4)}) - 0.25) / 0.75 = ${rawF.toFixed(4)}<br>
              &nbsp;&nbsp;&nbsp;f_persen = ${(rawF * 100).toFixed(2)}% ${rawF > 1.0 ? "(Dibatasi maks 100% secara fisik)" : rawF < 0 ? "(Dibatasi min 0% secara fisik)" : ""}<br>
              &nbsp;&nbsp;&nbsp;f_akhir = ${(f * 100).toFixed(1)}%
            </div>
          `;
        } else {
          mathStepsHtml = `
            <div style="margin-top: 12px; padding: 12px; background: rgba(17, 24, 39, 0.4); border-radius: 8px; border: 1px solid var(--border-glass); font-family: monospace; font-size: 0.8rem; color: var(--text-secondary); line-height: 1.4;">
              <strong style="color: var(--text-primary);">📊 Langkah Kalkulasi Matematis:</strong><br>
              Kalkulasi langkah dinonaktifkan karena konfigurasi paralel 4 Thread dilewati (oversubscribed) pada perangkat keras ini.
            </div>
          `;
        }

        amdahlAnalysis.innerHTML = `
          Hasil benchmark menunjukkan waktu eksekusi sekuensial C++ adalah <strong>${sequentialBaseline.toFixed(1)} ms</strong>. 
          Kecepatan puncak (Max Speedup) sebesar <strong>${maxSpeedup.toFixed(2)}x</strong> dicapai pada alokasi <strong>${optimalThreads} thread</strong>.
          <br><br>
          ${serialExplanation}
          ${mathStepsHtml}
          <br>
          Hal ini mengonfirmasi adanya parallel overhead (manajemen barrier konkurensi OpenMP dan dynamic loop scheduling) yang membatasi speedup linear pada core CPU yang tinggi.
        `;
      } else {
        amdahlAnalysis.innerHTML = `
          Hasil benchmark menunjukkan waktu eksekusi sekuensial C++ adalah <strong>${sequentialBaseline.toFixed(1)} ms</strong>. 
          <br><br>
          Seluruh konfigurasi paralel dilewati karena jumlah thread melebihi kapasitas perangkat keras lokal.
        `;
      }

      // Restore state
      sim.mode = prevMode;
      sim.numThreads = prevThreads;
      
      // Update thread activity list
      updateThreadVisuals();

      benchResults.classList.remove("hidden");
      notify("Benchmark completed. Visual animation loop restored.");
    } catch (err) {
      console.error("Benchmark error:", err);
      notify("Error executing C++ benchmark suite. Check console/server logs.");
    }
    
    // Resume drawing canvas
    btnRunBenchmark.disabled = false;
    renderLoop();
  });

  // Custom SVG charting renderers
  function renderSVGCharts(seqVal, data) {
    const xCoords = [60, 110, 160, 210, 260];

    // 1. Time Chart
    let svgTime = `<svg width="100%" height="100%" viewBox="0 0 300 150" style="background:#1f293700">`;
    for (let y = 20; y <= 120; y += 25) {
      svgTime += `<line x1="40" y1="${y}" x2="280" y2="${y}" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>`;
    }
    // Plot Sequential line (Horizontal)
    svgTime += `<line x1="40" y1="35" x2="280" y2="35" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="3,3"/>`;
    svgTime += `<text x="210" y="30" fill="#ef4444" font-size="8">Seq Baseline</text>`;
    
    // Plot Parallel line
    const getScaledY = (val) => {
      const maxVal = Math.max(seqVal, ...data.times);
      return 120 - (val / maxVal) * 90;
    };
    
    let pathPoints = "";
    let isFirstPoint = true;
    for (let i = 0; i < data.times.length; i++) {
      if (data.times[i] <= 0) continue;
      const x = xCoords[i];
      const y = getScaledY(data.times[i]);
      pathPoints += `${isFirstPoint ? "M" : "L"} ${x} ${y}`;
      isFirstPoint = false;
      svgTime += `<circle cx="${x}" cy="${y}" r="3" fill="#60a5fa"/>`;
      svgTime += `<text x="${x}" y="${y - 8}" fill="#60a5fa" font-size="8" text-anchor="middle">${data.times[i].toFixed(1)}ms</text>`;
    }
    if (pathPoints) {
      svgTime += `<path d="${pathPoints}" fill="none" stroke="#3b82f6" stroke-width="2"/>`;
    }
    
    // X Axis labels
    for (let i = 0; i < data.threads.length; i++) {
      svgTime += `<text x="${xCoords[i]}" y="138" fill="#9ca3af" font-size="8" text-anchor="middle">${data.threads[i]}T</text>`;
    }
    svgTime += `</svg>`;
    chartExecTime.innerHTML = svgTime;

    // 2. Speedup Chart
    let svgSpeedup = `<svg width="100%" height="100%" viewBox="0 0 300 150">`;
    svgSpeedup += `<line x1="40" y1="120" x2="280" y2="20" stroke="rgba(255,255,255,0.08)" stroke-width="1" stroke-dasharray="3,3"/>`;
    for (let y = 20; y <= 120; y += 25) {
      svgSpeedup += `<line x1="40" y1="${y}" x2="280" y2="${y}" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>`;
    }
    
    // Scale: map 0 to 16 speedup to 120 to 20
    const getSpeedupY = (val) => 120 - (val / 16) * 100;
    
    let pathSpeedup = "";
    let isFirstSpeedup = true;
    for (let i = 0; i < data.speedup.length; i++) {
      if (data.times[i] <= 0) continue;
      const x = xCoords[i];
      const y = getSpeedupY(data.speedup[i]);
      pathSpeedup += `${isFirstSpeedup ? "M" : "L"} ${x} ${y}`;
      isFirstSpeedup = false;
      svgSpeedup += `<circle cx="${x}" cy="${y}" r="3" fill="#fbbf24"/>`;
      svgSpeedup += `<text x="${x}" y="${y - 8}" fill="#fbbf24" font-size="8" text-anchor="middle">${data.speedup[i].toFixed(2)}x</text>`;
    }
    if (pathSpeedup) {
      svgSpeedup += `<path d="${pathSpeedup}" fill="none" stroke="#f59e0b" stroke-width="2"/>`;
    }
    
    for (let i = 0; i < data.threads.length; i++) {
      svgSpeedup += `<text x="${xCoords[i]}" y="138" fill="#9ca3af" font-size="8" text-anchor="middle">${data.threads[i]}T</text>`;
    }
    svgSpeedup += `</svg>`;
    chartSpeedup.innerHTML = svgSpeedup;

    // 3. Efficiency Chart
    let svgEff = `<svg width="100%" height="100%" viewBox="0 0 300 150">`;
    svgEff += `<line x1="40" y1="20" x2="280" y2="20" stroke="rgba(16,185,129,0.2)" stroke-width="1"/>`;
    for (let y = 20; y <= 120; y += 25) {
      svgEff += `<line x1="40" y1="${y}" x2="280" y2="${y}" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>`;
    }
    
    // Scale: map efficiency 0.0 to 1.0 to 120 to 20
    const getEffY = (val) => 120 - val * 100;
    
    let pathEff = "";
    let isFirstEff = true;
    for (let i = 0; i < data.efficiency.length; i++) {
      if (data.times[i] <= 0) continue;
      const x = xCoords[i];
      const y = getEffY(data.efficiency[i]);
      pathEff += `${isFirstEff ? "M" : "L"} ${x} ${y}`;
      isFirstEff = false;
      svgEff += `<circle cx="${x}" cy="${y}" r="3" fill="#34d399"/>`;
      svgEff += `<text x="${x}" y="${y - 8}" fill="#34d399" font-size="8" text-anchor="middle">${(data.efficiency[i]*100).toFixed(0)}%</text>`;
    }
    if (pathEff) {
      svgEff += `<path d="${pathEff}" fill="none" stroke="#10b981" stroke-width="2"/>`;
    }
    
    for (let i = 0; i < data.threads.length; i++) {
      svgEff += `<text x="${xCoords[i]}" y="138" fill="#9ca3af" font-size="8" text-anchor="middle">${data.threads[i]}T</text>`;
    }
    svgEff += `</svg>`;
    chartEfficiency.innerHTML = svgEff;
  }
});
