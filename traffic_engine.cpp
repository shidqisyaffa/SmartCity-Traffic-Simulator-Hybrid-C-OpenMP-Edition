#include <iostream>
#include <string>
#include <vector>
#include <sstream>
#include <cmath>
#include <chrono>
#include <random>
#include <algorithm>
#include <iomanip>
#include <limits>
#include <omp.h>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

const int MAX_VERTICES = 1000;
const int MAX_VEHICLES = 10000;
const float INF = std::numeric_limits<float>::infinity();

// Graph structures
float weights[MAX_VERTICES * MAX_VERTICES];
int blocked[MAX_VERTICES * MAX_VERTICES];
float coords[MAX_VERTICES * 2];
uint8_t activeNodes[MAX_VERTICES];

// Floyd-Warshall cache
float fwDistance[MAX_VERTICES * MAX_VERTICES];
int fwNext[MAX_VERTICES * MAX_VERTICES];
int trafficLights[MAX_VERTICES];

// Vehicles memory
std::vector<int> vehicleInts;
std::vector<float> vehicleFloats;
std::vector<int> vehiclePaths;


int totalVehicles = 0;
int tickCount = 0;

// Path reconstruction helper
std::vector<int> reconstructPath(int start, int end) {
    if (start < 0 || start >= MAX_VERTICES || end < 0 || end >= MAX_VERTICES) return {};
    if (fwNext[start * MAX_VERTICES + end] == -1) return {};
    std::vector<int> path = {start};
    int curr = start;
    while (curr != end) {
        curr = fwNext[curr * MAX_VERTICES + end];
        if (curr == -1) return {};
        path.push_back(curr);
        if (path.size() > MAX_VERTICES) return {};
    }
    return path;
}

// Spawns vehicles matching the JS random algorithm logic
void spawnVehicles(int count, int seed) {
    std::mt19937 gen(seed);
    std::vector<int> activeNodeIds;
    for (int i = 0; i < MAX_VERTICES; ++i) {
        if (activeNodes[i] == 1) {
            activeNodeIds.push_back(i);
        }
    }

    // Reset vehicle memory
    vehicleInts.assign(count * 8, 0);
    vehicleFloats.assign(count * 8, 0.0f);
    vehiclePaths.assign(count * 100, 0);
    totalVehicles = 0;

    if (activeNodeIds.size() < 2) {
        return;
    }

    int generated = 0;
    int attempts = 0;
    int maxAttempts = count * 10;

    std::uniform_int_distribution<> disNode(0, activeNodeIds.size() - 1);
    std::uniform_real_distribution<float> disReal(0.0f, 1.0f);

    while (generated < count && attempts < maxAttempts) {
        attempts++;
        int origin = activeNodeIds[disNode(gen)];
        int destination = activeNodeIds[disNode(gen)];
        if (origin == destination) continue;

        std::vector<int> path = reconstructPath(origin, destination);
        if (path.size() < 2) continue;

        float randType = disReal(gen);
        int type = 0;
        float speed = 50.0f;
        if (randType < 0.6f) {
            type = 0;
            speed = 50.0f;
        } else if (randType < 0.9f) {
            type = 1;
            speed = 70.0f;
        } else {
            type = 2;
            speed = 30.0f;
        }

        float variance = 0.9f + disReal(gen) * 0.2f;
        speed = speed * variance;

        int vOffset = generated * 8;
        int vPathOffset = generated * 100;

        vehicleInts[vOffset] = generated;
        vehicleInts[vOffset + 1] = type;
        vehicleInts[vOffset + 2] = 1; // State: 1 = Moving
        vehicleInts[vOffset + 3] = origin;
        vehicleInts[vOffset + 4] = destination;
        vehicleInts[vOffset + 5] = 0; // path index
        vehicleInts[vOffset + 6] = path.size();

        vehicleFloats[vOffset] = 0.0f; // progress
        vehicleFloats[vOffset + 1] = speed;
        vehicleFloats[vOffset + 2] = 0.0f; // travel time
        vehicleFloats[vOffset + 3] = coords[origin * 2];
        vehicleFloats[vOffset + 4] = coords[origin * 2 + 1];
        vehicleFloats[vOffset + 7] = 0.0f; // delay

        for (size_t p = 0; p < path.size(); ++p) {
            vehiclePaths[vPathOffset + p] = path[p];
        }

        generated++;
    }

    totalVehicles = generated;
}

// Sequential Floyd-Warshall baseline
void runSequentialFW(int V, double& out_exec_time) {
    auto t_start = std::chrono::high_resolution_clock::now();

    for (int i = 0; i < V; ++i) {
        for (int j = 0; j < V; ++j) {
            int idx = i * MAX_VERTICES + j;
            if (i == j) {
                fwDistance[idx] = 0.0f;
                fwNext[idx] = -1;
            } else {
                bool isBlocked = blocked[idx] == 1;
                float w = weights[idx];
                if (w != INF && !isBlocked) {
                    fwDistance[idx] = w;
                    fwNext[idx] = j;
                } else {
                    fwDistance[idx] = INF;
                    fwNext[idx] = -1;
                }
            }
        }
    }

    for (int k = 0; k < V; ++k) {
        for (int i = 0; i < V; ++i) {
            int ikIdx = i * MAX_VERTICES + k;
            float d_ik = fwDistance[ikIdx];

            if (d_ik != INF) {
                for (int j = 0; j < V; ++j) {
                    int kjIdx = k * MAX_VERTICES + j;
                    float d_kj = fwDistance[kjIdx];

                    if (d_kj != INF) {
                        int ijIdx = i * MAX_VERTICES + j;
                        float currentDist = fwDistance[ijIdx];
                        float newDist = d_ik + d_kj;

                        if (newDist < currentDist) {
                            fwDistance[ijIdx] = newDist;
                            fwNext[ijIdx] = fwNext[ikIdx];
                        }
                    }
                }
            }
        }
    }

    auto t_end = std::chrono::high_resolution_clock::now();
    out_exec_time = std::chrono::duration<double, std::milli>(t_end - t_start).count();
}

// Parallel Floyd-Warshall with dynamic scheduling
void runParallelFW(int V, int threads, double& out_exec_time, double& out_sync_overhead) {
    omp_set_num_threads(threads);
    auto t_start = std::chrono::high_resolution_clock::now();

    std::vector<double> thread_work_time(threads, 0.0);

    #pragma omp parallel
    {
        int tid = omp_get_thread_num();
        auto t_work_start = std::chrono::high_resolution_clock::now();

        #pragma omp for schedule(static)
        for (int i = 0; i < V; ++i) {
            for (int j = 0; j < V; ++j) {
                int idx = i * MAX_VERTICES + j;
                if (i == j) {
                    fwDistance[idx] = 0.0f;
                    fwNext[idx] = -1;
                } else {
                    bool isBlocked = blocked[idx] == 1;
                    float w = weights[idx];
                    if (w != INF && !isBlocked) {
                        fwDistance[idx] = w;
                        fwNext[idx] = j;
                    } else {
                        fwDistance[idx] = INF;
                        fwNext[idx] = -1;
                    }
                }
            }
        }
        auto t_work_end = std::chrono::high_resolution_clock::now();
        thread_work_time[tid] += std::chrono::duration<double, std::milli>(t_work_end - t_work_start).count();
    }

    for (int k = 0; k < V; ++k) {
        #pragma omp parallel
        {
            int tid = omp_get_thread_num();
            auto t_work_start = std::chrono::high_resolution_clock::now();

            #pragma omp for schedule(dynamic)
            for (int i = 0; i < V; ++i) {
                int ikIdx = i * MAX_VERTICES + k;
                float d_ik = fwDistance[ikIdx];

                if (d_ik != INF) {
                    for (int j = 0; j < V; ++j) {
                        int kjIdx = k * MAX_VERTICES + j;
                        float d_kj = fwDistance[kjIdx];

                        if (d_kj != INF) {
                            int ijIdx = i * MAX_VERTICES + j;
                            float currentDist = fwDistance[ijIdx];
                            float newDist = d_ik + d_kj;

                            if (newDist < currentDist) {
                                fwDistance[ijIdx] = newDist;
                                fwNext[ijIdx] = fwNext[ikIdx];
                            }
                        }
                    }
                }
            }
            auto t_work_end = std::chrono::high_resolution_clock::now();
            thread_work_time[tid] += std::chrono::duration<double, std::milli>(t_work_end - t_work_start).count();
        }
    }

    auto t_end = std::chrono::high_resolution_clock::now();
    out_exec_time = std::chrono::duration<double, std::milli>(t_end - t_start).count();

    double total_overhead = 0.0;
    for (int t = 0; t < threads; ++t) {
        total_overhead += (out_exec_time - thread_work_time[t]);
    }
    out_sync_overhead = std::max(0.0, total_overhead / threads);
}

// Sequential vehicle simulation step
void runSequentialVehicles(float tickRate, double& out_exec_time) {
    float dt = tickRate / 1000.0f;
    auto t_start = std::chrono::high_resolution_clock::now();

    std::vector<int> candidates(MAX_VERTICES, -1);

    for (int i = 0; i < totalVehicles; ++i) {
        int vOffset = i * 8;
        int vPathOffset = i * 100;

        int id = vehicleInts[vOffset];
        int state = vehicleInts[vOffset + 2];
        int destination = vehicleInts[vOffset + 4];
        int currentPathIndex = vehicleInts[vOffset + 5];

        if (state != 1 && state != 2 && state != 3) continue;

        float progress = vehicleFloats[vOffset];
        float speed = vehicleFloats[vOffset + 1];
        float travelTime = vehicleFloats[vOffset + 2];
        float delayCounter = vehicleFloats[vOffset + 7];

        travelTime += dt;

        if (state == 2) {
            delayCounter -= dt;
            if (delayCounter <= 0.0f) {
                delayCounter = 0.0f;
                state = 1;
            }
        }

        if (state == 1) {
            int u = vehiclePaths[vPathOffset + currentPathIndex];
            int v = vehiclePaths[vPathOffset + currentPathIndex + 1];

            float w = weights[u * MAX_VERTICES + v];
            bool isBlocked = blocked[u * MAX_VERTICES + v] == 1;

            if (isBlocked || w == INF) {
                std::vector<int> newPath = reconstructPath(u, destination);
                if (newPath.size() > 1) {
                    vehicleInts[vOffset + 6] = newPath.size();
                    vehicleInts[vOffset + 5] = 0;
                    currentPathIndex = 0;
                    for (size_t pIdx = 0; pIdx < newPath.size(); ++pIdx) {
                        vehiclePaths[vPathOffset + pIdx] = newPath[pIdx];
                    }
                    progress = 0.0f;
                } else {
                    state = 3; // Stuck
                }
            }

            if (state == 1) {
                progress += (speed * dt) / w;

                if (progress >= 1.0f) {
                    progress = 1.0f;

                    if (v == destination) {
                        state = 0; // Finished
                    } else {
                        // Traffic Light Check (modulo tickCount)
                        int light = ((tickCount + v * 5) % 40 < 20) ? 1 : 0;
                        if (light == 1) {
                            state = 2; // Waiting (Red light)
                            delayCounter = 0.1f;
                        } else {
                            // Green: request crossing
                            if (candidates[v] == -1 || id < candidates[v]) {
                                candidates[v] = id;
                            }
                        }
                    }
                }

                int nextU = vehiclePaths[vPathOffset + currentPathIndex];
                int nextV = vehiclePaths[vPathOffset + currentPathIndex + 1];

                float ux = coords[nextU * 2];
                float uy = coords[nextU * 2 + 1];
                float vx = coords[nextV * 2];
                float vy = coords[nextV * 2 + 1];

                float x = ux + (vx - ux) * progress;
                float y = uy + (vy - uy) * progress;

                vehicleFloats[vOffset + 3] = x;
                vehicleFloats[vOffset + 4] = y;
                vehicleFloats[vOffset + 5] = vx;
                vehicleFloats[vOffset + 6] = vy;
            }
        }

        vehicleInts[vOffset + 2] = state;
        vehicleFloats[vOffset] = progress;
        vehicleFloats[vOffset + 2] = travelTime;
        vehicleFloats[vOffset + 7] = delayCounter;
    }

    // Resolve crossings
    for (int v = 0; v < MAX_VERTICES; ++v) {
        int best_vehicle = candidates[v];
        if (best_vehicle != -1) {
            int vOffset = best_vehicle * 8;
            int currentPathIndex = vehicleInts[vOffset + 5];
            currentPathIndex += 1;
            vehicleInts[vOffset + 5] = currentPathIndex;
            vehicleFloats[vOffset] = 0.0f; // Reset progress
            vehicleInts[vOffset + 2] = 2;   // State: Waiting (crossing time)
            vehicleFloats[vOffset + 7] = 0.5f; // crossing time delay in seconds
        }
    }

    auto t_end = std::chrono::high_resolution_clock::now();
    out_exec_time = std::chrono::duration<double, std::milli>(t_end - t_start).count();
}

// Parallel vehicle simulation step with lock-free partitioning + reduction
void runParallelVehicles(int threads, float tickRate, double& out_exec_time, double& out_sync_overhead) {
    float dt = tickRate / 1000.0f;
    int num_threads = threads;
    omp_set_num_threads(num_threads);

    std::vector<int> thread_candidates(num_threads * MAX_VERTICES, -1);
    std::vector<double> thread_work_time(num_threads, 0.0);

    auto t_start = std::chrono::high_resolution_clock::now();

    #pragma omp parallel
    {
        int tid = omp_get_thread_num();
        auto t_work_start = std::chrono::high_resolution_clock::now();

        #pragma omp for schedule(static)
        for (int i = 0; i < totalVehicles; ++i) {
            int vOffset = i * 8;
            int vPathOffset = i * 100;

            int id = vehicleInts[vOffset];
            int state = vehicleInts[vOffset + 2];
            int destination = vehicleInts[vOffset + 4];
            int currentPathIndex = vehicleInts[vOffset + 5];

            if (state != 1 && state != 2 && state != 3) continue;

            float progress = vehicleFloats[vOffset];
            float speed = vehicleFloats[vOffset + 1];
            float travelTime = vehicleFloats[vOffset + 2];
            float delayCounter = vehicleFloats[vOffset + 7];

            travelTime += dt;

            if (state == 2) {
                delayCounter -= dt;
                if (delayCounter <= 0.0f) {
                    delayCounter = 0.0f;
                    state = 1;
                }
            }

            if (state == 1) {
                int u = vehiclePaths[vPathOffset + currentPathIndex];
                int v = vehiclePaths[vPathOffset + currentPathIndex + 1];

                float w = weights[u * MAX_VERTICES + v];
                bool isBlocked = blocked[u * MAX_VERTICES + v] == 1;

                if (isBlocked || w == INF) {
                    std::vector<int> newPath = reconstructPath(u, destination);
                    if (newPath.size() > 1) {
                        vehicleInts[vOffset + 6] = newPath.size();
                        vehicleInts[vOffset + 5] = 0;
                        currentPathIndex = 0;
                        for (size_t pIdx = 0; pIdx < newPath.size(); ++pIdx) {
                            vehiclePaths[vPathOffset + pIdx] = newPath[pIdx];
                        }
                        progress = 0.0f;
                    } else {
                        state = 3; // Stuck
                    }
                }

                if (state == 1) {
                    progress += (speed * dt) / w;

                    if (progress >= 1.0f) {
                        progress = 1.0f;

                        if (v == destination) {
                            state = 0; // Finished
                        } else {
                            // Traffic Light Check (modulo tickCount)
                            int light = ((tickCount + v * 5) % 40 < 20) ? 1 : 0;
                            if (light == 1) {
                                state = 2; // Waiting (Red light)
                                delayCounter = 0.1f;
                            } else {
                                // Green: request crossing
                                int current_candidate = thread_candidates[tid * MAX_VERTICES + v];
                                if (current_candidate == -1 || id < current_candidate) {
                                    thread_candidates[tid * MAX_VERTICES + v] = id;
                                }
                            }
                        }
                    }

                    int nextU = vehiclePaths[vPathOffset + currentPathIndex];
                    int nextV = vehiclePaths[vPathOffset + currentPathIndex + 1];

                    float ux = coords[nextU * 2];
                    float uy = coords[nextU * 2 + 1];
                    float vx = coords[nextV * 2];
                    float vy = coords[nextV * 2 + 1];

                    float x = ux + (vx - ux) * progress;
                    float y = uy + (vy - uy) * progress;

                    vehicleFloats[vOffset + 3] = x;
                    vehicleFloats[vOffset + 4] = y;
                    vehicleFloats[vOffset + 5] = vx;
                    vehicleFloats[vOffset + 6] = vy;
                }
            }

            vehicleInts[vOffset + 2] = state;
            vehicleFloats[vOffset] = progress;
            vehicleFloats[vOffset + 2] = travelTime;
            vehicleFloats[vOffset + 7] = delayCounter;
        }

        auto t_work_end = std::chrono::high_resolution_clock::now();
        thread_work_time[tid] = std::chrono::duration<double, std::milli>(t_work_end - t_work_start).count();
    }

    auto t_end = std::chrono::high_resolution_clock::now();
    out_exec_time = std::chrono::duration<double, std::milli>(t_end - t_start).count();

    // Reduction Phase
    for (int v = 0; v < MAX_VERTICES; ++v) {
        int best_vehicle = -1;
        for (int t = 0; t < num_threads; ++t) {
            int v_cand = thread_candidates[t * MAX_VERTICES + v];
            if (v_cand != -1) {
                if (best_vehicle == -1 || v_cand < best_vehicle) {
                    best_vehicle = v_cand;
                }
            }
        }

        if (best_vehicle != -1) {
            int vOffset = best_vehicle * 8;
            int currentPathIndex = vehicleInts[vOffset + 5];
            currentPathIndex += 1;
            vehicleInts[vOffset + 5] = currentPathIndex;
            vehicleFloats[vOffset] = 0.0f; // Reset progress
            vehicleInts[vOffset + 2] = 2;   // State: Waiting
            vehicleFloats[vOffset + 7] = 0.5f; // crossing time delay
        }
    }

    double total_overhead = 0.0;
    for (int t = 0; t < num_threads; ++t) {
        total_overhead += (out_exec_time - thread_work_time[t]);
    }
    out_sync_overhead = std::max(0.0, total_overhead / num_threads);
}

// Runs scientific benchmark on 250 nodes
void runBenchmark(std::string& out_json) {
    std::vector<float> backup_weights(weights, weights + MAX_VERTICES * MAX_VERTICES);
    std::vector<int> backup_blocked(blocked, blocked + MAX_VERTICES * MAX_VERTICES);
    std::vector<float> backup_coords(coords, coords + MAX_VERTICES * 2);
    std::vector<uint8_t> backup_activeNodes(activeNodes, activeNodes + MAX_VERTICES);

    int numNodes = 250;
    float edgeProb = 0.05f;

    std::fill(std::begin(weights), std::end(weights), INF);
    std::fill(std::begin(blocked), std::end(blocked), 0);
    std::fill(std::begin(coords), std::end(coords), 0.0f);
    std::fill(std::begin(activeNodes), std::end(activeNodes), 0);
    for (int i = 0; i < MAX_VERTICES; ++i) {
        weights[i * MAX_VERTICES + i] = 0.0f;
    }

    std::mt19937 gen(42);
    std::uniform_real_distribution<float> disReal(0.0f, 1.0f);

    float cx = 400.0f;
    float cy = 300.0f;

    for (int i = 0; i < numNodes; ++i) {
        activeNodes[i] = 1;
        float angle = disReal(gen) * 2.0f * M_PI;
        float r = std::pow(disReal(gen), 1.5f) * 250.0f;
        coords[i * 2] = cx + r * std::cos(angle);
        coords[i * 2 + 1] = cy + r * std::sin(angle);
    }

    for (int i = 1; i < numNodes; ++i) {
        int nearest = 0;
        float minDist = INF;
        float ix = coords[i * 2];
        float iy = coords[i * 2 + 1];

        for (int j = 0; j < i; ++j) {
            float jx = coords[j * 2];
            float jy = coords[j * 2 + 1];
            float dist = std::hypot(ix - jx, iy - jy);
            if (dist < minDist) {
                minDist = dist;
                nearest = j;
            }
        }
        float w = std::max(20.0f, std::round(minDist / 2.0f));
        weights[i * MAX_VERTICES + nearest] = w;
        weights[nearest * MAX_VERTICES + i] = w;
    }

    for (int i = 0; i < numNodes; ++i) {
        float ix = coords[i * 2];
        float iy = coords[i * 2 + 1];

        for (int j = i + 1; j < numNodes; ++j) {
            if (disReal(gen) < edgeProb) {
                float jx = coords[j * 2];
                float jy = coords[j * 2 + 1];
                float dist = std::hypot(ix - jx, iy - jy);

                if (dist < 150.0f) {
                    float w = std::max(20.0f, std::round(dist / 2.0f));
                    weights[i * MAX_VERTICES + j] = w;
                    weights[j * MAX_VERTICES + i] = w;
                }
            }
        }
    }

    double seq_time = 0.0;
    int runsCount = 3;
    double seq_sum = 0.0;
    for (int run = 0; run < runsCount; ++run) {
        double run_time = 0.0;
        runSequentialFW(numNodes, run_time);
        seq_sum += run_time;
    }
    seq_time = seq_sum / runsCount;

    std::vector<int> threadRuns = {1, 2, 4, 8, 16};
    std::vector<double> par_times;
    std::vector<double> par_overheads;


    for (int t : threadRuns) {
        double par_sum = 0.0;
        double overhead_sum = 0.0;
        for (int run = 0; run < runsCount; ++run) {
            double run_time = 0.0;
            double overhead = 0.0;
            runParallelFW(numNodes, t, run_time, overhead);
            par_sum += run_time;
            overhead_sum += overhead;
        }
        par_times.push_back(par_sum / runsCount);
        par_overheads.push_back(overhead_sum / runsCount);
    }

    std::copy(backup_weights.begin(), backup_weights.end(), weights);
    std::copy(backup_blocked.begin(), backup_blocked.end(), blocked);
    std::copy(backup_coords.begin(), backup_coords.end(), coords);
    std::copy(backup_activeNodes.begin(), backup_activeNodes.end(), activeNodes);

    std::stringstream ss;
    ss << std::fixed << std::setprecision(4);
    ss << "{\"status\":\"success\",\"type\":\"BENCHMARK_RESULTS\",\"seq_time\":" << seq_time << ",\"threads\":[1,2,4,8,16],\"times\":[";
    for (size_t i = 0; i < par_times.size(); ++i) {
        ss << par_times[i] << (i == par_times.size() - 1 ? "" : ",");
    }
    ss << "],\"overheads\":[";
    for (size_t i = 0; i < par_overheads.size(); ++i) {
        ss << par_overheads[i] << (i == par_overheads.size() - 1 ? "" : ",");
    }
    ss << "]}";
    out_json = ss.str();
}

// Reroute active vehicles based on updated routing matrix (e.g. after graph edit)
void rerouteActiveVehicles() {
    #pragma omp parallel for schedule(static) if(totalVehicles > 500)
    for (int i = 0; i < totalVehicles; ++i) {
        int vOffset = i * 8;
        int state = vehicleInts[vOffset + 2];
        if (state != 1 && state != 2 && state != 3) continue;

        int destination = vehicleInts[vOffset + 4];
        int currentPathIndex = vehicleInts[vOffset + 5];
        int pathLen = vehicleInts[vOffset + 6];
        int vPathOffset = i * 100;

        int u = vehiclePaths[vPathOffset + currentPathIndex];
        int v = (currentPathIndex + 1 < pathLen) ? vehiclePaths[vPathOffset + currentPathIndex + 1] : u;

        std::vector<int> remaining;
        if (v >= 0 && v < MAX_VERTICES && activeNodes[v] == 1) {
            remaining = reconstructPath(v, destination);
        }

        if (!remaining.empty()) {
            int newPathLen = currentPathIndex + 1 + (remaining.size() - 1);
            if (newPathLen <= 100) {
                for (size_t p = 1; p < remaining.size(); ++p) {
                    vehiclePaths[vPathOffset + currentPathIndex + p] = remaining[p];
                }
                vehicleInts[vOffset + 6] = newPathLen;
                if (state == 3) {
                    vehicleInts[vOffset + 2] = 1; // Unstick and resume movement
                }
            }
        } else {
            std::vector<int> fallback;
            if (u >= 0 && u < MAX_VERTICES && activeNodes[u] == 1) {
                fallback = reconstructPath(u, destination);
            }
            if (!fallback.empty()) {
                vehicleInts[vOffset + 6] = fallback.size();
                vehicleInts[vOffset + 5] = 0;
                for (size_t p = 0; p < fallback.size(); ++p) {
                    vehiclePaths[vPathOffset + p] = fallback[p];
                }
                vehicleFloats[vOffset] = 0.0f; // reset progress
                if (state == 3) {
                    vehicleInts[vOffset + 2] = 1;
                }
            } else {
                vehicleInts[vOffset + 2] = 3; // Stuck
            }
        }
    }
}

int main() {
    // Disable stdin/stdout synchronization for fast I/O
    std::ios_base::sync_with_stdio(false);
    std::cin.tie(NULL);

    // Initial setup of self-edges
    std::fill(std::begin(weights), std::end(weights), INF);
    for (int i = 0; i < MAX_VERTICES; ++i) {
        weights[i * MAX_VERTICES + i] = 0.0f;
    }

    std::string line;
    while (std::getline(std::cin, line)) {
        if (line.empty()) continue;
        if (line == "EXIT") break;

        std::stringstream ss(line);
        std::string cmd;
        ss >> cmd;

        if (cmd == "CLEAR_GRAPH") {
            std::fill(std::begin(weights), std::end(weights), INF);
            std::fill(std::begin(blocked), std::end(blocked), 0);
            std::fill(std::begin(coords), std::end(coords), 0.0f);
            std::fill(std::begin(activeNodes), std::end(activeNodes), 0);
            for (int i = 0; i < MAX_VERTICES; ++i) {
                weights[i * MAX_VERTICES + i] = 0.0f;
            }
            std::cout << "{\"status\":\"success\"}" << std::endl;
        }
        else if (cmd == "ADD_VERTEX") {
            int id;
            float x, y;
            ss >> id >> x >> y;
            if (id >= 0 && id < MAX_VERTICES) {
                activeNodes[id] = 1;
                coords[id * 2] = x;
                coords[id * 2 + 1] = y;
                weights[id * MAX_VERTICES + id] = 0.0f;
            }
            std::cout << "{\"status\":\"success\"}" << std::endl;
        }
        else if (cmd == "ADD_EDGE") {
            int from, to;
            float w;
            int isTwoWay;
            ss >> from >> to >> w >> isTwoWay;
            if (from >= 0 && from < MAX_VERTICES && to >= 0 && to < MAX_VERTICES) {
                weights[from * MAX_VERTICES + to] = w;
                if (isTwoWay) {
                    weights[to * MAX_VERTICES + from] = w;
                }
            }
            std::cout << "{\"status\":\"success\"}" << std::endl;
        }
        else if (cmd == "BLOCK_ROAD") {
            int from, to, isBlocked;
            ss >> from >> to >> isBlocked;
            if (from >= 0 && from < MAX_VERTICES && to >= 0 && to < MAX_VERTICES) {
                blocked[from * MAX_VERTICES + to] = isBlocked;
                blocked[to * MAX_VERTICES + from] = isBlocked;
            }
            std::cout << "{\"status\":\"success\"}" << std::endl;
        }
        else if (cmd == "SPAWN") {
            int count, seed;
            ss >> count >> seed;
            spawnVehicles(count, seed);

            std::stringstream response;
            response << "{\"status\":\"success\",\"type\":\"SPAWN\",\"totalVehicles\":" << totalVehicles;
            
            response << ",\"vehicleInts\":[";
            for (int i = 0; i < totalVehicles * 8; ++i) {
                response << vehicleInts[i] << (i == totalVehicles * 8 - 1 ? "" : ",");
            }
            response << "],\"vehicleFloats\":[";
            for (int i = 0; i < totalVehicles * 8; ++i) {
                response << std::fixed << std::setprecision(4) << vehicleFloats[i] << (i == totalVehicles * 8 - 1 ? "" : ",");
            }
            response << "],\"vehiclePaths\":[";
            for (int i = 0; i < totalVehicles * 100; ++i) {
                response << vehiclePaths[i] << (i == totalVehicles * 100 - 1 ? "" : ",");
            }
            response << "]}";

            std::cout << response.str() << std::endl;
        }
        else if (cmd == "CALCULATE_FW") {
            std::string mode;
            int threads, boundary;
            ss >> mode >> threads >> boundary;

            double exec_time = 0.0;
            double sync_overhead = 0.0;

            if (mode == "parallel") {
                runParallelFW(boundary, threads, exec_time, sync_overhead);
            } else {
                runSequentialFW(boundary, exec_time);
            }

            // Recalculate paths for active vehicles
            rerouteActiveVehicles();

            // Return active subgrid fwDistance and fwNext
            std::stringstream response;
            response << std::fixed << std::setprecision(4);
            response << "{\"status\":\"success\",\"type\":\"FW\",\"exec_time\":" << exec_time 
                     << ",\"sync_overhead\":" << sync_overhead 
                     << ",\"boundary\":" << boundary 
                     << ",\"fwDistance\":[";
            for (int i = 0; i < boundary; ++i) {
                for (int j = 0; j < boundary; ++j) {
                    float val = fwDistance[i * MAX_VERTICES + j];
                    if (std::isinf(val)) {
                        response << "null";
                    } else {
                        response << val;
                    }
                    if (!(i == boundary - 1 && j == boundary - 1)) response << ",";
                }
            }
            response << "],\"fwNext\":[";
            for (int i = 0; i < boundary; ++i) {
                for (int j = 0; j < boundary; ++j) {
                    response << fwNext[i * MAX_VERTICES + j];
                    if (!(i == boundary - 1 && j == boundary - 1)) response << ",";
                }
            }
            response << "]}";

            std::cout << response.str() << std::endl;
        }
        else if (cmd == "TICK_REQUEST") {
            std::string mode;
            int threads;
            float tickRate;
            ss >> mode >> threads >> tickRate;

            double exec_time = 0.0;
            double sync_overhead = 0.0;

            // Update traffic lights on vertices before simulation step
            for (int i = 0; i < MAX_VERTICES; ++i) {
                if (activeNodes[i] > 0) {
                    // Cycles every 40 ticks, out-of-phase by node index.
                    int lightRed = ((tickCount + i * 5) % 40 < 20) ? 1 : 0;
                    trafficLights[i] = lightRed;
                } else {
                    trafficLights[i] = 0;
                }
            }

            if (mode == "parallel") {
                runParallelVehicles(threads, tickRate, exec_time, sync_overhead);
            } else {
                runSequentialVehicles(tickRate, exec_time);
            }

            // Tick statistics compilation
            int active = 0, finished = 0, waiting = 0, stuck = 0;
            for (int i = 0; i < totalVehicles; ++i) {
                int state = vehicleInts[i * 8 + 2];
                if (state == 1) active++;
                else if (state == 0) finished++;
                else if (state == 2) { active++; waiting++; }
                else if (state == 3) stuck++;
            }
            tickCount++;

            std::stringstream response;
            response << std::fixed << std::setprecision(4);
            response << "{\"status\":\"success\",\"type\":\"TICK\",\"tickCount\":" << tickCount
                     << ",\"exec_time\":" << exec_time
                     << ",\"sync_overhead\":" << sync_overhead
                     << ",\"metrics\":{"
                     << "\"active\":" << active
                     << ",\"finished\":" << finished
                     << ",\"waiting\":" << waiting
                     << ",\"stuck\":" << stuck
                     << "},"
                     << "\"trafficLights\":[";
            for (int i = 0; i < MAX_VERTICES; ++i) {
                response << trafficLights[i] << (i == MAX_VERTICES - 1 ? "" : ",");
            }
            response << "],\"activeNodes\":[";
            for (int i = 0; i < MAX_VERTICES; ++i) {
                response << (int)activeNodes[i] << (i == MAX_VERTICES - 1 ? "" : ",");
            }
            response << "],\"vehicleInts\":[";
            for (int i = 0; i < totalVehicles * 8; ++i) {
                response << vehicleInts[i] << (i == totalVehicles * 8 - 1 ? "" : ",");
            }
            response << "],\"vehicleFloats\":[";
            for (int i = 0; i < totalVehicles * 8; ++i) {
                response << vehicleFloats[i] << (i == totalVehicles * 8 - 1 ? "" : ",");
            }
            response << "]}";

            std::cout << response.str() << std::endl;
        }
        else if (cmd == "BENCHMARK") {
            std::string bench_json;
            runBenchmark(bench_json);
            std::cout << bench_json << std::endl;
        }
        else if (cmd == "RESET") {
            tickCount = 0;
            for (int i = 0; i < totalVehicles; ++i) {
                int vOffset = i * 8;
                vehicleInts[vOffset + 2] = 1; // State: Moving
                vehicleInts[vOffset + 5] = 0; // path index
                
                int origin = vehicleInts[vOffset + 3];
                vehicleFloats[vOffset] = 0.0f; // progress
                vehicleFloats[vOffset + 2] = 0.0f; // travel time
                vehicleFloats[vOffset + 3] = coords[origin * 2];
                vehicleFloats[vOffset + 4] = coords[origin * 2 + 1];
                vehicleFloats[vOffset + 7] = 0.0f; // delay
            }
            std::stringstream response;
            response << std::fixed << std::setprecision(4);
            response << "{\"status\":\"success\",\"type\":\"RESET\",\"tickCount\":" << tickCount
                     << ",\"vehicleInts\":[";
            for (int i = 0; i < totalVehicles * 8; ++i) {
                response << vehicleInts[i] << (i == totalVehicles * 8 - 1 ? "" : ",");
            }
            response << "],\"vehicleFloats\":[";
            for (int i = 0; i < totalVehicles * 8; ++i) {
                response << vehicleFloats[i] << (i == totalVehicles * 8 - 1 ? "" : ",");
            }
            response << "]}";
            std::cout << response.str() << std::endl;
        }
        else if (cmd == "ADD_VEHICLES") {
            int count, originArg, targetArg;
            ss >> count >> originArg >> targetArg;
            
            if (count <= 0) {
                std::cout << "{\"status\":\"error\",\"message\":\"invalid vehicle count\"}" << std::endl;
                continue;
            }
            if (totalVehicles + count > MAX_VEHICLES) {
                std::cout << "{\"status\":\"error\",\"message\":\"max vehicles capacity reached\"}" << std::endl;
                continue;
            }

            std::vector<int> activeNodeIds;
            for (int i = 0; i < MAX_VERTICES; ++i) {
                if (activeNodes[i] == 1) {
                    activeNodeIds.push_back(i);
                }
            }

            if (activeNodeIds.size() < 2) {
                std::cout << "{\"status\":\"error\",\"message\":\"not enough active nodes to route\"}" << std::endl;
                continue;
            }

            std::random_device rd;
            std::mt19937 gen(rd());
            std::uniform_int_distribution<> disNode(0, activeNodeIds.size() - 1);
            std::uniform_real_distribution<float> disReal(0.0f, 1.0f);

            int prevTotal = totalVehicles;
            int generated = 0;
            int attempts = 0;
            int maxAttempts = count * 10;

            vehicleInts.resize((prevTotal + count) * 8, 0);
            vehicleFloats.resize((prevTotal + count) * 8, 0.0f);
            vehiclePaths.resize((prevTotal + count) * 100, 0);

            while (generated < count && attempts < maxAttempts) {
                attempts++;
                int origin = (originArg == -1) ? activeNodeIds[disNode(gen)] : originArg;
                int destination = (targetArg == -1) ? activeNodeIds[disNode(gen)] : targetArg;
                
                if (origin == destination) continue;
                if (origin < 0 || origin >= MAX_VERTICES || destination < 0 || destination >= MAX_VERTICES) continue;
                if (activeNodes[origin] != 1 || activeNodes[destination] != 1) continue;

                std::vector<int> path = reconstructPath(origin, destination);
                if (path.size() < 2) continue;

                float randType = disReal(gen);
                int type = 0;
                float speed = 50.0f;
                if (randType < 0.6f) {
                    type = 0;
                    speed = 50.0f;
                } else if (randType < 0.9f) {
                    type = 1;
                    speed = 70.0f;
                } else {
                    type = 2;
                    speed = 30.0f;
                }

                float variance = 0.9f + disReal(gen) * 0.2f;
                speed = speed * variance;

                int currentVehicleIdx = prevTotal + generated;
                int vOffset = currentVehicleIdx * 8;
                int vPathOffset = currentVehicleIdx * 100;

                vehicleInts[vOffset] = currentVehicleIdx;
                vehicleInts[vOffset + 1] = type;
                vehicleInts[vOffset + 2] = 1; // State: 1 = Moving
                vehicleInts[vOffset + 3] = origin;
                vehicleInts[vOffset + 4] = destination;
                vehicleInts[vOffset + 5] = 0; // path index
                vehicleInts[vOffset + 6] = path.size();

                vehicleFloats[vOffset] = 0.0f; // progress
                vehicleFloats[vOffset + 1] = speed;
                vehicleFloats[vOffset + 2] = 0.0f; // travel time
                vehicleFloats[vOffset + 3] = coords[origin * 2];
                vehicleFloats[vOffset + 4] = coords[origin * 2 + 1];
                vehicleFloats[vOffset + 7] = 0.0f; // delay

                for (size_t p = 0; p < path.size(); ++p) {
                    vehiclePaths[vPathOffset + p] = path[p];
                }

                generated++;
            }

            totalVehicles = prevTotal + generated;
            vehicleInts.resize(totalVehicles * 8);
            vehicleFloats.resize(totalVehicles * 8);
            vehiclePaths.resize(totalVehicles * 100);

            std::stringstream response;
            response << std::fixed << std::setprecision(4);
            response << "{\"status\":\"success\",\"type\":\"ADD_VEHICLES\",\"totalVehicles\":" << totalVehicles;
            response << ",\"vehicleInts\":[";
            for (int i = 0; i < totalVehicles * 8; ++i) {
                response << vehicleInts[i] << (i == totalVehicles * 8 - 1 ? "" : ",");
            }
            response << "],\"vehicleFloats\":[";
            for (int i = 0; i < totalVehicles * 8; ++i) {
                response << vehicleFloats[i] << (i == totalVehicles * 8 - 1 ? "" : ",");
            }
            response << "],\"vehiclePaths\":[";
            for (int i = 0; i < totalVehicles * 100; ++i) {
                response << vehiclePaths[i] << (i == totalVehicles * 100 - 1 ? "" : ",");
            }
            response << "]}";

            std::cout << response.str() << std::endl;
        }
        else if (cmd == "BENCHMARK_CURRENT") {
            int V;
            ss >> V;
            if (V <= 0 || V > MAX_VERTICES) {
                std::cout << "{\"status\":\"error\",\"message\":\"invalid boundary\"}" << std::endl;
                continue;
            }

            int runsCount = 5;
            if (V < 100) runsCount = 100;
            else if (V < 300) runsCount = 20;

            double seq_sum = 0.0;
            for (int run = 0; run < runsCount; ++run) {
                double run_time = 0.0;
                runSequentialFW(V, run_time);
                seq_sum += run_time;
            }
            double seq_time = seq_sum / runsCount;

            std::vector<int> threadRuns = {1, 2, 4, 8, 16};
            std::vector<double> par_times;
            std::vector<double> par_overheads;


            for (int t : threadRuns) {
                double par_sum = 0.0;
                double overhead_sum = 0.0;
                for (int run = 0; run < runsCount; ++run) {
                    double run_time = 0.0;
                    double overhead = 0.0;
                    runParallelFW(V, t, run_time, overhead);
                    par_sum += run_time;
                    overhead_sum += overhead;
                }
                par_times.push_back(par_sum / runsCount);
                par_overheads.push_back(overhead_sum / runsCount);
            }

            rerouteActiveVehicles();

            std::stringstream response;
            response << std::fixed << std::setprecision(4);
            response << "{\"status\":\"success\",\"type\":\"BENCHMARK_CURRENT\",\"seq_time\":" << seq_time << ",\"threads\":[1,2,4,8,16],\"times\":[";
            for (size_t i = 0; i < par_times.size(); ++i) {
                response << par_times[i] << (i == par_times.size() - 1 ? "" : ",");
            }
            response << "],\"overheads\":[";
            for (size_t i = 0; i < par_overheads.size(); ++i) {
                response << par_overheads[i] << (i == par_overheads.size() - 1 ? "" : ",");
            }
            response << "]}";

            std::cout << response.str() << std::endl;
        }
        else {
            std::cout << "{\"status\":\"error\",\"message\":\"unknown command\"}" << std::endl;
        }

        // Guarantee that stdout is flushed instantly after processing each line
        std::cout.flush();
    }

    return 0;
}
