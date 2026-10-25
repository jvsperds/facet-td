# Facet TD — mineral and stone

P1.5 direction sheet · 25 October 2026 · Baseline for P2–P4.

**Bright low-poly arena, dark forest HUD, mint actions, saturated gems. Provisional slate-grey backdrop; environment styling is deferred.** The user chose a brighter identity and then supplied a board-first UI reference. The world fills the screen; compact panels float in safe corners.

| Choice | Direction |
| --- | --- |
| Camera | Two toggleable orthographic views: **Isometric** at 45° azimuth and **35.264° elevation** (1.732:1 ground diamonds), and **Top** at **90° elevation**, with a square, north-up grid at zero rotation. Both support 90° rotation; preserve logical cells and the selected gem. |
| Shading | Opaque, flat-shaded low-poly meshes. Warm key light, neutral fill, small contact shadows. No bloom, metal reflections or surface noise. |
| Palette | Limestone cells `#EAE6C6` / `#E2DFC0`, provisional backdrop `#8B969C`, dark HUD `#22362D`, raised controls `#30483C`, HUD text `#F1F6EE`, secondary text `#B7C7BF`, mint action `#54DBB7` with dark ink `#123027`. |
| States | Dark teal `#086B56` selected-cell rim on bright terrain. Separate blue `#164FAD` ground focus ring; white dashed focus on dark HUD. Danger uses `#FFB3AF` on dark panels plus explicit text. |
| Scale | One cell = one world unit. Complete model width ≤**0.68 cell**, height ≤**0.65 cell**; walls ≤**0.20 cell**. Effects cannot hide the selected cell. |
| Type | Eight distinct silhouettes and upright VPK letter stamps: D, B, Y, R, G, E, Q, P. Colour reinforces identity. |
| Quality | Six tiers: chipped, flawed, normal, flawless, perfect, huge. Width 0.38→0.68 cell; height 0.30→0.65 cell. Full name and tier number remain in the inspector. |
| Typography | Local Segoe UI / Arial, 16 px body, 14 px secondary labels, tabular numerals. Minimum 48 × 48 px controls with 8 px gaps. |

**Desktop:** compact top status bar; full-screen arena with build guidance upper left, gem inspector lower left and grouped controls lower right. Fit playable cells around measured HUD exclusion zones. If they overlap, dock or collapse the inspector and refit. Recipes open on demand. **Tablet:** collapsible inspector. **Phone portrait:** two status rows, board, camera row, context sheet with one primary action. **Short landscape:** board left, 240 px scrollable inspector right; sticky action row. Respect safe areas and 320 px screens.

**View toggle:** a visible 48 px button on desktop and phone says **Top view** in isometric mode and **Iso view** in top mode. Retain the selected cell, logical pan anchor, quarter-turn rotation and zoom relative to each view's fit. Refit around HUD panels after switching. The toggle changes presentation only.

**Input:** tap selects; a labeled action confirms. Arrow keys move one board cursor; Enter selects; Escape closes the top panel. Preserve selection and focus when panels change. A DOM cell inspector exposes equivalent commands and status announcements. Reduced motion removes camera easing and decoration. At overview zoom, use the inspector rather than relying on tiny silhouettes.

**Inspiration:** [user-supplied UI](references/user-ui.png). Adopt its board-first composition, bright board, dark floating panels and grouped controls. Exact values, costs, assets and mechanics come from Classic data.

**References:** [desktop iso](desktop.svg), [desktop top](top-view.svg), [phone iso](phone.svg), [phone top](phone-top.svg), [type and quality](gems.svg), [HUD wireframe](hud-wireframe.svg). Board geometry and marker order now follow the opened GemTD board; see [verified coordinates and original VPK anchors](BOARD.md). HUD values are illustrative. Use VPK geometry and rules in Classic. No new draft tray or gameplay rule is implied.

**Before P2–P4 ship:** check both views, repeated toggles, picking and occlusion at all four rotations, actual HUD fit, crowded cells, long labels, keyboard and assistive paths, low graphics, and reduced motion. Check 1440×900, 768×1024, 390×844, 320×568 and 844×390. Detailed dimensions and validation boundaries are in [IMPLEMENTATION.md](IMPLEMENTATION.md).
