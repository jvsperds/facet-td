import assert from "node:assert/strict";
import { Box3, Raycaster, Vector3 } from "three";
import {
  createStone,
  createGemTower,
  GEM_TYPES,
  QUALITY_TIERS,
  createCreep,
  creepSize,
  FLY_ALTITUDE,
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
    const tower = createGemTower(type.id, { quality: tier });
    tower.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(tower.children.at(-1), true);
    const label = `${type.name} tier ${tier}`;
    const cap = 0.08 + 1.08 * scale; // Plinth stays seated at 0.08.
    assert.ok(bounds.max.y <= cap + 1e-6, `${label} height cap`);
    assert.ok(bounds.max.x - bounds.min.x <= width + 1e-6, `${label} width`);
    assert.ok(bounds.max.z - bounds.min.z <= width + 1e-6, `${label} depth`);
    assert.ok(bounds.max.y >= 0.5, `${label} rises well above its wall`);
  }
// The tower base is its cell's stone: same variation, and it joins neighbouring walls.
const towerOnCell = createGemTower("R", {
  x: 3,
  z: 5,
  seed: 9,
  quality: 1,
  neighbours: { east: true, north: true },
});
assert.deepEqual(
  Array.from(towerOnCell.children[0].geometry.attributes.position.array),
  Array.from(
    createStone({ x: 3, z: 5, seed: 9 }).children[0].geometry.attributes
      .position.array,
  ),
  "Tower base matches the stone variation of its cell",
);
assert.equal(
  towerOnCell.children[0].material,
  towerOnCell.children.at(-1).children[0].material,
  "Plinth uses the base stone shade",
);
towerOnCell.position.set(0, 0, 0);
towerOnCell.userData.setMerge(1);
const joined = new Box3().setFromObject(towerOnCell);
assert.ok(Math.abs(joined.max.x - 0.5) < 1e-6, "Tower base joins east wall");
assert.ok(Math.abs(joined.min.z + 0.5) < 1e-6, "Tower base joins north wall");

// Creeps: VPK ModelScale 1.0-2.2 for waves, 2.2-5.0 for bosses, 6.0 at most.
assert.throws(() => createCreep({ modelScale: 0 }), RangeError);
// Walls one cell either side of a corridor protrude up to 0.27 (rock) or 0.31 (huge tower plinth).
const corridor = 2 - 2 * 0.31;
for (const modelScale of [1, 1.6, 2.2, 3.5, 5, 6])
  for (const flying of [false, true]) {
    const creep = createCreep({ modelScale, flying, boss: modelScale > 2.2 });
    const body = new Box3().setFromObject(creep.children.at(-1));
    const size = body.getSize(new Vector3());
    assert.ok(Math.abs(creep.userData.length - creepSize(modelScale)) < 1e-9);
    assert.ok(size.x <= creepSize(modelScale) + 1e-6, "Length matches scale");
    if (!flying && modelScale <= 5)
      assert.ok(size.z <= corridor, "Creep clears corridor walls");
    assert.ok(creep.userData.healthBarY > body.max.y, "Health bar above body");
    if (flying) assert.ok(body.min.y > 1.16, "Air units fly above towers");
    else assert.ok(body.max.y >= 0.2, "Ground creeps stand above walls");
  }
assert.ok(creepSize(5) >= 1.5, "Bosses read at 1.5+ cells");

// Occlusion probe: which neighbouring cell centres (creep height) does one tower hide in the isometric view?
const elevation = Math.atan(1 / Math.sqrt(2));
const hidden = (tower, azimuth, y = 0.15) => {
  const toCamera = new Vector3(
    Math.sin(azimuth) * Math.cos(elevation),
    Math.sin(elevation),
    Math.cos(azimuth) * Math.cos(elevation),
  );
  const cells = [];
  for (let x = -2; x <= 2; x++)
    for (let z = -2; z <= 2; z++) {
      if (!x && !z) continue;
      const point = new Vector3(x, y, z);
      const ray = new Raycaster(
        point.clone().addScaledVector(toCamera, 50),
        toCamera.clone().negate(),
      );
      if (ray.intersectObject(tower, true).some((hit) => hit.distance < 49.99))
        cells.push(`${x},${z}`);
    }
  return cells;
};
const smallest = createCreep().userData.height;
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
  const creepViews = [0, 1, 2, 3, 0.5].map((quarter) =>
    Math.max(
      ...GEM_TYPES.map((type) => {
        const tower = createGemTower(type.id, { quality: tier });
        tower.updateMatrixWorld(true);
        return hidden(tower, Math.PI / 4 + (quarter * Math.PI) / 2, smallest)
          .length;
      }),
    ),
  );
  return {
    tier,
    name,
    worstHiddenNeighbours: Math.max(...views),
    creepTopHiddenIso: Math.max(...creepViews.slice(0, 4)),
    creepTopHiddenAxis: creepViews[4],
  };
});
console.table(occlusion);
// Budget: a tower may hide at most the one cell diagonally behind it; P2 must reveal that cell when it matters.
assert.ok(
  occlusion.every((o) => o.worstHiddenNeighbours <= 1),
  "Occlusion budget",
);
// Even the smallest creep shows its top over any single tower in the four default views.
assert.ok(
  occlusion.every(
    (o) => o.creepTopHiddenIso === 0 && o.creepTopHiddenAxis <= 1,
  ),
  "Creep visibility budget",
);
console.log(
  "PASS: 16 adjacency masks, merge bounds, deterministic variation, eight distinct towers at six tier bounds, tower-wall joins, creep scale, occlusion budgets and invalid inputs",
);
