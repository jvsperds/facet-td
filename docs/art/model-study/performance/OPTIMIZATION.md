# Integrated renderer optimization — 26 October 2026

The model study now uses [model-batch.js](../model-batch.js). Tower geometry, facets, colours and factory APIs are unchanged. Static geometry merges by equivalent material and render/shadow flags; repeated moving geometry is instanced. Only changed heads, creeps and join roots update their matrices and GPU ranges.

At 256 towers, the median synchronized work cost was **182.9 ms unbatched → 17.3 ms prototype → 6.8 ms integrated**. Main+shadow draw calls fell **12,801 → 367 → 143**, with exactly the same submitted triangle counts in all three variants and all three runs. This is synthetic render/update cost, **not gameplay FPS**.

## Validation

- All eight gem types × six tiers × two seeds, at rest and three aimed directions, preserve triangle count, aggregate world-position first/second moments, normals, vertex colours, shadow/transparency flags and joins in `model-batch.test.mjs`.
- Checks also cover flying transparent shadows, hidden source ancestors, independent factories with distinct material UUIDs, disposal ownership, and updating one tower without traversing another.
- Existing model bounds/occlusion tests pass.
- Browser controls checked: Inspect, top view, rotation, grayscale, new variation, paused target and partial joins.
- Frozen reduced-motion, 2× Edge captures before/after: only **3 of 4,400,000 pixels** differ by more than 10 in any RGB channel. This permits tiny raster precision differences, rather than claiming byte-identical rendering.
- Terra low review found one issue in the older prototype benchmark: it forced shadow receiving on creeps. Corrected grouping/copying preserves source flags. All measurements below use the corrected comparison; original historical raw data remains unchanged with an erratum.
- No model geometry files or game source were changed.

## Corrected repeated measurements

Same Intel UHD 620 / ANGLE D3D11 machine and benchmark method as [the original study](README.md). Three complete suites; 8 warm-ups + 30 samples per case, 1280 × 720 at DPR 1, 2048 PCF shadows, all eight Huge towers, one wall per four towers, and 64 moving creep proxies. Source geometry/materials are cached templates. All heads rotate/lean throughout every sample.

Median is the median of three run medians. Ranges are run medians, not confidence intervals. Update and completed-work medians are calculated separately and need not add up exactly. The integrated renderer is the same module called by the interactive study, not a separate optimization mockup.

| Towers | Variant   | Work median ms | Work range ms | Matrix update median ms | Main + shadow calls | Setup median ms |
| ------ | --------- | -------------- | ------------- | ----------------------- | ------------------- | --------------- |
| 64     | current   | 57.8           | 41.5–66.1     | 0.3                     | 3,969               | 77.0            |
| 64     | instanced | 11.3           | 7.8–13.4      | 4.7                     | 367                 | 85.8            |
| 64     | optimized | 7.4            | 5.7–8.4       | 2.1                     | 143                 | 222.8           |
| 256    | current   | 182.9          | 169.3–190.3   | 0.9                     | 12,801              | 273.8           |
| 256    | instanced | 17.3           | 16.8–18.4     | 11.2                    | 367                 | 264.2           |
| 256    | optimized | 6.8            | 6.2–7.8       | 3.3                     | 143                 | 517.9           |
| 512    | current   | 347.3          | 268.8–380.8   | 1.5                     | 24,577              | 405.4           |
| 512    | instanced | 30.5           | 30.3–33.3     | 24.9                    | 367                 | 416.9           |
| 512    | optimized | 14.7           | 11.2–18.2     | 8.6                     | 143                 | 1299.1          |
| 1024   | current   | 687.2          | 683.4–757.6   | 3.5                     | 48,129              | 1000.1          |
| 1024   | instanced | 57.6           | 47.2–67.3     | 49.1                    | 367                 | 923.1           |
| 1024   | optimized | 20.8           | 19.4–26.6     | 15.8                    | 143                 | 1984.6          |

[Raw runs and summaries](optimization-results-2026-10-26.json) include triangle counts, p95 timings, environment metadata and setup costs. Baseline and integrated source/main+shadow triangle totals were checked equal for every count in every run.

## Lifecycle and integration limits

Source objects remain off-scene so targeting, joins and selection retain their existing contracts. Rendering copies borrow materials. Dispose the batch before disposing source resources. Transparent shadows remain separate meshes so ordinary transparent sorting still applies. Attach the batch group directly to an identity scene: its geometry/instance matrices are authored in world space.

Visibility, static transforms, topology or material changes require rebuilding. The study does this on Inspect and seed changes. Do not mutate static source objects and expect `update()` to rebuild merged geometry. Dynamic roots must be non-overlapping and registered when constructing the batch.

**Setup costs increased.** Full synthetic setup at 512 towers took a median 1.30 s, and at 1,024 towers 1.98 s, versus 0.41 / 1.00 s unbatched. These include cloning and batch construction, exclude initial template creation/shader warm-up, and are one measurement per case per run. They are not frame costs. The current small study can rebuild as a unit; a game with frequent placement/removal should partition batches spatially or stage construction. This implementation does not solve incremental in-game batch edits.

These short runs use one GPU and fixed case order; clock/scheduler variation is visible in the ranges. They do not prove frame pacing in the actual game, high-DPI/mobile performance, effects/HUD/simulation budgets or sustained thermal behaviour. The art style remains unchanged; the user's playful direction can be explored independently.
