import assert from "node:assert/strict";
import { Box3 } from "three";
import {
  stoneVoxels,
  createStone,
  createGemTower,
  GEM_TYPES,
} from "./models.js";

const a = stoneVoxels(0, 0, {}, 7);
assert.deepEqual(
  a,
  stoneVoxels(0, 0, {}, 7),
  "Stable variation for a fixed cell/seed",
);
assert.notDeepEqual(a, stoneVoxels(0, 0, {}, 8), "Seeds change the stone");
assert.notDeepEqual(
  a,
  stoneVoxels(1, 0, {}, 7),
  "Cells vary without a new seed",
);
assert.throws(() => stoneVoxels(0.5, 0), TypeError);
assert.throws(() => createGemTower("invalid"), RangeError);
const keys = new Set(a.map((v) => `${v.x},${v.y},${v.z}`));
assert.equal(keys.size, a.length, "No duplicate voxels");
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
for (const type of GEM_TYPES) {
  const tower = createGemTower(type.id);
  const bounds = new Box3().setFromObject(tower, true);
  assert.ok(bounds.max.y <= 0.650001, `${type.name} height cap`);
  assert.ok(bounds.max.x - bounds.min.x <= 0.680001, `${type.name} width cap`);
  assert.ok(bounds.max.z - bounds.min.z <= 0.680001, `${type.name} depth cap`);
  assert.ok(bounds.max.y >= 0.48, "Gem stands above the stone");
}
console.log(
  "PASS: 16 adjacency masks, merge bounds, deterministic variation, eight tower bounds and invalid inputs",
);
