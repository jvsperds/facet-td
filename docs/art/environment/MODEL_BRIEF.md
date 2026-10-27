# Environment model brief

Accepted spatial requirements, 25 October 2026. These supersede bridge shapes and camera-facing doorway treatments in earlier generated concepts. No new mockups are needed.

- The arena is in the middle of a sunken cave chamber. Higher surrounding rock establishes the sunken setting; the playable area and both approach lanes share continuous lower cave floor.
- A hostile cave opening is embedded in the logical northwest wall and feeds S. The defended castle is embedded in the logical southeast wall and reached from E. No branch connects checkpoint 2 to the castle.
- No bridge, raised causeway, void moat or decorative obstacle between either opening and its board anchor. Reserve clear floor with sufficient creature width and height; final clearance follows actual gameplay sizes.
- Both structures face inward toward the arena and keep their world orientation. Camera rotation reveals their backs or sides naturally. Never rotate architecture to face the viewer.
- Castle architecture belongs within the cave wall rather than sitting as a separate freestanding building. A fortified vault and visible heart crystal are a proposed appearance for the original castle, not a new gameplay system.
- Keep foreground wall sections, ceiling pieces and doorway roofs separable so isometric cutaways and top view expose the board and endpoints. Avoid a single opaque cave shell.
- Use grey mineral and stone surfaces, simple low-poly or chunky voxel forms, restrained warm lamps and saturated gems. Final rock detail and textures are still open.

## Asset handoff

Start with procedural blockout meshes. Later, generate or author a small modular set: rock wall sections, corners, ledges, cave mouth, fortified doorway, inset vault and lamps. GLB is suitable for imported assets. Keep pivots, scale and materials consistent, with separate collision proxies and detachable occluding sections. Use Y up; one cell equals one provisional world unit. Face doorway fronts along local +Z and attach them once to their world anchors. Do not bake camera-specific orientation, labels, HUD or lighting into models.

The blockout's world positions are provisional art coordinates based on the UI board reference. P2 must use the original VPK anchors for Classic. Cosmetic floor outside S/E adds no cells, waypoints or extra combat phase. Creeps follow S → 1 → 2 → 3 → 4 → 5 → castle/exit; arrival damages castle HP.
