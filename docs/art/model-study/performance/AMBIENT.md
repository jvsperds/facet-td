# Ambient particles and full-catalog performance

Historical draft run, before final packing and fitted arms. See [the finalized connected run](CONNECTED.md) for current geometry and its timing limitations.

2026-10-26. Uncommitted art study; wall integration and standalone rebuild remain deferred.

The live study adds eight small ambient motes per visible tower in one shared Points draw call. Frost drifts down, embers and green wisps rise, and other families use orbiting facet sparks. They are diamond-shaped sprites with soft lifetime fading, depth testing and no depth writes, lights or shadows. The Ambient particles toggle disables both drawing and updates. Reduced-motion preferences start them off; manually enabling them under that preference shows a frozen arrangement. Rebuilding masonry disposes the old particle geometry/material. Hidden tower families and hidden ancestors emit no motes.

## Results

Intel UHD Graphics 620, ANGLE Direct3D11, T3 Electron/Chromium 152; 1280 × 720, pixel ratio 1, 2048 PCF shadows. All 46 designs (8 basic, 4 Silver/Malachite, 34 drafts with body trims) repeat through each scene at their default display qualities. Each scene also has one wall per four towers and 64 moving creeps. Draft towers still have no fitted wall arms.

Three runs per on/off pair, reversing the order in the middle run; 8 warm-up renders then 30 measured renders per case: **24 cases, 720 measured samples**. The integrated renderer is used in both cases. Timers yield between frames; gl.finish measures completed CPU/render workload, **not presented FPS**. All cases reported visible document state. The separate live study was navigated away during the first run's early cases to remove its background rendering; the first 64-tower pair may include that extra load. The other cases and repetitions ran without it.

| Towers | Off median ms | On median ms | Median paired increase ms | On medians, runs 1 / 2 / 3 ms | Median on p95 ms | Particle CPU update ms | Motes |
| ------ | ------------- | ------------ | ------------------------- | ----------------------------- | ---------------- | ---------------------- | ----- |
| 64     | 11.1          | 12.3         | +1.2                      | 12.3 / 11.8 / 12.6            | 15.1             | 0.3                    | 512   |
| 256    | 13.9          | 15.3         | +1.3                      | 15.3 / 15.2 / 16.2            | 20.2             | 1.1                    | 2,048 |
| 512    | 20.8          | 21.9         | +1.1                      | 21.9 / 21.1 / 22.5            | 26.0             | 2.2                    | 4,096 |
| 1024   | 29.6          | 33.9         | +2.1                      | 33.9 / 36.6 / 30.3            | 39.4             | 4.8                    | 8,192 |

Columns aggregate the three case statistics by median. The paired increase is the median of each repetition's on-minus-off result; it can differ from subtracting the aggregated medians. p95 is the median of three within-case p95s, not a pooled percentile. Small differences and negative individual pairs reflect scheduler/driver variation.

Particles add exactly **one draw call** (895 → 896) at every density. Both variants have identical source and main-plus-shadow triangle counts in every pair. Source triangles including walls/creeps: 64,406 / 238,310 / 470,992 / 935,186. Particle CPU update alone rises to 4.8 ms at 1,024 towers. Median particle-on construction costs: 168 / 471 / 800 / 1,548 ms; these include cloning/batch setup and emitter bounds but exclude template factories and shader warm-up.

## Interpretation

Keep the current art and these sparse motes for the visual review. At 64 towers the measured workload with particles is about 12 ms; at 256 it is about 15 ms, with p95 around 20 ms. That leaves little or no reliable 60 Hz budget for actual gameplay at the higher density on this GPU. At 512 and 1,024 towers, the current render workload already exceeds 16.7 ms, including with particles off.

These results do not isolate facet count as the bottleneck. Before changing the approved art style, profile the full game at its intended visible tower density; consider reducing dynamic head submission, shadow cost and far-away particle updates. The current all-catalog head variety costs substantially more draw calls than the older eight-type test, so those historical numbers are not an art-equivalent regression comparison. No lower-facet variant was measured in this pass.

## Evidence and limits

[Raw results](ambient-results-2026-10-26.json) record all 24 cases and the environment. Post-run assertions checked all pairs for equal triangles, exactly one additional call, and eight rendered points per tower. Each case contained 30 samples. The benchmark also checks nonzero calls, finite timings and actual particle emission.

Passed: ambient-particles.test.mjs (deterministic motion, hidden ancestors, relocation, frozen clock, disable and disposal), model-batch.test.mjs, models.test.mjs and special-towers.test.mjs. The live study had no displayed error and WebGL getError returned 0 with frost-family particles enabled. Construction sanity also covers all 34 drafts.

One GPU, short synthetic runs, fixed resolution, no gameplay simulation, attack bursts, UI workload, mobile testing or thermal soak. A separate software-rendered capture is visual evidence only; all timings above came from the hardware-backed T3 browser. This does not certify 60 FPS in the game or finalize draft wall/budget/occlusion validation.
