# P1.5 art and UI direction

Start with the compact [direction sheet](DIRECTION.md).

- [Desktop reference mockup](desktop.svg): bright arena, upper-left build guidance, lower-left inspector and lower-right command dock.
- [Top-down desktop mockup](top-view.svg): the same board, selection and HUD, with an Iso view return button.
- [Phone reference mockup](phone.svg): dark status and context panels, camera row and labeled actions.
- [Top-down phone mockup](phone-top.svg): square board with the view toggle still visible.
- [Gem readability reference](gems.svg): eight silhouettes, grayscale comparison, six quality tiers.
- [HUD wireframe](hud-wireframe.svg): desktop, tablet, portrait and short landscape rules.

These are static vector studies, not a game build. Their reduced board, paths, values and selected state are illustrative. Reference controls are not interactive. Keep only actions that the converted Classic rules allow.

## Evidence reused

- `docs/PLAN.md`: orthographic 3D board, procedural art, Preact DOM overlay and offline delivery.
- Vault: **Generate GemTD UI revamp mockups**, **Render GemTD UI mockup direction**, **Audit GemTD UI UX accessibility**, **Remediate GemTD UI UX accessibility audit**.
- Existing GemTD `theme/mockup-a2.html`, `theme/shots/a2-desktop.png`, `HANDOVER.md` and `theme/theme-audit.md` under `C:/Jasper/Codex/.tmp/gemtd-ui-audit/`: retain measured HUD space, 48 px targets, visible labels, board selection and focus handling. The earlier full-dark world is replaced at the user's request; the later reference restores dark HUD surfaces over the bright arena.
- Extracted VPK `out/resource_addon_english.txt`, base-gem entries `gemtd_d1` through `gemtd_p111111`: eight types and six quality tiers. The VPK owns gameplay; GemTD is a UI reference.

## User reference

[Original supplied screenshot](references/user-ui.png), received 25 October 2026. It supplies composition and mood: a large bright arena, a compact status bar, upper-left build guidance, lower-left gem/recipe inspector and grouped bottom-right controls. Publisher and asset licensing are unknown; use it as visual inspiration. Build original procedural scenery and use VPK-derived gameplay data.

The revised studies replace the earlier fixed right inspector and copper-on-chalk HUD. The camera now supports toggleable isometric and top-down modes. Both preserve selection, logical pan anchor, quarter-turn rotation and relative zoom. Background styling is deferred; the studies use a neutral slate-grey backdrop. The model caps, eight gem silhouettes, six tiers and accessible input requirements continue. Phone sheets reserve board space; desktop floating panels must remain outside projected playable cells.

## Status and validation

The bright identity follows the user's explicit choice. Both camera modes, palette values, scale caps and layout are the P1.5 implementation baseline, recorded in the Vault Decision **Facet TD mineral-and-stone art direction**. Runtime gates remain in DIRECTION.md; P1.5 does not implement them.

## Review evidence

PNG files in `previews/` are Chromium captures of the adjacent authored SVG studies, at their native dimensions. They use no external assets or fonts. The supplied screenshot is retained separately as reference material and is not composited into these studies. They are derived previews, not AI-generated reference images.

Local checks: six SVG files parse with accessible titles; Chromium rendered all six with no text outside their viewports. Contrast checks passed for body text, secondary text, mint actions, control borders, focus and selected-cell edges. The revised isometric/top-down desktop and phone studies and HUD wireframe were rendered and inspected. Projection and toggle behavior still require runtime validation. These checks do not establish runtime accessibility or touch behavior.

![Desktop study](previews/desktop.png)

![Top-down desktop study](previews/top-view.png)

![Phone study](previews/phone.png)

![Top-down phone study](previews/phone-top.png)
