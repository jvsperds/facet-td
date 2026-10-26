# Connected castle-wall contract

The user committed to castle walls and selected **chunky battlements with broad masonry blocks**. This supersedes the earlier jagged rock-ridge direction. The walls retain the dark palette and low visibility envelope while the tower shafts and gems stay unchanged.

## Forms and bounds

- Straight and dead-end runs are narrow; corners, T-junctions, crossings and isolated cells form wider masonry piers.
- Footing: y 0–0.025. Two staggered brick courses sit on recessed dark mortar. Coping: y 0.108–0.122. Battlements: y 0.118–0.196.
- The 0.196 top remains below the 0.20 wall cap. Wall footprints stay inside their cells and meet cardinal boundaries exactly at ±0.5.
- Core piers are at most 0.44 × 0.44 cell; straight coping is 0.32 wide. Tower cells have a solid masonry body reaching y 0.38, with eight staggered courses and coping at 0.366–0.38. Walls enter the sides of this body below its top; there is no separate plinth or wall battlement beneath the tower shaft.
- The first wide-pier-at-every-cell proposal read like paving; narrow straight cores and taller crenellations within the same height cap supersede it.

## Connected pattern

“Connected textures” are implemented as actual bevelled blocks, mortar recesses, global course alignment and vertex colours, with no image textures or new packages. Brick pitch is 0.25 cell; the second course offsets by 0.125. A brick split by a cell edge keeps the same colour and a flat cut face in both halves. Footing/coping cut faces use a fixed reciprocal profile. Authored course and coping surfaces do not restart at every tile.

Use one common world seed across connected cells. World `x`/`z` and seed must be integers. Neighbour masks describe cardinal occupied cells only. When occupancy changes, rebuild the changed cell and its cardinal neighbours with updated masks. Diagonals do not join.

## API and tower transitions

`createStone({x,z,neighbours,seed,towerBase})` retains its legacy name. The default builds a wall; `towerBase: true` builds the taller masonry tower body even on a straight run. `createGemTower` requests this automatically and uses identical wall arms at every quality tier. The first child remains the core mesh; each neighbour adds one arm Group; tower superstructure remains last. Each arm contains one merged mesh. The former plinth child of the superstructure is removed; its head remains last.

`userData.setMerge(0…1)` still extends/raises the arms. Intermediate states are animated construction, while reciprocal seamless alignment is required at progress 1. Source objects and join roots remain compatible with `createModelBatch`.

The tower body uses the shared wall material and brick bond. Its extra courses surround the foot of the existing shaft, so the wall connects to a continuous body instead of a platform below it. Settings, gems, tier progression and aiming remain unchanged. The earlier 288-case comparison predates this body revision; current bounds, aiming, visibility and batch checks pass for the revised geometry.

## Geometry and validation

All walls use the shared rough, opaque, vertex-coloured masonry material. Individual blocks are closed, bevelled convex solids; their arrays merge into one core mesh and one mesh per arm before scene batching. No per-block material or draw call is introduced.

| Shape             | Source meshes | Triangles |
| ----------------- | ------------- | --------- |
| Isolated pier     | 1             | 392       |
| Straight          | 3             | 496       |
| Corner            | 3             | 696       |
| Four-way crossing | 5             | 1,000     |

`walls.test.mjs` covers 768 reciprocal profile/colour comparisons across every compatible mask pairing, both axes, multiple seeds and positive/negative coordinates; 48 tower-to-wall transitions across all types/tiers, with side raycasts at two wall courses and above the wall; nonzero face areas and the 1,000-triangle wall ceiling; and merge updates through the batch renderer. Existing bounds, occlusion and batch tests remain required. Earlier render review covered grayscale, top view, four quarter-turns and aimed joins; the latest body revision has a refreshed colour connection study.

```powershell
node docs/art/model-study/models.test.mjs
node docs/art/model-study/model-batch.test.mjs
node docs/art/model-study/walls.test.mjs
```

## Performance smoke check

These measurements predate the taller tower-body revision and must not be treated as its benchmark. The new bricks increase source geometry versus the old rocks. A single corrected 12-case optimization suite was rerun on the same Intel UHD 620 hardware at 1280 × 720 / DPR1 / PCF 2048. These integrated-renderer samples include one wall per four towers and 64 moving creep proxies:

| Towers | Source triangles, walls/creeps included | Main + shadow calls | Median synchronized work ms |
| ------ | --------------------------------------- | ------------------- | --------------------------- |
| 64     | 71,296                                  | 141                 | 5.0                         |
| 256    | 266,752                                 | 141                 | 7.1                         |
| 512    | 527,360                                 | 141                 | 10.2                        |
| 1024   | 1,048,576                               | 141                 | 32.8                        |

[Raw smoke run](performance/castle-wall-smoke-2026-10-26.json). All three renderer variants submitted the same triangles at every load. This single short suite checks that batching still works; it is **not** a controlled before/after art benchmark or gameplay FPS. The original optimization reports retain historical rock-base results. At extreme density the new geometry is a meaningful cost; target-device, high-DPI, gameplay and sustained performance still need validation.

## Review artifacts

[Castle-wall connection study](castle-walls.png) shows straight, corner, T/crossing and mixed-tier tower joins. The standalone preview and overview/grayscale captures show the current factory output. Scratch captures include top, gray, rotations and aimed joins.
