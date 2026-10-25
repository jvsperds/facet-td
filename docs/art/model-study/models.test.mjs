import assert from "node:assert/strict";
import { Box3, Raycaster, Vector3 } from "three";
import {
  createStone,
  createGemTower,
  GEM_TYPES,
  QUALITY_TIERS,
} from "./models.js";

const geometry = (seed, x = 0) =>
  Array.from(
    createStone({ x, seed }).children[0].geometry.attributes.position.array,
  );
assert.deepEqual(
  geometry(7),
  geometry(7),
  "Stable shape for a fixed cell/seed",
);
assert.notDeepEqual(geometry(7), geometry(8), "Seeds change the boulder shape");
assert.notDeepEqual(
  geometry(7),
  geometry(7, 1),
  "Cells vary without a new seed",
);
assert.throws(() => createStone({ x: 0.5 }), TypeError);
assert.throws(() => createGemTower("invalid"), RangeError);
assert.throws(() => createGemTower("R", { quality: 7 }), RangeError);
for (let mask = 0; mask < 16; mask++) {
  const neighbours = Object.fromEntries(
    ["north", "east", "south", "west"].map((side, i) => [
      side,
      !!(mask & (1 << i)),
    ]),
  );
  const stone = createStone({ neighbours });
  for (const progress of [0, 0.5, 1]) {
    stone.userData.setMerge(progress);
    const bounds = new Box3().setFromObject(stone);
    assert.ok(bounds.min.y >= -1e-7 && bounds.max.y <= 0.200001);
    assert.ok(bounds.min.x >= -0.500001 && bounds.max.x <= 0.500001);
    assert.ok(bounds.min.z >= -0.500001 && bounds.max.z <= 0.500001);
  }
  assert.equal(
    stone.children.length,
    1 + Object.values(neighbours).filter(Boolean).length,
    "One boulder plus one ridge per neighbour",
  );
  const bounds = new Box3().setFromObject(stone);
  if (neighbours.east)
    assert.ok(Math.abs(bounds.max.x - 0.5) < 1e-6, "East edge joins");
  if (neighbours.west)
    assert.ok(Math.abs(bounds.min.x + 0.5) < 1e-6, "West edge joins");
  if (neighbours.north)
    assert.ok(Math.abs(bounds.min.z + 0.5) < 1e-6, "North edge joins");
  if (neighbours.south)
    assert.ok(Math.abs(bounds.max.z - 0.5) < 1e-6, "South edge joins");
}
assert.equal(new Set(GEM_TYPES.map((g) => g.id)).size, 8);
assert.equal(
  new Set(GEM_TYPES.map((g) => JSON.stringify(g.tower))).size,
  8,
  "Each type has its own tower silhouette",
);
for (const type of GEM_TYPES)
  for (const { tier, width } of QUALITY_TIERS) {
    const scale = width / 0.68;
    const bounds = new Box3().setFromObject(
      createGemTower(type.id, { quality: tier }),
      true,
    );
    const label = `${type.name} tier ${tier}`;
    assert.ok(bounds.max.y <= 1.160001 * scale, `${label} height cap`);
    assert.ok(bounds.max.x - bounds.min.x <= width + 1e-6, `${label} width`);
    assert.ok(bounds.max.z - bounds.min.z <= width + 1e-6, `${label} depth`);
    assert.ok(bounds.max.y >= 0.9 * scale, `${label} rises above its wall`);
  }

// Occlusion probe: which neighbouring cell centres (creep height) does one tower hide in the isometric view?
const elevation = Math.atan(1 / Math.sqrt(2));
const hidden = (tower, azimuth) => {
  const toCamera = new Vector3(
    Math.sin(azimuth) * Math.cos(elevation),
    Math.sin(elevation),
    Math.cos(azimuth) * Math.cos(elevation),
  );
  const cells = [];
  for (let x = -2; x <= 2; x++)
    for (let z = -2; z <= 2; z++) {
      if (!x && !z) continue;
      const point = new Vector3(x, 0.15, z);
      const ray = new Raycaster(
        point.clone().addScaledVector(toCamera, 50),
        toCamera.clone().negate(),
      );
      if (ray.intersectObject(tower, true).some((hit) => hit.distance < 49.99))
        cells.push(`${x},${z}`);
    }
  return cells;
};
const occlusion = QUALITY_TIERS.map(({ tier, name }) => {
  const views = [0, 0.5, 1, 2, 3].map((quarter) =>
    Math.max(
      ...GEM_TYPES.map((type) => {
        const tower = createGemTower(type.id, { quality: tier });
        tower.updateMatrixWorld(true);
        return hidden(tower, Math.PI / 4 + (quarter * Math.PI) / 2).length;
      }),
    ),
  );
  return { tier, name, worstHiddenNeighbours: Math.max(...views) };
});
console.table(occlusion);
// Budget: a tower may hide at most the one cell diagonally behind it; P2 must reveal that cell when it matters.
assert.ok(
  occlusion.every((o) => o.worstHiddenNeighbours <= 1),
  "Occlusion budget",
);
console.log(
  "PASS: 16 adjacency masks, merge bounds, deterministic variation, eight distinct towers at six tier bounds, occlusion probe and invalid inputs",
);
