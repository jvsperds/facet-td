# P1.5 implementation handoff

P1.5 working direction · 25 October 2026 · Audience: P2–P4 implementers.
The user selected a brighter mineral-and-stone identity, then supplied [this UI reference](references/user-ui.png). Adopt its board-first layout and floating dark HUD. The user deferred background styling; use a provisional neutral slate-grey backdrop. Values below are design choices, not measured gameplay facts.

## Camera and material

Support two orthographic camera modes behind a visible toggle. The default **Isometric** view uses **45° azimuth and 35.264° elevation** above the board. **Top** uses **90° elevation**, looking straight down, with a square north-up grid at zero quarter-turn rotation. Use a stable board-north camera up vector in Top; the view direction and up vector must not be parallel. This is true isometric: ground diamonds have a 1.732:1 width-to-height ratio. Reject 2:1 dimetric (30° elevation): true iso reveals more cell depth and limits overlap. Board coordinates stay fixed when the camera rotates in 90° steps. Pan and zoom preserve the selected cell. Fit the camera using the projected playable cells and measured HUD exclusion rectangles. A full-screen canvas can draw scenery beneath panels, but no playable cell or selected target may hide behind one. Dock or collapse the inspector and refit when corner placement cannot keep cells clear. Never hard-code HUD margins. Apply the same cell picking, path/range overlays and HUD exclusion rules in both modes.

The desktop dock and phone camera row expose a 48 px action button: **Top view** while isometric, **Iso view** while top-down. Accessible names can expand these to “Switch to top view” and “Switch to isometric view”. Keep focus on that button after activation and announce the new view once. Switching preserves the selected gem, keyboard cursor, logical pan anchor, quarter-turn rotation and zoom relative to each mode's fit; it never sends a simulation command, restarts a wave or changes a placed gem. Refit for the new projection, keeping selection clear of panels. With reduced motion, switch immediately. A later camera transition must disable cell activation until picking agrees with the displayed projection. Top-view mesh cuts and upright type stamps must remain distinguishable; the top-view studies use diagrammatic icons, not finalized mesh tops.

Flat-shaded, opaque low-poly meshes use one warm directional light and a neutral fill. Avoid metallic reflections, bloom, noisy textures and transparent gems. Pale limestone cells and a neutral slate-grey surround keep the focus on gems. Background terrain, vegetation, water, cliffs and other scenery are deferred; the reference does not commit those assets. Future scenery stays outside playable cells. A small contact shadow anchors each model. Low graphics can remove shadows without losing selection or identity. These are rendering defaults, not Classic rule changes.

## Palette and type

| Role | Value | Use |
| --- | --- | --- |
| World / board | `#8B969C` / `#EAE6C6`, `#E2DFC0` | Provisional slate backdrop / alternating limestone cells |
| HUD / raised | `#22362D` / `#30483C` | Opaque forest panels / grouped controls |
| HUD ink / secondary | `#F1F6EE` / `#B7C7BF` | Labels and tabular values |
| Boundary | `#859A91` | Visible control boundary against dark panels |
| Action / on action | `#54DBB7` / `#123027` | Mint primary and active control, dark readable text |
| Selected cell | `#086B56` | Solid rim on bright terrain; full name in inspector |
| Focus | `#164FAD` on terrain; `#FFFFFF` on HUD | Dashed outer ring independent of selection |
| Danger | `#FFB3AF` on dark HUD | Destructive action with explicit text |
| Reference-sheet ink | `#24343B` / `#526169` | Gem and wireframe diagrams on chalk `#FAF8F2` |


Use local `Segoe UI, Arial, sans-serif`, 16 px body, 14 px secondary labels, 24 px panel headings. Use tabular numerals. Controls are at least 48 × 48 CSS px with 8 px gaps. System fonts keep the offline build self-contained. Saturated gem pigments are visual identifiers; contrast comes from a dark edge and shape.

## Model scale and readable gems

One cell is one world unit. Keep the complete socket-and-gem footprint within **0.68 cell**, total height at most **0.65 cell**, and stone walls at most **0.20 cell** high. Quality widths are **0.38 / 0.44 / 0.50 / 0.56 / 0.62 / 0.68**; heights are **0.30 / 0.37 / 0.44 / 0.51 / 0.58 / 0.65**, including the socket. The same type silhouette survives every quality tier. Never scale a whole model beyond the cap. High-tier and special towers use facets or sockets rather than taller spires.

Use the eight silhouettes in [gems.svg](gems.svg). Their fixed HUD stamps follow VPK codes: diamond D, sapphire B, topaz Y, ruby R, emerald G, opal E, aquamarine Q, amethyst P. The six quality tiers are chipped, flawed, normal, flawless, perfect and huge. Display the full name and a numeric tier in the inspector. A billboard type stamp remains upright through camera rotation when zoom permits. At overview zoom, use selection and the inspector instead of promising tiny silhouettes can be identified.

Draw selected/focused cell rims above terrain. Keep ground hitboxes independent of mesh height. On touch, tap selects and a labeled action confirms; a mistaken tap must not build, keep or sell. At precise zoom, neighboring cells and creeps must remain visible around a maximum-tier tower at all four camera rotations. If an oversized special tower fails this test, simplify its silhouette. Effects stay short and never cover a cell cursor; reduced motion removes camera easing and decorative effects.

## HUD and input

Desktop: full-screen arena under a 64 px status bar. Keep build guidance upper left, a roughly 376 px inspector lower left and a grouped 64 px command dock lower right. The reference shows 1440 × 900; these are preferred sizes, not fixed offsets for every viewport. One primary action belongs in the inspector. Keep recipe ingredients under a compact Builds into section only when valid recipe data exists; open the full recipe panel on demand. Any placement-progress slots are non-interactive status reflecting actual placed gems, never a replacement draft tray. Tablet: collapse or dock the inspector before panels cover cells. Portrait phone: two status rows, board, camera row, then a context sheet with one primary action. Short landscape: 48 px status row, canvas left, 240 px scrollable inspector right with a sticky action row. All panels respect safe areas. Use opaque HUD panels so world colours do not change text contrast. Keep 48 px targets even when the reference uses smaller controls. Optional pin/close actions need visible labels or accessible names. Opening an overlay preserves selection and returns focus on close. HP, phase and pause state remain visible. Secondary actions live under labeled More on phone; no hover-only controls.

The DOM owns menus, controls, descriptions and status announcements. Provide one keyboard board cursor with arrow navigation, Enter to select and Escape to close the top panel. Keep screen-relative arrows consistent after rotation and announce logical cell coordinates. Announce selection, invalid actions and phase changes, not combat ticks. Preserve keyboard focus when the HUD updates. A DOM cell inspector must expose the same selection and commands to assistive technology; a canvas label alone is insufficient.

## Implementation gate

P2 checks isometric and top-down projection, all four rotations in both modes, cell picking and camera fit at 1440×900, 768×1024, 390×844, 320×568 and 844×390. Repeatedly toggle views at fit and zoomed-in scales, with a selected corner cell, keyboard cursor and open inspector; selection, rotation, pan anchor and relative zoom must not drift, no gem or wave may change, and pointer picks must match the shown grid. Verify the toggle is keyboard/touch accessible and reduced motion switches immediately. P3 checks legal/illegal actions, long translated labels, keyboard/assistive paths, visible focus and contrast. P4 checks crowded cells, effects and low graphics. Use actual VPK map geometry, rules, costs and labels. The studies use the verified current GemTD board geometry from [board-reference.json](board-reference.json); [BOARD.md](BOARD.md) records its coordinates and differences from original VPK anchors. P2 must use the original world anchors for Classic, not substitute the screenshot-derived grid. HUD values remain illustrative; no new draft tray, stat value or Classic mechanic is defined.
