# Finalized combined towers

The 34 additional models complete all 38 canonical combined towers, alongside the four Silver/Malachite variants. Together with the eight basic gem designs, the study contains **46 tower designs**. The user approved finalization on 26 October 2026.

The study opens **Connected wall gallery**, showing all 38 combined towers with actual wall cells between them. **Combined tower gallery** shows the 34 additional models individually; **Inspect** also provides all 14 combined families and every tower. **Full study** retains the basic towers, Silver/Malachite, quality row and original wall examples. Wall merge controls remain active in every view.

Canonical IDs are checked against the 38 `gemtd_merge` entries in the baseline snapshot recorded in [combined-source.json](combined-source.json). Family groups and default display qualities are visual comparisons, not gameplay upgrade paths.

| Visual family | Models |

| ------------------ | ------------------------------------------------------------------------ |

| Asteriated Ruby | Asteriated Ruby, Volcano |

| Jade | Jade, Gray Jade, Lucky Chinese Jade, Monkey King Jade, Diamond Cullinan |

| Quartz | Quartz, Charming Lazurite, Golden Jubilee |

| Dark Emerald | Dark Emerald, Emerald Golem |

| Yellow Sapphire | Yellow Sapphire, Northern Saber's Eye, Star Sapphire |

| Paraiba Tourmaline | Paraiba Tourmaline, Elaborately Carved Tourmaline, Sapphire Star of Adam |

| Cat's Eye | Chrysoberyl Cat's Eye, Red Coral, Carmen-Lucia |

| Gold | Gold, Egypt Gold |

| Pink Diamond | Pink Diamond, Huge Pink Diamond, Koh-i-noor Diamond |

| Bloodstone | Bloodstone, Antique Bloodstone, The Crown Prince |

| Uranium | Uranium-238, Uranium-235, Depleted-Kyparium |

| DeepSea Pearl | DeepSea Pearl, Natural Zumurud |

Each tower retains the reviewed effect-driven head and selective body trims on shared grey masonry. [Effect identities](EFFECT-IDENTITIES.md) record the verified baseline role for every model. The catalogue and builders are in `combined-towers.js`, `combined-heads-a.js` and `combined-heads-b.js`; motifs use `combined-effect-shapes.js`. Factory lookup remains `createGemTower(canonicalId, options)`.

All cardinal wall arms now fit the original body without altering its geometry, including open-pier bodies. Merlons retain uniform dimensions. Compatible solid parts are merged within their original static or moving parent: final superstructures use **3–6 meshes, 224–772 triangles and two materials**. No facets were removed. Selected crowns sit 0.025–0.04 cell lower and the carved Tourmaline head is 2% narrower to meet the existing aimed clearance/footprint limits.

Six-quality/eight-aim bounds, nondegenerate faces, exact rest resets, smallest-creep-top raycasts and source-role metadata pass. All 46 types pass wall profiles, preserved-structure checks and 1,104 cardinal contacts across six display qualities. The minimum tier-6 clearance among these 34 models is 0.0136 cell against a 0.01 limit. Wall occlusion still requires the runtime fade/outline treatment specified in the P2 handoff.

Ambient motes share one draw call, follow visible tower positions and respect reduced motion. [Final validation and handoff](FINALIZATION.md) records closure evidence and later-phase responsibilities. [Connected performance](performance/CONNECTED.md) records the bounded final benchmark and its host-contention limitation. Both live and offline studies contain the finalized catalogue.
