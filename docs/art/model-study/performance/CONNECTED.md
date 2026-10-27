# Final connected-catalogue performance

Final phase 1.5 run, 26 October 2026. [Raw 24 cases](connected-results-2026-10-26.json).

All 46 designs now have east/west fitted wall arms. The synthetic 37 × 37 scene also includes one independent wall per four towers and 64 moving creep proxies. It measures the cost of fully joined geometry; randomly distributed synthetic cells do not claim to form a legal maze. All styles repeat at their default display qualities. Geometry packing preserves facets while merging compatible parts within static/moving parents.

## Method and result

Intel UHD 620, ANGLE Direct3D11, T3 Electron/Chromium 152; 1280 × 720, DPR1, 2048 PCF shadows. Three alternating-order on/off pairs per count; 8 warm-up plus 30 samples per case: 24 cases, 720 samples. Each render ends with gl.finish. Results are synchronized CPU/render workload, not presented FPS. Every case reported visible document state; the live art view was navigated away before the run.

| Towers | Off median ms | On median ms | On medians, runs 1 / 2 / 3 ms | Median on p95 ms | Particle CPU update ms | Source triangles | On construction ms |
| ------ | ------------- | ------------ | ----------------------------- | ---------------- | ---------------------- | ---------------- | ------------------ |
| 64     | 20.4          | 22.1         | 53.5 / 9.1 / 22.1             | 68.5             | 0.4                    | 88,982           | 1644               |
| 256    | 28.6          | 40.9         | 34.1 / 40.9 / 44.8            | 169.1            | 2.0                    | 336,614          | 3882               |
| 512    | 35.6          | 36.8         | 27.1 / 39.6 / 36.8            | 128.6            | 3.3                    | 667,600          | 5452               |
| 1024   | 44.3          | 74.9         | 74.9 / 79.8 / 74.6            | 256.3            | 8.4                    | 1,328,402        | 11252              |

Each column is the median of three per-case statistics; p95 is not a pooled percentile. Construction excludes initial model-template factories and shader warm-up. It includes clone/batch setup and particle emitter bounds. Fitted geometry generation has additional raycast cost outside this construction measurement.

**Host contention limits the timing conclusion.** The 64-tower particle-on median varied from 9.1 to 53.5 ms. A subsequent two-sample Windows CPU check reported 100% total utilization; over a two-second process sample, the security-scanner process `ekrn` accumulated 13.91 CPU-seconds on this eight-thread host. This is evidence of competing CPU work near the run, not a measurement of its share during each render. The very large p95s and non-monotonic medians must not be interpreted as a clean GPU/art regression or an isolated particle-cost estimate. The scanner was not disabled or modified.

The structural results are stable: **289 calls off / 290 calls on** at every count; equal source and main-plus-shadow mesh triangles in all 12 pairs; exactly eight rendered points per tower; 30 finite samples per case. The earlier [unconnected draft run](AMBIENT.md) had 895/896 calls. New packing reduces submission, but those runs have different connected geometry and host conditions, so their timings are not an equivalent before/after comparison.

## Handoff

Keep the reviewed faceted art. All new tower superstructures remain within 800 triangles, 32 meshes and four materials; measured maxima are 772 / 6 / 2. Do not promise 60 FPS from this run. Dense joined scenes, shadows, particle CPU updates and whole-scene batch construction need a quiet-machine gameplay profile during P2/P3. Use spatial batch rebuilds for placement/removal and validate high-DPI/mobile devices and actual simulation/HUD/attack effects. No facet reduction or shipping frame-rate certification is part of this result.

To rerun, open `performance/index.html?connections=1` and press **Compare ambient particles**. Without `connections=1`, the same current catalogue is measured with no arms. `catalog=basic` selects only the original eight Huge designs. These are bounded button-triggered runs, with no recurring/background job.
