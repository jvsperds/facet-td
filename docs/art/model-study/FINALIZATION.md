# Phase 1.5 final handoff

The user approved completion on 26 October 2026. The camera/palette/HUD direction, reference mockups, environment blockout and full procedural tower catalogue are delivered under `docs/art/`. This phase does not modify game source or baseline rules.

- Eight basic gem designs retain six quality tiers; all 38 canonical combined towers are available by source ID.
- All tower bodies use the shared grey masonry and original structure, with fitted cardinal walls, uniform exterior merlons, reviewed family silhouettes, selective body trims and source-ability identities.
- The study supplies a 38-tower connected gallery, the additional 34-model gallery, 14 combined-family views, individual inspection, original basic/quality studies, both projections, quarter turns, grayscale, reversible merge controls and seeded masonry variation.
- Ambient particles use eight motes per visible tower and one shared Points call. The toggle, reduced-motion frozen arrangement, visibility changes and resource disposal are validated.
- The standalone model preview is rebuilt from the same source. The separately completed cave blockout is consolidated from `phase-1.5/art-direction`; its spatial design is unchanged.

## Validation

`node --test docs/art/model-study/*.test.mjs` covers the six model, combined-tower, wall, batch, special-tower and ambient-particle test files.

- All 34 additional models match the captured 38-recipe baseline ID list after excluding the existing four. The snapshot records its source commit/path and requires no local Git branch to run.
- Six qualities and rest/eight aim directions meet footprint, height and at least 0.01-cell creep-clearance limits. New superstructures use 3–6 meshes, 224–772 triangles and two materials. Smallest-creep-top rays pass at all four default camera rotations and all eight neighbouring cells, at rest and aimed, for all six display qualities. Exact rest resets and finite, complete, nondegenerate faces pass.
- All 46 types across six qualities pass 276 wall transitions and 1,104 cardinal shaft contacts/head clearances. Source tower structures remain unchanged by neighbours. The 768 reciprocal wall profile/colour comparisons, uniform merlons and all wall masks pass.
- Batch tests now include the complete catalogue: surface geometry, colours, normals, shadow flags, dynamic aiming, join animation, resource ownership and selective updates are preserved.
- Browser checks cover both galleries, families and individual selection, top/isometric views, rotation, grayscale, merge endpoints/intermediate state, variation rebuilds, particle toggling and source-role cards. No displayed errors; WebGL error is zero.
- The [connected performance run](performance/CONNECTED.md) contains 24 bounded cases and 720 samples. All pairs preserve triangles and add exactly one call for particles. Host CPU contention prevents a clean timing/FPS conclusion.

An independent Terra low review covered the factory, builders, joins/packing, study lifecycle, particles and benchmark. Its status/option-label findings were corrected. Existing basic and Silver/Malachite geometry remains unchanged.

Saved [connected overview](connected-towers.png), [top view](connected-towers-top.png), [grayscale](connected-towers-grayscale.png) and [family joins](combined-families.png) were reviewed. A fresh headless Edge profile also opened the bundled `preview/index.html` directly from disk; the artifact is 623,659 bytes with no external script/stylesheet dependencies. The preserved environment server was smoke-tested after consolidation: its 180 clear approach samples, fixed openings and view/rotation controls passed.

## Phase 2 and later responsibilities

These are runtime implementation tasks, not unfinished art-direction gates:

- Adopt the rendering factories and batch module into the renderer; keep simulation rules independent. Rebuild spatial chunks for placement/removal rather than the whole scene.
- Implement camera picking, HUD exclusion/fit, keyboard/touch paths and view transitions at the viewport sizes in [IMPLEMENTATION.md](../IMPLEMENTATION.md).
- Fade or outline occluding walls/towers/creeps. Tall connected walls and bosses can cover smaller targets despite isolated-tower top-clearance checks; free camera angles and real combat require runtime validation.
- Use actual sim events for targeting, attack effects, HUD values and end-of-run statistics. Family groups/default display qualities do not create new upgrade paths.
- Finish creep art/animation and attack/impact effects in later phases; current creep shapes establish scale only.
- Profile real gameplay on quiet target hardware, including mobile/high-DPI, shadow settings, simulation/UI load, effects and thermal duration. No shipping FPS guarantee is made.

Main-branch merge requires explicit user approval under repository `AGENTS.md`; completion is delivered on the feature branch.
