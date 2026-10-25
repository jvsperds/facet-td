# Facet TD — mineral and stone

P1.5 direction sheet · 25 October 2026 · Baseline for P2–P4.

**Bright limestone, slate ink, copper controls, saturated gems.** The user chose this direction over GemTD's obsidian identity. The arena leads; the HUD sits outside it.

| Choice | Direction |
| --- | --- |
| Camera | Orthographic, 45° azimuth, **35.264° elevation**. True isometric ground diamonds are **1.732:1**, rather than 2:1 dimetric. Rotate in 90° steps; preserve logical cells. |
| Shading | Opaque, flat-shaded low-poly meshes. Warm key light, neutral fill, small contact shadows. No bloom, metal reflections or surface noise. |
| Palette | Limestone ground `#E8E5DE`, chalk panels `#FAF8F2`, slate ink `#24343B`, secondary ink `#526169`, copper action `#934727`, white action text. |
| States | Copper selected-cell rim. Separate blue `#164FAD` dashed keyboard ring. Dark edges keep pale gems visible. Danger uses `#A52A36` plus explicit text. |
| Scale | One cell = one world unit. Complete model width ≤**0.68 cell**, height ≤**0.65 cell**; walls ≤**0.20 cell**. Effects cannot hide the selected cell. |
| Type | Eight distinct silhouettes and upright VPK letter stamps: D, B, Y, R, G, E, Q, P. Colour reinforces identity. |
| Quality | Six tiers: chipped, flawed, normal, flawless, perfect, huge. Width 0.38→0.68 cell; height 0.30→0.65 cell. Full name and tier number remain in the inspector. |
| Typography | Local Segoe UI / Arial, 16 px body, 14 px secondary labels, tabular numerals. Minimum 48 × 48 px controls with 8 px gaps. |

**Desktop:** status above, board at left, one inspector or Book at right, command dock below. Fit the camera to the measured free canvas. **Tablet:** collapsible inspector. **Phone portrait:** two status rows, board, camera row, context sheet with one primary action. **Short landscape:** board left, 240 px scrollable inspector right; sticky action row. Respect safe areas and 320 px screens.

**Input:** tap selects; a labeled action confirms. Arrow keys move one board cursor; Enter selects; Escape closes the top panel. Preserve selection and focus when panels change. A DOM cell inspector exposes equivalent commands and status announcements. Reduced motion removes camera easing and decoration. At overview zoom, use the inspector rather than relying on tiny silhouettes.

**References:** [desktop](desktop.svg), [phone](phone.svg), [type and quality](gems.svg), [HUD wireframe](hud-wireframe.svg). All maps, values and states in these studies are illustrative. Use VPK geometry and rules in Classic. No new draft tray or gameplay rule is implied.

**Before P2–P4 ship:** check picking and occlusion at all four rotations, actual HUD fit, crowded cells, long labels, keyboard and assistive paths, low graphics, and reduced motion. Check 1440×900, 768×1024, 390×844, 320×568 and 844×390. Detailed dimensions and validation boundaries are in [IMPLEMENTATION.md](IMPLEMENTATION.md).
