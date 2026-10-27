# Silver and Malachite families

Four procedural models extend the basic gem set. In **Inspect**, choose **Silver family** or **Malachite family** to compare the base and upgrade, or choose a tower by name for a close-up. Both families also appear in the full study. This is presentation artwork; no gameplay or baseline data changes.

## Source definitions

Names, IDs and combinations come from `phase-1/foundation:data/baseline/localization/english.json` and `data/baseline/lua/addon_game_mode.json`, table `gemtd_merge` (source line 1885). Unit definitions confirm the two variants per family.

| Family    | Tower           | Canonical unit ID           | Combination                 |
| --------- | --------------- | --------------------------- | --------------------------- |
| Silver    | Silver          | `gemtd_baiyin`              | Sapphire + Topaz + Diamond  |
| Silver    | Silver Knight   | `gemtd_baiyinqishi`         | Silver + Aquamarine + Ruby  |
| Malachite | Malachite       | `gemtd_kongqueshi`          | Opal + Aquamarine + Emerald |
| Malachite | Vivid Malachite | `gemtd_xianyandekongqueshi` | Malachite + Diamond + Topaz |

The exact ingredient quality IDs remain in baseline data; these abbreviated recipe descriptions explain the visual lineage only. Do not infer new combinations or balance values from the artwork.

## Silhouettes and progression

- **Silver:** paired gatehouse buttresses, an octagonal capital and a pale, faceted vertical kite shield. The head faces local +x at rest and turns toward targets. This directional shield is intentionally different from the basic gem crowns. Diamond-like facets and column supports carry cues from its ingredients.
- **Silver Knight:** the same shield silhouette, with angular shoulder corbels, a lower armour band and three crest points. Its larger body and crest distinguish it from Silver without changing the family identity.
- **Malachite:** three swept masonry roots supporting a low, three-leaf crystal rosette. Broad leaves have dark green lower bands and lighter faceted tips, with a small central cabochon. The branching supports and broad crown echo its green crystal and cluster ingredients.
- **Vivid Malachite:** five leaves instead of three and an additional collar around the stalk. The wider flower-like plan differs from the basic Amethyst crystal cluster and Emerald spire.

All stone parts use the existing wall greys; head colours are `#CBD8E0` for Silver and `#329568` with `#226847` bands for Malachite. Materials remain opaque and flat shaded. No metallic reflection, textures or new packages.

## Factory and wall contract

`SPECIAL_TOWERS` is a separate exported catalogue; `GEM_TYPES` remains the original eight basic gems. Use the existing factory with a canonical unit ID:

```js
const silver = createGemTower("gemtd_baiyin", {
  x: 2,
  z: 3,
  seed: 7,
  neighbours: { west: true },
});
const vivid = createGemTower("gemtd_xianyandekongqueshi");
silver.userData.aimAt(creep.position.x, creep.position.z);
```

Default display scales are quality-tier 4 for the base variants and tier 6 for the upgrades. These are **art scale presets**, not six invented gameplay upgrades; `quality` can still override the display scale through the shared factory. Existing basic gems still default to tier 6. Unknown IDs or invalid quality values throw `RangeError`.

The same plinth, grey palette, cardinal wall fitting, uniform merlons, source resource ownership and `createModelBatch` path apply. Static connection spines give fitted walls a solid contact even under the Silver buttresses and Malachite roots. The gem head remains the last superstructure child and is the moving root for aiming; the rest is static.

## Validation and budgets

Default-display superstructures, including plinths:

| Tower           | Meshes | Triangles | Materials | Minimum aimed visibility margin across all six display scales |
| --------------- | ------ | --------- | --------- | ------------------------------------------------------------- |
| Silver          | 12     | 294       | 2         | 0.126                                                         |
| Silver Knight   | 18     | 372       | 2         | 0.081                                                         |
| Malachite       | 15     | 306       | 2         | 0.104                                                         |
| Vivid Malachite | 20     | 390       | 2         | 0.110                                                         |

All remain below 32 meshes, 800 triangles and four materials. Tests cover all six display scales at rest and eight aim angles, closed nondegenerate geometry, head visibility margins, isolated-tower creep-top visibility and upgrade detail progression. Wall and batch suites now cover all 12 models: 72 type/tier transitions and 288 cardinal fitted connections, alongside the 768 wall-pair seam checks. Earlier eight-gem comparison remains exact.

```powershell
node docs/art/model-study/special-towers.test.mjs
node docs/art/model-study/models.test.mjs
node docs/art/model-study/walls.test.mjs
node docs/art/model-study/model-batch.test.mjs
```

Browser checks cover family/individual Inspect, view changes, rotation, grayscale and rebuilding a variation. Independent code review found no correctness issues. Selection/camera behaviour is manually checked; the Node tests do not automate the DOM.

[Colour family study](silver-malachite.png), [grayscale](silver-malachite-gray.png), [top view](silver-malachite-top.png), and the standalone preview show the models. Render review also checks an aimed pose and connected walls. Gameplay integration, crowded-board visibility treatment, mobile hardware and sustained performance remain untested for these families.
