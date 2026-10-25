# Verified board reference

Correction, 25 October 2026. The earlier P1.5 studies used an invented 16×16 layout. That was unsuitable as a board reference. All four board studies now use the current GemTD board source, verified by opening the local GemTD v0.5.0 build. The screen capture is [actual-gemtd-board.png](references/actual-gemtd-board.png).

## Current GemTD board

Source: `GemTD/data/map.json`. A local snapshot of the relevant geometry is [board-reference.json](board-reference.json). Coordinates are **[column, row], zero-based, origin at top-left**, on a **37×37** grid. All views transform the same points; their labels and order do not change.

| Marker | Column | Row |
| --- | --- | --- |
| Start | 4 | 4 |
| 1 | 4 | 18 |
| 2 | 32 | 18 |
| 3 | 32 | 4 |
| 4 | 18 | 4 |
| 5 | 18 | 32 |
| Exit | 32 | 32 |

The checkpoint order is **S → 1 → 2 → 3 → 4 → 5 → E**. Four wall arms occupy column 18 at rows 0–8 and 28–36, and row 18 at columns 0–8 and 28–36. The checkpoint cells remain open. The central cross and the two corner no-build zones follow the same source. The dashed line is a valid empty-board route computed around those walls, not straight lines through blocked cells. Segment lengths match the source fixture: **14, 30, 14, 14, 30, 14** steps.

## Original VPK anchors

These exact original world coordinates come from `data/baseline/maps/gemtd_1p.entities.json` in the foundation checkout. Lua `addon_game_mode.lua` lines 6883–6895 visits path1 through path7 in order. Start is path1, checkpoints are path2–path6, exit is path7.

| Entity | Original X Y Z |
| --- | --- |
| path1 | -1784.811157 2078.257813 151.669250 |
| path2 | -1777.811157 -1.872192 154.419250 |
| path3 | 1792.000000 -13.265137 128.000000 |
| path4 | 1779.068848 1776.127808 140.294250 |
| path5 | 1.068871 1776.127808 136.419250 |
| path6 | 4.193871 -1797.372192 132.992981 |
| path7 | 1921.068848 -1779.872192 153.677246 |

The current GemTD grid is a prior screenshot-derived reconstruction. Its start and exit are not exact substitutes for all original entity positions: the original start sits farther north, and the original exit farther east. The art studies pin the **current GemTD UI reference**. P2 must project the original VPK world anchors using the actual board transform; do not round, normalize or replace them with this screenshot-derived grid. The raw gridnav also uses 64-unit cells, while GemTD's build grid uses 128-unit cells. Those coordinate systems need an explicit conversion in the board implementation.

## Checks

Each board study embeds marker coordinates. Checks compare all seven labels against the current map source in both views and both screen sizes. A no-corner-cutting shortest-path check matches the existing empty-map route fixture. These validate the current UI reference; they do not claim that the reference grid is an exact VPK map conversion.

The cave-grey HUD studies add three explicitly illustrative current-round gems at zero-based cells (12,12), (24,12), and (12,24). These are legal cells in the reference map, outside the fixed walls, central cross and corner no-build zones. Their IDs match the three filled quick-selection slots; they do not move any checkpoint or redefine the board.
