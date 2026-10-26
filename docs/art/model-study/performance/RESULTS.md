# Tower performance results — 26 October 2026

The current tower geometry does not need to be replaced solely to fix the largest measured rendering bottleneck. Batch submission first. Broader facets remain a valid art choice for a playful look, with a potential secondary performance benefit.

At 256 towers, instancing the **unchanged** art reduced draw calls from 12,801 to 367 and median synchronized render/update work from 121.3 to 12.0 ms. Both main and dynamic shadow passes are included. The aggressive geometry proxy removed 58.0% of source triangles (147,968 → 62,080), but retained all draw calls when unbatched. It measured 95.1 ms unbatched and 9.6 ms instanced; ranges overlap the matching original-geometry cases, so the precise facet-only gain is uncertain.

## Environment and sample

Intel UHD 620 using ANGLE D3D11 hardware rendering, Intel Core i7-8550U, Windows, Electron 44 / Chromium 152, three.js r186. 1280 × 720, DPR 1, PCF shadows at 2048. Three complete suites, each case with eight warm-up renders and 30 measured samples. All cases rotate/lean heads and move 64 creep proxies. The board contains one wall per four towers.

**These numbers are completed rendering workload costs, not measured gameplay FPS.** The embedded preview throttled animation callbacks to ~1 Hz; samples instead use yielded timers and `gl.finish()`. Sync removes CPU/GPU overlap and includes driver waits. There is no GPU-only timer measurement. See [the method](README.md) and [raw runs](results-2026-10-26.json).

## Results

Median below means the median of the three run medians. Range is the minimum and maximum run median, not a confidence interval. Cases ran in the same order in each suite. Clock/thermal changes, scheduler effects and other system activity were not controlled; variation is substantial.

| Towers | Variant                   | Median work ms | Run-median range ms | Draw calls (main + shadow) | Source triangles (no floor) |
| ------ | ------------------------- | -------------- | ------------------- | -------------------------- | --------------------------- |
| 64     | current                   | 30.7           | 28.8–33.6           | 3,969                      | 41,600                      |
| 256    | current                   | 121.3          | 96.2–126.7          | 12,801                     | 147,968                     |
| 512    | current                   | 178.5          | 160.7–244.2         | 24,577                     | 289,792                     |
| 1024   | current                   | 485.6          | 280.7–491.7         | 48,129                     | 573,440                     |
| 256    | no-shadows                | 58.2           | 35.7–63.8           | 6,401                      | 147,968                     |
| 256    | half-resolution           | 114.9          | 83.1–122.3          | 12,801                     | 147,968                     |
| 256    | instanced                 | 12.0           | 10.5–14.1           | 367                        | 147,968                     |
| 256    | simplified                | 95.1           | 85.6–122.9          | 12,801                     | 62,080                      |
| 256    | instanced-simplified      | 9.6            | 9.0–13.1            | 367                        | 62,080                      |
| 256    | instanced-no-shadows      | 8.5            | 5.8–11.1            | 184                        | 147,968                     |
| 256    | instanced-half-resolution | 9.3            | 7.8–12.6            | 367                        | 147,968                     |
| 512    | instanced                 | 17.0           | 10.8–20.6           | 367                        | 289,792                     |

## Interpretation

- **Draw submission is the first problem.** At 256 towers, original art spends about 120.6 ms inside `renderer.render()` in the median summary; batching drops submission to 3.5 ms while retaining every source triangle.
- **Animation/matrix work becomes important after batching.** The simple dynamic batch still recomputes all static masonry/wall transforms and instance matrices. This costs 8.6 ms at 256 towers and 13.7 ms at 512 in the median summaries. A production renderer should retain static transforms and update only moving heads/creeps.
- **Shadows matter.** Disabling them removes a rendering pass and reduces submissions. That is partly another draw-call reduction, not proof that shadow pixels alone dominate.
- **Resolution is secondary in the unbatched case.** Reducing the drawing buffer to one quarter of its pixels gave a much smaller benefit than batching. It can help the batched case, but the short-run ranges overlap.
- **Triangle reduction helps less than batching here.** The proxy removes more than half the geometry across towers, walls and creeps, rather than only gem facets. It also averages colours and is not an approved art design. Do not treat its speedup as a prediction for a hand-designed lower-facet tower.
- **The scene is already low-poly.** Huge tower superstructures span 256–708 triangles. Thousands of separately submitted small meshes are the larger measured issue on this machine.

## Art recommendation

Keep the current models as the performance reference while the game renderer adopts instancing or compatible batching. If the goal is a playful vibe, compare one deliberately chunkier tower against this reference: larger gem-to-stone proportions, fewer broad readable facets and softer bevels, plus restrained squash/overshoot in motion. Judge that comparison for personality and readability. The tests do not require an immediate conversion of all eight towers.

No art changes or production renderer changes were made by this study.

## Limits and next validation

This is one older integrated GPU and a synthetic, full-view, cached-template board at Huge quality. It includes creep proxies and continuous head movement, but no game simulation, HUD, particles, attacks, real creep art, loading or multiplayer. It is not a mobile test, a high-DPI test or a sustained thermal test. Source geometry/materials are shared as templates even in the unbatched baseline; the study page's per-cell factory allocation pattern is not measured.

Validate the real game's frame pacing at the target camera distances and device classes before claiming 30/60 FPS. The 512/1,024 cases are stress loads, not assertions about normal gameplay.

## Later comparison correction

The integrated-optimization review found that this original naive-instancing prototype forced shadow receiving on creep proxies. Its draw-call reduction still holds, but it was not a strictly appearance-equivalent comparison. The follow-up integrated renderer and corrected benchmark preserve each source mesh's shadow/render flags; use the newer optimization results for before/after timing decisions. The raw historical runs above remain unchanged.
