# P1.5 implementation handoff

P1.5 working direction · 25 October 2026 · Audience: P2–P4 implementers.
The user selected a brighter mineral-and-stone identity. Values below are design choices, not measured gameplay facts.

## Camera and material

Use an orthographic camera at **45° azimuth and 35.264° elevation** above the board. This is true isometric: ground diamonds have a 1.732:1 width-to-height ratio. Reject 2:1 dimetric (30° elevation): true iso reveals more cell depth and limits overlap. Board coordinates stay fixed when the camera rotates in 90° steps. Pan and zoom preserve the selected cell. Fit the camera to the measured free canvas after HUD layout; never hard-code HUD margins.

Flat-shaded, opaque low-poly meshes use one warm directional light and a neutral fill. Avoid metallic reflections, bloom, noisy textures and transparent gems. Pale limestone and quiet sage-grey ground make the jewel silhouettes the focal point. A small contact shadow anchors each model. Low graphics can remove shadows without losing selection or identity. These are rendering defaults, not Classic rule changes.

## Palette and type

| Role | Value | Use |
| --- | --- | --- |
| Ground / panel | `#E8E5DE` / `#FAF8F2` | Warm mineral field / opaque DOM surfaces |
| Ink / secondary | `#24343B` / `#526169` | Labels and numbers; never use gem colour for body copy |
| Boundary | `#75838A` | Visible control boundary |
| Copper / on copper | `#934727` / `#FFFFFF` | Primary action and solid selected-cell rim |
| Focus | `#164FAD` | Dashed outer keyboard ring, independent of selection |
| Danger | `#A52A36` | Destructive action with explicit text |
| Board | `#D9DED1` | Low-contrast cell grid; open cells remain legible |

Use local `Segoe UI, Arial, sans-serif`, 16 px body, 14 px secondary labels, 24 px panel headings. Use tabular numerals. Controls are at least 48 × 48 CSS px with 8 px gaps. System fonts keep the offline build self-contained. Saturated gem pigments are visual identifiers; contrast comes from a dark edge and shape.

## Model scale and readable gems

One cell is one world unit. Keep the complete socket-and-gem footprint within **0.68 cell**, total height at most **0.65 cell**, and stone walls at most **0.20 cell** high. Quality widths are **0.38 / 0.44 / 0.50 / 0.56 / 0.62 / 0.68**; heights are **0.30 / 0.37 / 0.44 / 0.51 / 0.58 / 0.65**, including the socket. The same type silhouette survives every quality tier. Never scale a whole model beyond the cap. High-tier and special towers use facets or sockets rather than taller spires.

Use the eight silhouettes in [gems.svg](gems.svg). Their fixed HUD stamps follow VPK codes: diamond D, sapphire B, topaz Y, ruby R, emerald G, opal E, aquamarine Q, amethyst P. The six quality tiers are chipped, flawed, normal, flawless, perfect and huge. Display the full name and a numeric tier in the inspector. A billboard type stamp remains upright through camera rotation when zoom permits. At overview zoom, use selection and the inspector instead of promising tiny silhouettes can be identified.

Draw selected/focused cell rims above terrain. Keep ground hitboxes independent of mesh height. On touch, tap selects and a labeled action confirms; a mistaken tap must not build, keep or sell. At precise zoom, neighboring cells and creeps must remain visible around a maximum-tier tower at all four camera rotations. If an oversized special tower fails this test, simplify its silhouette. Effects stay short and never cover a cell cursor; reduced motion removes camera easing and decorative effects.

## HUD and input

Desktop: status row above the board, one 300 px inspector or Book at right, command dock below. Tablet: collapse the inspector before reducing the board. Portrait phone: two status rows, board, camera row, then a context sheet with one primary action. Short landscape: 48 px status row, canvas left, 240 px scrollable inspector right with a sticky action row. All panels respect safe areas. Opening an overlay preserves selection and returns focus on close. HP, phase and pause state remain visible. Secondary actions live under labeled More on phone; no hover-only controls.

The DOM owns menus, controls, descriptions and status announcements. Provide one keyboard board cursor with arrow navigation, Enter to select and Escape to close the top panel. Keep screen-relative arrows consistent after rotation and announce logical cell coordinates. Announce selection, invalid actions and phase changes, not combat ticks. Preserve keyboard focus when the HUD updates. A DOM cell inspector must expose the same selection and commands to assistive technology; a canvas label alone is insufficient.

## Implementation gate

P2 checks true-iso projection, four rotations, cell picking and camera fit at 1440×900, 768×1024, 390×844, 320×568 and 844×390. P3 checks legal/illegal actions, long translated labels, keyboard/assistive paths, visible focus and contrast. P4 checks crowded cells, effects and low graphics. Use actual VPK map geometry, rules, costs and labels. The studies illustrate composition only; they do not define a new map, draft tray, stat value or Classic mechanic.
