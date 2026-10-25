# Cave art-style mockups

25 October 2026. Three comparison concepts produced with the built-in image-generation tool from the same [verified-board desktop composition](../previews/desktop.png). These are options for review; no art-style choice is approved by generating them.

| Option | Mockup | Treatment |
| --- | --- | --- |
| A | [Faceted low-poly](a-faceted.png) | Angular cave rock, polygonal sockets and faceted crystals. |
| B | [Voxel](b-voxel.png) | Strong cubic cave structure, low block walls and stepped gem forms. |
| C | [Hybrid](c-hybrid.png) | Voxel cave rock and sockets, with distinct faceted gems. Recommended comparison candidate. |

All use the cave-grey HUD: five placement slots top-left, selection info bottom-left and icon-only tools bottom-right. The same isometric board composition, checkpoint labels and three illustrative gem placements were supplied as constraints. Visual review found the marker order and main HUD regions recognizable in all three outputs. This is a style comparison, not a pixel-accurate map or implementation specification. The generated tile counts, exact coordinates, typography and model dimensions are not authoritative; [BOARD.md](../BOARD.md) and the source SVGs remain the geometry reference. Top-down and free-rotation presentation will need review after choosing a style.

## Provenance

Created with built-in `image_gen.imagegen`, using `docs/art/previews/desktop.png` as a strict composition reference. The exact generation prompts are saved in [prompts.json](prompts.json). Original generated outputs remain under the Codex generated-images folder; these project copies are the review artifacts. No external art assets were used. The cave dressing explores the proposed style and does not commit the deferred background design.

![A: faceted low-poly](a-faceted.png)

![B: voxel](b-voxel.png)

![C: voxel cave with faceted gems](c-hybrid.png)
