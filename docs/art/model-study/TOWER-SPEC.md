# Tower model spec

|                          |                                                                              |
| ------------------------ | ---------------------------------------------------------------------------- |
| Version                  | 1.0                                                                          |
| Date                     | 26 October 2026                                                              |
| Status                   | Draft for delegation                                                         |
| Owner                    | Phase 1.5, art direction (lead integrates)                                   |
| Applies to               | `createGemTower` in [models.js](models.js), branch `codex/p1-5-tower-models` |
| Reference implementation | Diamond (`buildDiamond`); the user called it "better" than earlier versions  |

This sheet tells an agent how to build, change and check a procedural gem-tower model. It covers the eight basic towers and every tower added later (special and combined towers). Walls, creeps, effects, icons and game code in `src/` are out of scope.

**MUST** is a hard rule. A test or the lead rejects work that breaks it. **SHOULD** is the default; record the reason when you deviate. **MAY** is optional.

## Contents

1. [Read first](#1-read-first)
2. [Art style](#2-art-style)
3. [Model anatomy](#3-model-anatomy)
4. [Requirements](#4-requirements)
5. [Uniformity](#5-uniformity)
6. [Type identity](#6-type-identity)
7. [Quality tiers](#7-quality-tiers)
8. [Head and aiming](#8-head-and-aiming)
9. [Construction toolkit](#9-construction-toolkit)
10. [Validation procedure](#10-validation-procedure)
11. [Delegation and handoff](#11-delegation-and-handoff)
12. [Acceptance checklist](#12-acceptance-checklist)
13. [Known limits and open questions](#13-known-limits-and-open-questions)
14. [Glossary](#14-glossary)
15. [Appendix: numbers and scripts](#15-appendix-numbers-and-scripts)

## 1. Read first

| Source                                                                                | Use it for                                                                                                                                                   |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [models.js](models.js)                                                                | The code. `buildDiamond` is the pattern to copy. All eight types now have their own builder; the six latest builders share solid, palette and setting tools. |
| [models.test.mjs](models.test.mjs)                                                    | Bounds, occlusion, aim and tier tests. The test is the authority for every number in this sheet.                                                             |
| [README.md](README.md)                                                                | Current model descriptions and run commands.                                                                                                                 |
| [../DIRECTION.md](../DIRECTION.md)                                                    | Camera, palette, scale and type rules for the whole game.                                                                                                    |
| [../IMPLEMENTATION.md](../IMPLEMENTATION.md), section "Model scale and readable gems" | Occlusion rules and what the game renderer (P2) expects.                                                                                                     |
| [../references/user-arena-2.png](../references/user-arena-2.png)                      | The chunky, stylised look the user likes.                                                                                                                    |
| [overview.png](overview.png), [grayscale.png](grayscale.png)                          | The current models on the study board.                                                                                                                       |

Also read the repository `AGENTS.md` and `docs/PLAN.md` before you edit.

## 2. Art style

**ART-01 Theme.** A cave setting. Each tower is a built stone structure crowned by its gem. The gem is the hero; the masonry presents it.

**ART-02 Recorded user preferences.** Follow these unless the user changes them:

- A built, tower-like structure crowned by its gem. Do not make a bare gem on a socket. Do not make the gem the whole tower.
- Chunky, readable and deliberately designed game art. See [user-arena-2.png](../references/user-arena-2.png).
- Large gems. The user rejected the first Diamond: a plain tapered obelisk with a small gem.
- The user called the second Diamond "better" (26 October 2026): coursed square stone, a dark claw setting and a large brilliant cut. Treat it as the current direction, not a final approval.
- The head of every tower turns toward the creep it attacks.

**ART-03 Form language.**

- Build three readable masses: shaft, crown or setting, gem. Silhouette first, detail second.
- Use bevels, chamfers, battered feet, corbels and stacked courses. Do not use plain boxes or plain cylinders as finished forms.
- Make shapes chunky. A part that must read at overview zoom MUST be at least 0.06 cell (tier-6 units) on its smallest side. A close-up detail MUST be at least 0.02 cell.
- Do not make floating parts. Every part touches its support at rest and when aimed.
- Do not put letters, numbers or symbols as text on a model.

**ART-04 Shading.**

- Opaque `MeshStandardMaterial` with `flatShading: true` and `metalness: 0`.
- Masonry and setting: `roughness: 1`. Gems: `roughness: 0.48`.
- No textures, normal maps, emissive light, transparency, environment maps or bloom.
- Facet and stone variation come only from geometry and vertex colours (ART-06).

**ART-05 Value structure.** From dark to light, the order MUST be: walls and settings, masonry, board, gem highlight. The gem MUST be the most saturated element. Check this in grayscale.

| Role                           | Colour                                                  |
| ------------------------------ | ------------------------------------------------------- |
| Board cell                     | `#C7CAC9` (renders cream-grey under the warm key light) |
| Wall masonry (shared shades)   | `#565B5E` `#5F6466` `#686C6C` `#717473` `#7A7C78`       |
| Masonry, shaft                 | `#686C6C` (shared wall grey)                            |
| Masonry, caps, corbels, prongs | `#717473` (shared wall grey)                            |
| Setting accent (claws)         | `#5F6466` (shared wall grey)                            |
| Gems                           | The type colour in [section 6](#6-type-identity)        |

Do not add a new grey or a new gem colour without a Vault Decision from the lead.

**ART-06 Vertex-colour variation.**

- Masonry: a per-face shade from 0.93 to 1.03, keyed on the face normal and a per-block key (`stoneShade(key)`). Coplanar triangles get the same shade, so quads show no seam.
- Gems: fixed facet tones that read without specular light. Lighten toward white with a negative mix and darken toward the type's deep tone with a positive mix:

| Facet                              | Mix            | Diamond result |
| ---------------------------------- | -------------- | -------------- |
| Table (normal y > 0.99)            | −0.6           | Near white     |
| Crown, alternate facets (y > 0.05) | −0.3 and +0.45 | Star pattern   |
| Girdle (−0.05 ≤ y ≤ 0.05)          | +0.3           | Thin ice band  |
| Pavilion (y < −0.05)               | +0.7           | Deep ice       |
| Inlay lozenges                     | −0.4           | Bright sparkle |

The deep tone is the same hue, about 30% darker and slightly more saturated. Diamond uses `#6fa3b8`.

**ART-07 Light and camera.** Design for the study lights and cameras. Do not tune a model for another light.

- Hemisphere light `#f6f3e9` over `#56616a`, intensity 2.5. Sun `#fff1da`, intensity 3, from (−3, 8, 5), PCF shadows.
- Orthographic isometric camera: 45° azimuth, 35.264° elevation, and four quarter-turns. Top view at 90°.
- At overview zoom one world unit spans about 58 px across the screen at 1× scale; a cell's diamond is about 82 px wide. A normal (tier 3) tower is about 29 px wide. Silhouette and value carry the type there; detail is for close-ups.

## 3. Model anatomy

`createGemTower` returns this original scene graph. Keep it. Walls now reach y 0.38 at cell boundaries and procedurally fit the static shaft just below the gem head; see [WALLS.md](WALLS.md). The replacement square-body experiment is superseded. Original plinths, shafts and heads are preserved.

```text
model                      Group from createStone({x, z, neighbours, seed, towerBase: true}); position (x, 0, z)
│                          name = spec.name; userData: quality, setMerge, aimAt
├── masonry pier, wall arms createStone output; towerBase: true for a wider footing
└── tower                  superstructure Group (children.at(-1) of model)
    │                      scale = tier width / 0.68; position.y = 0.08 × (1 − scale)
    ├── plinth             children[0]: CylinderGeometry(0.28, 0.31, 0.12, 8), y 0.14, rotation.y π/8,
    │                      shared masonry material, dark wall-palette vertex colours
    ├── shaft and static crown meshes
    ├── static inlays      optional; gem material
    └── head               children.at(-1): Group on the shaft axis at the seat height
        ├── setting        prongs, claws or merlons; turn with the head
        └── leaners        gems, or one lean Group holding setting and gem
```

- **Authoring units.** Build at tier 6 (scale 1, width 0.68). One cell is one unit. Ground is y = 0. The plinth top is y = 0.20. The shaft axis is x = z = 0.
- **Static parts** stay on the tower: plinth, shaft, corbel, static setting band, inlays.
- **Head parts** turn: everything that holds or is the gem.

## 4. Requirements

| ID     | Requirement                                                                                                                                                                                                                                                                                                  | Checked by                                                    |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| REQ-01 | Keep the API: `createGemTower(type, { x, z, neighbours, seed, quality })`. Unknown type or tier throws `RangeError`.                                                                                                                                                                                         | Test                                                          |
| REQ-02 | Build the base with `createStone` and the same cell arguments plus `towerBase: true`. `tower.children[0]` is the plinth and uses `model.children[0].material`.                                                                                                                                               | Test                                                          |
| REQ-03 | Same inputs give identical geometry. Do not use `Math.random` or time. Use `noise()` and the seed for variation.                                                                                                                                                                                             | Test, review                                                  |
| REQ-04 | Bounds per tier, at rest and with the head aimed at eight compass points: width and depth ≤ tier width; top ≤ height cap; top ≥ 0.5 ([table](#7-quality-tiers)).                                                                                                                                             | Test                                                          |
| REQ-05 | Creep-visibility limit (tier-6 units). Every vertex of the superstructure satisfies `y ≤ 1.2376 − 0.7071 × (abs(x) + abs(z)) / √2`, with at least 0.01 margin at rest and when aimed. The smallest creep (0.2376 high) must stay visible over the tower from the cell diagonally behind.                     | Test (raycast), [margin script](#152-creep-visibility-margin) |
| REQ-06 | Occlusion budget: a tower hides at most one neighbouring cell centre at y = 0.15 in any probed view, no creep top in the four isometric views, and at most one creep top in the axis-aligned view. The test checks each cell at rest and with the head aimed at it.                                          | Test                                                          |
| REQ-07 | The head follows [section 8](#8-head-and-aiming). `aimAt()` returns every mesh to its exact rest transform.                                                                                                                                                                                                  | Test                                                          |
| REQ-08 | Materials: stone, masonry and setting materials are module-level and shared. Add them through `stoneMesh` (a builder's `add`), which sets `userData.sharedMaterial = true`. Gem materials belong to one tower; add them through `place`, which does not set the flag. Every mesh casts and receives shadows. | Review                                                        |
| REQ-09 | Geometry: closed solids with flat faces. Use `ConvexGeometry` (non-indexed, face normals) or `LatheGeometry(...).toNonIndexed()` followed by `computeVertexNormals()`. No zero-area faces. Separate coplanar surfaces by at least 0.004 to prevent z-fighting.                                               | Review, close-up capture                                      |
| REQ-10 | Budget per tower at tier 6: superstructure ≤ 800 triangles, ≤ 32 meshes, ≤ 4 materials. The current maxima are Ruby at 708 triangles and Diamond at 28 meshes.                                                                                                                                               | [Appendix](#151-current-measurements)                         |
| REQ-11 | A change to one type does not change any other type's rest pose.                                                                                                                                                                                                                                             | [Rest-pose script](#153-rest-pose-comparison)                 |
| REQ-12 | Edit only `docs/art/model-study/`. Do not edit `src/`. Do not add packages. Use three.js and its addons from the root `node_modules`.                                                                                                                                                                        | Review                                                        |
| REQ-13 | Prettier passes. Match the surrounding code style. Comment only what the code cannot show.                                                                                                                                                                                                                   | `prettier --check`                                            |
| REQ-14 | The tower keeps its type silhouette distinct in grayscale at overview zoom and in top view ([section 6](#6-type-identity)). Each `spec.tower` is unique, and its `shape` name is unique.                                                                                                                     | Test, captures                                                |

## 5. Uniformity

Every tower shares these rules, so the eight read as one set.

| ID     | Rule                                                                                                                                                                                         |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UNI-01 | Same masonry palette, connected wall arms and plinth geometry. Tower cells use a wide pier via `towerBase: true`. Do not restyle them per type.                                              |
| UNI-02 | Author at tier 6 and scale uniformly. Never scale x, y and z separately.                                                                                                                     |
| UNI-03 | The superstructure starts at the plinth top (y 0.20). The shaft foot SHOULD stay inside the plinth top radius (0.28) so the plinth ledge shows.                                              |
| UNI-04 | The tier-6 top SHOULD be between 0.93 and 1.15. The head pivot (seat height) SHOULD be between 0.62 and 0.83. This keeps a common skyline.                                                   |
| UNI-05 | Gem or cluster width at tier 6 MUST be at least 0.27. New and redesigned towers SHOULD use 0.35–0.50 (Diamond 0.48). Gem height SHOULD be at least 0.20.                                     |
| UNI-06 | Use only the palette in ART-05. Shaft `#686C6C`, caps and corbels `#717473`, settings `#5F6466`, the type gem colour.                                                                        |
| UNI-07 | Gem material: `roughness: 0.48`, `metalness: 0`, `flatShading: true`. Use `vertexColors: true` with facet tones (ART-06) for cut gems.                                                       |
| UNI-08 | Same head contract and one shared lean angle (`AIM_LEAN`, 0.17 rad).                                                                                                                         |
| UNI-09 | Facet symmetry matches the gem: a lathe shaft uses the gem's `sides`. A square-plan tower uses four-fold symmetry with an eight-fold gem. Prong and claw counts divide the gem's side count. |
| UNI-10 | At rest a tower has no facing direction: its plan is symmetric. If a design must have a front, it faces +x at rest.                                                                          |
| UNI-11 | Detail level: redesigned towers SHOULD match the Diamond's craft: bevelled courses or bands, a defined setting, facet tones and a tier ladder.                                               |
| UNI-12 | One code pattern: each redesigned type has its own builder function next to `buildDiamond` and the same signature ([section 9](#9-construction-toolkit)).                                    |

## 6. Type identity

Keep each type's silhouette family when you redesign it. A redesign MAY change construction, proportion and detail, but a player who knows the old tower must recognise the new one.

| Code | Name       | Gem colour | Silhouette family (keep)                                  | Gem form                           | Symmetry | Status               |
| ---- | ---------- | ---------- | --------------------------------------------------------- | ---------------------------------- | -------- | -------------------- |
| D    | Diamond    | `#dceef2`  | Square coursed tower, battered foot, corbel, claw setting | Brilliant cut, point down, 8-fold  | 4 / 8    | Version 2, reference |
| B    | Sapphire   | `#386bd6`  | Straight column with a wider capital                      | Hexagonal prism, pointed top       | 6        | Version 2            |
| Y    | Topaz      | `#edb837`  | Waisted hourglass, three prongs                           | Pointed three-sided cut            | 3        | Version 2            |
| R    | Ruby       | `#ce4059`  | Keep: straight shaft, wide battlemented crown             | Wide eight-sided cushion           | 8        | Version 2            |
| G    | Emerald    | `#23956d`  | Tall slim spire, four prongs                              | Step-cut column with chamfered top | 4        | Version 2            |
| E    | Opal       | `#c86daf`  | Goblet: thin stem, flared cup                             | Flat eight-sided cabochon          | 8        | Version 2            |
| Q    | Aquamarine | `#31b1bf`  | Stepped ziggurat, three tiers                             | Cluster of two crystals            | 5        | Version 2            |
| P    | Amethyst   | `#9963d2`  | Squat drum with a lip                                     | Cluster of three crystals          | 6        | Version 2            |

**Distinctness tests (REQ-14).** For every new or changed type:

- In grayscale at overview zoom, name each of the eight towers from shape alone.
- In top view, the plan and gem outline differ from every other type.
- Compare against the current [grayscale.png](grayscale.png). The Diamond reads as a white star-cut crown with dark claws; keep such one-glance signatures.

**New towers (special and combined).** IDs and English names are in `data/baseline/npc/units.json` and `data/baseline/localization/english.json` on the `phase-1/foundation` branch. For example, `gemtd_baiyinqishi` is Silver Knight and `gemtd_furongshi` is Quartz.

The first implemented special families are documented in [SPECIAL-TOWERS.md](SPECIAL-TOWERS.md): Silver/Silver Knight and Malachite/Vivid Malachite. Their separate `SPECIAL_TOWERS` catalogue uses canonical IDs and the existing `createGemTower` factory, fitted walls, grey masonry and aiming contract. Their base/upgrade scale presets are art presentation choices, not additional gameplay tiers.

- A new tower MUST NOT reuse one of the eight silhouette families. It SHOULD carry one cue from each ingredient gem (for example a shaft family from one and a gem colour from another).
- Special towers use the same bounds and budgets. If a design fails them, simplify it; do not raise the limits ([IMPLEMENTATION.md](../IMPLEMENTATION.md)).
- The user approves a new silhouette before it is built in full. Show two close-up options when the direction is not clear.

## 7. Quality tiers

| Tier | Name     | Width (scale × 0.68) | Scale | Height cap (test) | Top floor |
| ---- | -------- | -------------------- | ----- | ----------------- | --------- |
| 1    | Chipped  | 0.38                 | 0.559 | 0.684             | 0.5       |
| 2    | Flawed   | 0.44                 | 0.647 | 0.779             | 0.5       |
| 3    | Normal   | 0.50                 | 0.735 | 0.874             | 0.5       |
| 4    | Flawless | 0.56                 | 0.824 | 0.969             | 0.5       |
| 5    | Perfect  | 0.62                 | 0.912 | 1.065             | 0.5       |
| 6    | Huge     | 0.68                 | 1.000 | 1.160             | 0.5       |

Height cap = 0.08 + 1.08 × scale, because the plinth stays seated at y 0.08. Rounded, the caps are 0.68 / 0.78 / 0.87 / 0.97 / 1.06 / 1.16 cell, as in [DIRECTION.md](../DIRECTION.md).

**TIER-01 Scale.** The whole superstructure scales uniformly by tier. The base stone does not scale.

**TIER-02 Detail ladder.** Each step from tier 1 to tier 5 adds exactly one visible detail. Tier 6 only grows. Rules for a detail step:

- It does not change the silhouette family or the gem colour.
- It reads in a close-up capture.
- It keeps every budget at every tier.
- Good kinds: an extra course or band, more prongs (a divisor of the gem's sides), inlaid gem lozenges, a corbel or ring, small finials that stay under the REQ-05 limit.

Diamond ladder (the example):

| Step       | Detail added                                       |
| ---------- | -------------------------------------------------- |
| 1 Chipped  | Two courses, four claws                            |
| 2 Flawed   | Faceted ice lozenge on each face of the top course |
| 3 Normal   | Third course                                       |
| 4 Flawless | Eight claws instead of four                        |
| 5 Perfect  | Fourth course                                      |
| 6 Huge     | Larger only                                        |

**TIER-03 Test.** For each type with a ladder, the mesh count inside the superstructure rises at each step from 1 to 5 and is equal at 5 and 6. Copy the Diamond assertion in `models.test.mjs`.

## 8. Head and aiming

**AIM-01 Contract.** `model.userData.aimAt(x, z)` takes a world-space board point. It turns the head about the shaft axis so the head's local +x points at the point, and it tips each leaner by `AIM_LEAN` (0.17 rad, about 10°) toward it. `aimAt()` with no arguments returns the head to rest.

- **Given** a tower at any cell, at any position in its parent, **when** `aimAt(x, z)` is called, **then** `head.rotation.y = atan2(−local.z, local.x)` with the target converted into the superstructure's local frame, and every leaner has `rotation.z = −AIM_LEAN`.
- **Given** an aimed tower, **when** `aimAt()` is called, **then** every mesh's world matrix equals the rest pose.
- **Given** a tower aimed at any compass point, **then** REQ-04, REQ-05 and REQ-06 still hold.

**AIM-02 What goes where.**

| Part                                     | Parent                                     | Why                                                          |
| ---------------------------------------- | ------------------------------------------ | ------------------------------------------------------------ |
| Shaft, corbel, static band, inlays       | `tower`                                    | Architecture does not move.                                  |
| Prongs, claws, merlons that hold the gem | `head`                                     | They turn with the gem, so the gem never turns through them. |
| One gem                                  | `head`, listed as a leaner                 | Tips on its own base.                                        |
| Cluster crystals                         | `head`, each crystal a leaner              | Each crystal tips on its own base and stays seated.          |
| Claws that grip the gem (Diamond)        | A `lean` Group inside `head`, with the gem | Claws and gem tip together, so the grip holds.               |

**AIM-03 Pivots and attachment.**

- Put the head on the shaft axis at the seat height: the top of the static crown or setting band. For a lean group, the pivot is the base of the setting. Offset the children with `position.y = −pivot`.
- Set `rotation.order = "ZYX"` on every leaner, so the lean happens in the head's frame after the part's own facet rotation.
- At any yaw, prong and claw feet MUST stay over the static seat. Use a round or eight-fold seat, or keep the feet inside the seat's inscribed circle.
- With the lean, a visible gap MUST NOT exceed 0.02 cell at tier 6. Sink feet 0.01–0.04 into the seat so the lean hides gaps.

**AIM-04 Game responsibilities.** The game picks the target and calls `aimAt` each frame. It aims air units at their shadow cell. `aimAt` turns the head at once; to ease a turn, the game aims at an interpolated point. Turn speed, recoil and attack effects are not part of the model.

## 9. Construction toolkit

**Builder pattern.** A redesigned type gets one builder function next to `buildDiamond`:

```js
function buildTopaz(add, place, head, quality, spec) {
  // add(geometry, sharedMaterial, parent = tower): stone, masonry or setting mesh.
  // place(mesh, parent = tower): gem mesh with its own material.
  // Put static parts on the tower, setting parts on head, and return the leaners.
  return leaners;
}
```

Dispatch it in `createGemTower` next to the Diamond branch. When the second builder lands, replace `if (type === "D")` with one lookup map; the lead approves that change. Keep the lathe path for types that are still version 1.

**Data entry.** Each type keeps one `GEM_TYPES` entry: `id`, `name`, `color`, and a `tower` object with a unique `shape` name and the dimensions the builder reads (Diamond: a `profile` of `[half-width, height]` pairs). Lathe types also have `sides`, an optional gem `profile`, `prongs` and `cluster`.

**Primitives.**

| Need                           | Use                                                                                                                                                  |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Round or polygonal shaft       | `LatheGeometry(points, sides, Math.PI / sides)`; points are `[radius, height]`, from the axis at the bottom, out and up, back to the axis at the top |
| Square-plan blocks and courses | `ConvexGeometry` over `squareRing(half, y)` rings; chamfer is 0.8 × half                                                                             |
| Claws, wedges, crags           | `ConvexGeometry` over two or more cross-sections                                                                                                     |
| Cut gems                       | `ConvexGeometry` over a culet point and rings (see the brilliant below)                                                                              |
| Small prongs                   | `CylinderGeometry(0.04, 0.05, 0.12, 4)`                                                                                                              |

**Recipes from the Diamond.**

- Course: a block with a bevelled top. The rings are (bottom), (top − 0.014), and (top, inset 0.012). The next course starts full width, so a shadow line separates them. The first course flares into a battered foot.
- Corbel: an inverted frustum from the neck out to the collar, then a short vertical lip.
- Brilliant cut: a culet point, an eight-point girdle ring twice (0.02 apart for the girdle band), and an eight-point table ring rotated by π/8. The hull gives a table, 16 crown facets, a girdle and 8 pavilion facets. The Diamond uses girdle radius 0.24 and a table at y 1.07; a larger or higher stone reduces its 0.045 aimed margin.
- Claw: two hulls. A wedge from the setting base to the girdle grip, then a beak from the grip over the crown.

**Shared helpers in models.js.** `noise(x, y, z, seed)`, `flat(color)`, `carvedMaterials` (vertex-coloured: shaft, caps, setting), `paint(geometry, colorOf)`, `stoneShade(key)`, `squareRing(half, y)`, `paletteMasonry` (shared white material carrying the masonry palette in vertex colours) and `towerTools` (solid, block, ring, gem, seat, inlays, grips and courses for the six latest builders). `radial`, `ring`, `tone` and `facet` are local to `buildDiamond`. When a second builder needs one of them, move it to module level unchanged; the lead approves helper changes because they affect every tower.

**Do not.** Do not create a material per mesh for masonry; vary shade with vertex colours. Do not use `Math.random`. Do not import assets or textures. Do not change `createStone`, the plinth, `QUALITY_TIERS` or `AIM_LEAN` without the lead.

## 10. Validation procedure

Run every step from the repository root. Record any step you skip and say why.

1. Run the geometry test. It MUST print `PASS` and the occlusion table.

   ```powershell
   node docs/art/model-study/models.test.mjs
   ```

2. Check formatting:

   ```powershell
   node_modules/.bin/prettier --check docs/art/model-study/*.js docs/art/model-study/*.mjs docs/art/model-study/*.md docs/art/model-study/index.html
   ```

3. Run the [rest-pose comparison](#153-rest-pose-comparison) for every type you did not change. All of them MUST be identical.
4. Run the [margin script](#152-creep-visibility-margin). Every type MUST keep at least 0.01 at rest and aimed.
5. Start your own Vite server on a free port. Port 5175 belongs to another agent. Use a config file in your scratch folder so Vite does not rewrite the shared `node_modules/.vite` cache:

   ```js
   // C:\Jasper\Codex\.tmp\facet-td-<type>\vite.config.mjs
   const repo = "C:/Jasper/Codex/Repositories/jvsperds/facet-td";
   const scratch = "C:/Jasper/Codex/.tmp/facet-td-<type>";
   export default {
     root: repo,
     cacheDir: `${scratch}/vite-cache`,
     resolve: { dedupe: ["three"] },
     server: { fs: { allow: [repo, scratch] } },
   };
   ```

   ```powershell
   node node_modules/vite/bin/vite.js --config C:/Jasper/Codex/.tmp/facet-td-<type>/vite.config.mjs --host 127.0.0.1 --port <port> --strictPort
   ```

   A scratch page in that folder opens at `http://127.0.0.1:<port>/@fs/C:/Jasper/Codex/.tmp/facet-td-<type>/<page>.html`. It can import `/docs/art/model-study/models.js`. Use the [close-up page](#154-close-up-page) for steps 6 and 7.

6. Capture with headless Edge. Use a fresh profile folder for each capture and run captures one at a time; parallel software-rendered captures stall. A capture can take more than a minute.

   ```sh
   "/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --no-first-run --no-default-browser-check --use-angle=swiftshader --enable-unsafe-swiftshader --hide-scrollbars --window-size=1100,1000 --force-device-scale-factor=2 --virtual-time-budget=4000 --user-data-dir="C:/Jasper/Codex/.tmp/facet-td-<type>/edge-N" --screenshot="C:/Jasper/Codex/.tmp/facet-td-<type>/shot-N.png" "<url>"
   ```

   Never stop `msedge.exe` processes globally; the user's browser may be open. Stop only processes whose command line contains your profile folder.

7. Look at these captures and fix what fails:

   | Capture                                            | Look for                                                                   |
   | -------------------------------------------------- | -------------------------------------------------------------------------- |
   | Six tiers of your type, close-up                   | One new detail per step, clean joins, no gaps, no z-fighting               |
   | Your tower beside the other seven at the same tier | Family resemblance, skyline, craft level                                   |
   | The same, in grayscale                             | Type reads from shape alone; gem is the lightest or most saturated element |
   | Top view                                           | Plan and gem outline differ from every type                                |
   | Four quarter-turns                                 | No angle hides the gem behind the setting                                  |
   | Head aimed in three directions                     | Lean reads; no clipping or floating parts                                  |
   | Study page at 1×                                   | Readable at overview zoom; creep still visible behind the tower            |

8. Rebuild the standalone preview:

   ```powershell
   node --input-type=module -e 'import {build} from "vite"; import {viteSingleFile} from "vite-plugin-singlefile"; await build({root:"docs/art/model-study",configFile:false,logLevel:"warn",plugins:[viteSingleFile()],build:{outDir:"preview",emptyOutDir:false}});'
   ```

9. Refresh the saved captures from a 2× capture (2200 × 2000) of `index.html`. `overview.png` is the full page resized to 1100 × 1000. `grayscale.png` is the crop from (76, 360) to (2076, 1440), converted to grayscale and resized to 1000 × 540. Use Python PIL with the LANCZOS filter.
10. Update the type's text in [README.md](README.md). Change [DIRECTION.md](../DIRECTION.md) or [IMPLEMENTATION.md](../IMPLEMENTATION.md) wording only for your type, and only when the lead asks.
11. Stop your Vite server. Delete scratch files except the captures you hand over.

## 11. Delegation and handoff

**Scope of one task.** One agent redesigns one tower type. The lead owns shared helpers, `createGemTower` dispatch, `QUALITY_TIERS`, `AIM_LEAN`, the study layout, commits, merges and the Vault log.

**Files a type agent may edit.**

- `models.js`: its `GEM_TYPES` entry, its builder function, its dispatch line.
- `models.test.mjs`: assertions for its type (tier ladder, any type-specific check). Do not loosen an existing assertion.
- `README.md`: its type's text.
- `study.js`: only if the lead asks (for example, to put the type in the tier row for review).
- Generated files: `preview/index.html`, `overview.png`, `grayscale.png`, only as the last step and only if the lead asks; otherwise the lead regenerates them after integration.

**Working copy.** Several agents share `models.js`. Work on your own branch in a separate worktree, created from the current tower branch. Keep your code in one contiguous block and do not reformat other code, so the lead can merge each type cleanly. Do not merge into `main`; merges need the user's explicit approval.

**Scratch.** `C:\Jasper\Codex\.tmp\facet-td-<type>\`. Never in the repository.

**Do not.** Do not commit, push or write to the Vault unless the lead tells you to; the lead owns the phase task log. Do not edit `src/`, walls, creeps or other types.

**Report to the lead.**

1. The design in two or three sentences and why it fits [section 2](#2-art-style).
2. The tier ladder.
3. Test, Prettier, rest-pose and margin results (paste the occlusion table).
4. Capture paths: six tiers, lineup, grayscale, top view, aimed.
5. Budgets at tier 6: triangles, meshes, materials, REQ-05 margin.
6. Any rule that limited the look, and what you would change with approval.
7. Anything unfinished.

## 12. Acceptance checklist

Copy this into the task.

- [ ] Silhouette family kept; distinct in grayscale and top view (REQ-14)
- [ ] Built tower crowned by a large gem; gem width ≥ 0.35 at tier 6, or the reason recorded (UNI-05)
- [ ] Palette, materials and vertex colours follow ART-04 to ART-06
- [ ] Scene graph matches [section 3](#3-model-anatomy); plinth first, head last
- [ ] `aimAt` works; leaners and pivots follow AIM-02 and AIM-03; no gaps above 0.02 when aimed
- [ ] One detail per tier step; tier test added (TIER-02, TIER-03)
- [ ] `models.test.mjs` passes; no assertion loosened
- [ ] Prettier passes
- [ ] Other types' rest poses identical (REQ-11)
- [ ] REQ-05 margin ≥ 0.01 at rest and aimed
- [ ] Budgets: ≤ 800 triangles, ≤ 32 meshes, ≤ 4 materials at tier 6
- [ ] Captures reviewed (section 10, step 7) and handed over
- [ ] README text updated
- [ ] Vite stopped; scratch cleaned

## 13. Known limits and open questions

- **Approved Diamond material count.** The existing Diamond uses five materials including the shared plinth. Its geometry is preserved in this pass; With castle-wall footings on the shared masonry material, Sapphire uses three and the six latest towers use two. The new builders meet the four-material requirement including the plinth.
- **Emerald grip regression.** The old prong intersection is fixed. Tests check grip vertices against the new gem hull, and the setting leans with the gem.
- **Draw calls.** Diamond uses 28 meshes in its superstructure. On a full board, the game renderer should merge static meshes that share a material. Keep static masonry on shared materials so that merge stays possible.
- **Probe coverage.** The occlusion test samples five camera angles and aims at each probed cell. It is not exhaustive for free rotation.
- **Not specified here.** Turn easing, attack and impact effects, idle animation, level-of-detail models, special-tower recipes and their final look.

## 14. Glossary

| Term            | Meaning                                                              |
| --------------- | -------------------------------------------------------------------- |
| Cell            | One board square; one world unit.                                    |
| Superstructure  | The `tower` Group: everything above the stone base.                  |
| Plinth          | The octagonal stone drum that seats the superstructure on the stone. |
| Shaft           | The main body of the tower between plinth and crown.                 |
| Course          | One stacked masonry block of a shaft.                                |
| Corbel          | A stepped-out band under the crown that carries the setting.         |
| Setting         | Prongs, claws or merlons that hold the gem.                          |
| Head            | The Group that turns toward a target: setting and gem.               |
| Leaner          | A head part that tips toward the target by `AIM_LEAN`.               |
| Seat height     | The head pivot height: top of the static crown or setting band.      |
| Rest pose       | The model with `aimAt()` called without arguments.                   |
| Tier            | Quality level 1 (Chipped) to 6 (Huge).                               |
| Authoring units | Coordinates at tier 6, before tier scaling.                          |
| Overview zoom   | The whole board in view; about 58 px per world unit at 1×.           |
| Facet tone      | A fixed vertex colour per gem facet.                                 |
| P2              | The game rendering phase that adopts these models.                   |

## 15. Appendix: numbers and scripts

### 15.1 Current measurements

Measured on 26 October 2026, tier 6, rest pose, no wall neighbours.

| Type | Top   | Head pivot y | Meshes (superstructure) | Triangles (superstructure) | REQ-05 margin at rest / aimed |
| ---- | ----- | ------------ | ----------------------- | -------------------------- | ----------------------------- |
| D    | 1.070 | 0.825        | 28                      | 590                        | 0.055 / 0.045                 |
| B    | 1.105 | 0.765        | 21                      | 518                        | 0.104 / 0.096                 |
| Y    | 1.105 | 0.755        | 16                      | 256                        | 0.096 / 0.094                 |
| R    | 1.025 | 0.735        | 22                      | 708                        | 0.117 / 0.114                 |
| G    | 1.070 | 0.780        | 18                      | 412                        | 0.060 / 0.056                 |
| E    | 0.975 | 0.745        | 14                      | 548                        | 0.186 / 0.176                 |
| Q    | 1.115 | 0.765        | 18                      | 418                        | 0.065 / 0.025                 |
| P    | 1.065 | 0.665        | 21                      | 582                        | 0.087 / 0.065                 |

Every type's superstructure is 0.573 wide at tier 6; the plinth sets that width.

### 15.2 Creep-visibility margin

Run from the repository root. It prints the smallest REQ-05 margin per type at rest and over eight aim directions.

```sh
node --input-type=module -e '
import { createGemTower, GEM_TYPES } from "./docs/art/model-study/models.js";
import { Vector3 } from "three";
const margin = (m) => {
  let min = Infinity;
  m.updateMatrixWorld(true);
  m.children.at(-1).traverse((o) => {
    if (!o.isMesh) return;
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const v = new Vector3().fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      min = Math.min(min, 1.2376 - 0.7071 * (Math.abs(v.x) + Math.abs(v.z)) / Math.SQRT2 - v.y);
    }
  });
  return min;
};
for (const t of GEM_TYPES) {
  const m = createGemTower(t.id, { quality: 6 });
  const rest = margin(m);
  let aimed = Infinity;
  for (let i = 0; i < 8; i++) {
    m.userData.aimAt(3 * Math.cos((i * Math.PI) / 4), 3 * Math.sin((i * Math.PI) / 4));
    aimed = Math.min(aimed, margin(m));
  }
  console.log(t.id, rest.toFixed(3), aimed.toFixed(3));
}'
```

### 15.3 Rest-pose comparison

Save the base version, then compare every type you did not change. Put both files in your scratch folder with a junction to the repository `node_modules` (`mklink /J node_modules <repo>\node_modules`). Remove the junction with `rmdir` before you delete the folder, so the delete does not follow it into the repository.

```sh
git show HEAD:docs/art/model-study/models.js > <scratch>/old.js
cp docs/art/model-study/models.js <scratch>/new.js
```

```js
// <scratch>/cmp.mjs: exits with an error if any listed type differs at rest.
import * as A from "./old.js";
import * as B from "./new.js";
const dump = (m) => {
  const rows = [];
  m.updateMatrixWorld(true);
  m.traverse((o) => {
    if (o.isMesh)
      rows.push(
        JSON.stringify([
          o.matrixWorld.elements
            .map((v) => v.toFixed(6).replace("-0.000000", "0.000000"))
            .join(),
          Array.from(o.geometry.attributes.position.array, (v) =>
            v.toFixed(5),
          ).join(),
          o.material.color.getHexString(),
          o.castShadow,
          o.receiveShadow,
          !!o.userData.sharedMaterial,
        ]),
      );
  });
  return rows.sort().join("\n");
};
for (const type of "BYRGEQP")
  // List the types you did not change.
  for (const quality of [1, 2, 3, 4, 5, 6])
    for (const seed of [1, 7]) {
      const options = {
        x: 2,
        z: 3,
        seed,
        quality,
        neighbours: { east: true, south: true },
      };
      const after = B.createGemTower(type, options);
      after.userData.aimAt?.(9, 9);
      after.userData.aimAt?.();
      if (dump(A.createGemTower(type, options)) !== dump(after))
        throw new Error(`${type} tier ${quality} changed`);
    }
console.log("Rest poses identical");
```

### 15.4 Close-up page

Two files in your scratch folder. The top half shows one type at six tiers; the bottom half shows all eight types at one tier. Capture it with `--window-size=1400,1000`.

Query parameters: `type` (default `D`), `tier` for the bottom row (default 6), `turn` (0–3 quarter-turns), `aim` (degrees: 0 is screen right, 90 is toward the camera), `gray=1`, `top=1`.

```html
<!-- <scratch>/closeup.html -->
<!doctype html>
<meta charset="utf-8" />
<style>
  body {
    margin: 0;
    background: #656d74;
  }
  canvas {
    display: block;
  }
</style>
<script type="module" src="./closeup.js"></script>
```

```js
// <scratch>/closeup.js
import * as THREE from "three";
import { createGemTower, GEM_TYPES } from "/docs/art/model-study/models.js";

const q = new URLSearchParams(location.search);
const az = Math.PI / 4 + (Number(q.get("turn") || 0) * Math.PI) / 2;
function view(towers, step) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(2);
  renderer.setSize(innerWidth, innerHeight / 2);
  renderer.shadowMap.enabled = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  if (q.get("gray")) renderer.domElement.style.filter = "grayscale(1)";
  document.body.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#656d74");
  scene.add(new THREE.HemisphereLight("#f6f3e9", "#56616a", 2.5));
  const sun = new THREE.DirectionalLight("#fff1da", 3);
  sun.position.set(-3, 8, 5);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, {
    left: -10,
    right: 10,
    top: 10,
    bottom: -10,
  });
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0003;
  scene.add(sun);
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(14, 0.12, 14),
    new THREE.MeshStandardMaterial({ color: "#c7cac9", roughness: 1 }),
  );
  floor.position.y = -0.07;
  floor.receiveShadow = true;
  scene.add(floor);
  // Lay the towers out along the screen's horizontal axis.
  const right = new THREE.Vector3(Math.cos(az), 0, -Math.sin(az));
  const toCamera = new THREE.Vector3(Math.sin(az), 0, Math.cos(az));
  towers.forEach((tower, i) => {
    tower.position
      .copy(right)
      .multiplyScalar((i - (towers.length - 1) / 2) * step);
    scene.add(tower);
    if (q.has("aim")) {
      const a = (Number(q.get("aim")) * Math.PI) / 180;
      const d = right
        .clone()
        .multiplyScalar(Math.cos(a))
        .addScaledVector(toCamera, Math.sin(a));
      tower.userData.aimAt(
        tower.position.x + 3 * d.x,
        tower.position.z + 3 * d.z,
      );
    }
  });
  const half = 1.05;
  const aspect = innerWidth / (innerHeight / 2);
  const camera = new THREE.OrthographicCamera(
    -half * aspect,
    half * aspect,
    half,
    -half,
    0.1,
    100,
  );
  const target = new THREE.Vector3(0, 0.5, 0);
  if (q.get("top"))
    camera.position.set(0.001 * Math.sin(az), 20, 0.001 * Math.cos(az));
  else
    camera.position.set(12 * Math.sin(az), 12 / Math.SQRT2, 12 * Math.cos(az));
  camera.position.add(target);
  camera.lookAt(target);
  renderer.render(scene, camera);
}
const type = q.get("type") || "D";
const tier = Number(q.get("tier") || 6);
view(
  [1, 2, 3, 4, 5, 6].map((quality) =>
    createGemTower(type, { quality, seed: 3 }),
  ),
  0.88,
);
view(
  GEM_TYPES.map((t) => createGemTower(t.id, { quality: tier, seed: 3 })),
  0.71,
);
```
