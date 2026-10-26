# Connected castle-wall contract

The user selected **chunky battlements with broad masonry blocks**, then clarified: preserve the original towers and procedurally fit taller walls to their shafts below the gem heads. This supersedes the earlier low-wall limit and the replacement square tower bodies.

## Forms and bounds

- Straight and dead-end runs are narrow; corners, T-junctions, crossings and isolated cells form wider masonry piers.
- Ordinary walls reach **y 0.38**, with two staggered courses, recessed mortar, coping and chunky battlements. Wall footprints stay inside their cells and meet cardinal boundaries exactly at ±0.5.
- Maze walls have no fixed inside: merlons sit on both exposed edges, leaving a clear centre walkway. Each edge strip occupies cross-wall offsets 0.10–0.18, with a 0.02 outward projection beyond the coping. Pier corner merlons remain on their outer perimeter.
- Core piers are at most 0.44 × 0.44 cell; straight coping is 0.32 wide. Original tower foundations and plinths are restored; no replacement tower body is added.
- Tower connections meet y 0.38 at the cell edge. Fitted coping slopes into the shaft beneath the gem head; the stretched battlement extensions beside the shaft are removed.
- Every merlon is **0.14 long × 0.08 wide × approximately 0.1512 high**, including junction and tower-approach blocks. Tower merlons retain their rigid shape and regular position; small masonry saddles fill the sloped coping beneath them. Foundation merlons hidden under tower plinths are removed.
- Connection masonry narrows toward slim shafts; merlons do not stretch or taper. Its inner vertices raycast against the original static tower meshes at each height and lateral position; a 0.002 overlap avoids cracks. Below the shaft, the cut ends inside the foundation. Mixed types and tiers share the same cell-edge profile while adapting independently at their shafts.

## Connected pattern

“Connected textures” are implemented as actual bevelled blocks, mortar recesses, global course alignment and vertex colours, with no image textures or new packages. Brick pitch is 0.25 cell; the second course offsets by 0.125. A brick split by a cell edge keeps the same colour and a flat cut face in both halves. Footing/coping cut faces use a fixed reciprocal profile. Authored course and coping surfaces do not restart at every tile.

Use one common world seed across connected cells. World `x`/`z` and seed must be integers. Neighbour masks describe cardinal occupied cells only. When occupancy changes, rebuild the changed cell and its cardinal neighbours with updated masks. Diagonals do not join.

## API and tower transitions

`createStone({x,z,neighbours,seed,towerBase})` retains its legacy name. The default builds a raised wall; `towerBase: true` supplies the original low foundation and unshaped arms. `createGemTower` requests this automatically and fits those arms against the finished tower geometry. The first child remains the core mesh; each neighbour adds one arm Group containing one merged mesh; tower superstructure remains last. Its original plinth is restored as its first child, with its head last.

`userData.setMerge(0…1)` still extends/raises the arms. Intermediate states are animated construction, while reciprocal seamless alignment is required at progress 1. Source objects and join roots remain compatible with `createModelBatch`.

Original tower plinths, shafts, settings, gems and aiming retain their shapes. Tower masonry now uses the wall palette: shaft `#686C6C`, caps `#717473`, stone settings `#5F6466`, with existing face shading. Gem colours remain unchanged. Exact tower geometry, normal, gem-colour and world-transform comparisons against commit `ec5e628` passed for **288** type/tier/seed/rest-or-aim cases. Wall courses slope with the approach.

## Geometry and validation

All walls use the shared rough, opaque, vertex-coloured masonry material. Individual blocks are closed, bevelled convex solids; their arrays merge into one core mesh and one mesh per arm before scene batching. No per-block material or draw call is introduced.

| Shape             | Source meshes | Triangles |
| ----------------- | ------------- | --------- |
| Isolated pier     | 1             | 392       |
| Straight          | 3             | 576       |
| Corner            | 3             | 736       |
| Four-way crossing | 5             | 1,080     |

`walls.test.mjs` covers 768 reciprocal profile/colour comparisons across compatible masks, both axes, multiple seeds and positive/negative coordinates; 48 tower-to-wall boundary profiles; **192 shaft connections** across eight types, six tiers and four directions; original tower preservation; fitted coping beneath resting/leaned heads; uniform merlon dimensions across all wall masks and tower approaches; exterior edges and clear walkways; nonzero faces and the 1,080-triangle wall ceiling; and merge updates through the batch renderer. Tower tests also verify effective masonry colours against the shared wall palette. Colour connection and overview captures are refreshed; grayscale derives from the current overview. Prior rotation/top captures are historical.

The user-requested height supersedes the low-wall visibility guarantee. Isolated-tower visibility tests still pass, but taller walls and approaches can cover small creeps; gameplay fade/outline treatment remains necessary and is not implemented in this model study.

```powershell
node docs/art/model-study/models.test.mjs
node docs/art/model-study/model-batch.test.mjs
node docs/art/model-study/walls.test.mjs
```

## Performance smoke check

These historical measurements predate the raised, fitted wall connections and must not be treated as their benchmark. Fitting now adds raycasts during tower construction. The earlier corrected 12-case optimization suite ran on Intel UHD 620 hardware at 1280 × 720 / DPR1 / PCF 2048, with one wall per four towers and 64 moving creep proxies:

| Towers | Source triangles, walls/creeps included | Main + shadow calls | Median synchronized work ms |
| ------ | --------------------------------------- | ------------------- | --------------------------- |
| 64     | 71,296                                  | 141                 | 5.0                         |
| 256    | 266,752                                 | 141                 | 7.1                         |
| 512    | 527,360                                 | 141                 | 10.2                        |
| 1024   | 1,048,576                               | 141                 | 32.8                        |

[Raw smoke run](performance/castle-wall-smoke-2026-10-26.json). All three renderer variants submitted the same triangles at every load. This single short suite checks that batching still works; it is **not** a controlled before/after art benchmark or gameplay FPS. The original optimization reports retain historical rock-base results. At extreme density the new geometry is a meaningful cost; target-device, high-DPI, gameplay and sustained performance still need validation.

## Review artifacts

[Castle-wall connection study](castle-walls.png) shows straight, corner, T/crossing and mixed-tier tower joins. The standalone preview and overview/grayscale captures show the current factory output. Scratch captures include top, gray, rotations and aimed joins.
