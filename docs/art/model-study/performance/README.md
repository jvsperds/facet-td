# Tower rendering performance study

This is a synthetic rendering diagnostic for the current tower art. It does not change the models or choose a new art style.

The [integrated optimization report](OPTIMIZATION.md) records the renderer now used by the study, corrected before/after comparisons and setup costs.

## Run

Start the existing Vite server from the repository root, then open `/docs/art/model-study/performance/index.html` and press **Run bounded test suite**. Keep the page visible. The result is available as `window.benchmark` and in the page text. Each click runs a finite suite; there is no recurring benchmark.

**Compare integrated optimization** runs the unbatched baseline, corrected whole-scene instancing prototype, and the reusable study renderer at 64, 256, 512 and 1,024 towers. The last variant merges static geometry, instances moving parts, and updates only head/creep transforms. All variants preserve source shadow/render flags; the integrated path also preserves transparency sorting.

```powershell
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5188
```

## Method

- Full-view 37 × 37 board, balanced mixture of the eight Huge towers, one wall per four towers, and 64 moving creep proxies.
- 1280 × 720 drawing buffer, pixel ratio 1; warm study lights; 2048 PCF shadow map. The half-resolution diagnostic uses 640 × 360.
- Tower, wall and creep geometries/materials are cached as templates, then cloned. Stone variation is fixed. Construction time includes cloning, batch setup and proxy simplification, and excludes the initial template factories and shader warm-up.
- All tower heads rotate and lean, and creeps move. The instance test updates every object matrix and every instance matrix each sample, including static masonry; this is deliberately a basic dynamic batch, with further optimisation possible.
- Eight warm-up renders followed by 30 samples per case. Each render is followed by `gl.finish()`. Report completed workload milliseconds and submission/update milliseconds, not presented FPS. The sync prevents CPU/GPU overlap and includes driver waiting; it is not a GPU timer query.
- Yielded timers schedule samples. The embedded T3 browser throttled `requestAnimationFrame` to about 1 Hz despite a visible document; animation callback intervals are therefore unsuitable as FPS evidence. Cycle times include timer scheduling and are retained only for diagnosis.
- Draw calls and rendered triangles include the main and shadow passes. Source triangle totals exclude the floor and count geometry once per placed object.
- Instancing groups identical template geometry/material pairs, keeping the exact source triangle count. Shadows and moving heads remain enabled. It changes submission, not art.
- The simplified proxy welds position seams, targets removal of 60% of welded vertices with the installed three.js simplifier, then rebuilds flat normals and uses each mesh's average vertex colour. Actual triangle reduction is measured and asserted. This is an aggressive geometry-only diagnostic, not an approved lower-facet design or a guarantee of its silhouette or shading quality.
- Self-checks require 30 finite samples, nonzero draw calls, identical source triangles when batching, and at least 15% fewer triangles for the reduced proxy.

## Limits

One machine and browser; short synthetic runs. No simulation, UI, attack effects, particles, multiplayer, loading benchmark, varied quality distribution, mobile hardware or long thermal soak. Cached geometry is already used in the unbatched baseline, so it is not the current study's per-cell factory allocation pattern. Results diagnose rendering priorities; validate real game frame pacing on target devices before setting a shipping frame-rate target.

The current models are already low-poly: 256–708 superstructure triangles per Huge tower. Fewer broad facets can still be a deliberate playful art choice; this test separates that choice from rendering submission costs.
