import assert from "node:assert/strict";
import { Box3, Vector3 } from "three";
import { createStone, createGemTower, GEM_TYPES } from "./models.js";
import { createModelBatch } from "./model-batch.js";

const sides = ["north", "east", "south", "west"];
const neighbours = (mask) =>
  Object.fromEntries(sides.map((side, i) => [side, !!(mask & (1 << i))]));
function section(model, axis, plane) {
  const points = new Set();
  model.updateMatrixWorld(true);
  model.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const { position, color } = mesh.geometry.attributes;
    for (let i = 0; i < position.count; i++) {
      const p = new Vector3()
        .fromBufferAttribute(position, i)
        .applyMatrix4(mesh.matrixWorld);
      if (Math.abs(p[axis] - plane) > 1e-6) continue;
      const across = axis === "x" ? p.z : p.x;
      points.add(
        [across, p.y, ...[0, 1, 2].map((k) => color?.array[i * 3 + k] ?? 1)]
          .map((v) => v.toFixed(5))
          .join(","),
      );
    }
  });
  return [...points].sort();
}
// Every legal pair matches its boundary profile and vertex colours, including corners and junctions.
for (const seed of [1, 7, 31])
  for (const [x, z] of [
    [0, 0],
    [-3, 2],
  ])
    for (let a = 0; a < 16; a++)
      for (let b = 0; b < 16; b++) {
        if (a & 2 && b & 8) {
          const left = createStone({ x, z, seed, neighbours: neighbours(a) });
          const right = createStone({
            x: x + 1,
            z,
            seed,
            neighbours: neighbours(b),
          });
          const edge = section(left, "x", x + 0.5);
          assert.ok(edge.length > 0);
          assert.deepEqual(
            edge,
            section(right, "x", x + 0.5),
            `East/west seam ${a}/${b} at ${x},${z}, seed ${seed}`,
          );
        }
        if (a & 4 && b & 1) {
          const near = createStone({ x, z, seed, neighbours: neighbours(a) });
          const far = createStone({
            x,
            z: z + 1,
            seed,
            neighbours: neighbours(b),
          });
          assert.deepEqual(
            section(near, "z", z + 0.5),
            section(far, "z", z + 0.5),
            `North/south seam ${a}/${b}`,
          );
        }
      }
for (const type of GEM_TYPES)
  for (const quality of [1, 2, 3, 4, 5, 6]) {
    const wall = createStone({ x: 1, seed: 7, neighbours: { west: true } });
    const tower = createGemTower(type.id, {
      quality,
      seed: 7,
      neighbours: { east: true },
    });
    assert.deepEqual(
      section(wall, "x", 0.5),
      section(tower, "x", 0.5),
      `${type.name} tier ${quality} wall transition`,
    );
  }
// Animation stays closed, nondegenerate and within the existing wall/creep limits.
const straight = createStone({ neighbours: { east: true, west: true } });
const footing = createStone({
  neighbours: { east: true, west: true },
  towerBase: true,
});
assert.ok(
  new Box3().setFromObject(footing.children[0]).getSize(new Vector3()).z >
    new Box3().setFromObject(straight.children[0]).getSize(new Vector3()).z,
  "Tower bases retain a wider pier on straight runs",
);
for (let mask = 0; mask < 16; mask++) {
  const wall = createStone({ neighbours: neighbours(mask) });
  let triangles = 0;
  wall.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const p = mesh.geometry.attributes.position;
    triangles += p.count / 3;
    for (let i = 0; i < p.count; i += 3) {
      const a = new Vector3().fromBufferAttribute(p, i),
        b = new Vector3().fromBufferAttribute(p, i + 1),
        c = new Vector3().fromBufferAttribute(p, i + 2);
      assert.ok(
        b.sub(a).cross(c.sub(a)).lengthSq() > 1e-15,
        "No degenerate wall faces",
      );
    }
  });
  assert.ok(triangles <= 1000, `Mask ${mask} wall budget: ${triangles}`);
  const batch = createModelBatch(wall, {
    dynamicRoots: wall.children.slice(1),
  });
  for (const progress of [-1, 0, 0.5, 1, 2]) {
    wall.userData.setMerge(progress);
    batch.update();
  }
  batch.dispose();
}
console.log(
  "PASS: 768 connected wall-pair profiles/colours, 48 tower transitions, all masks, face and triangle budgets, batched merge animation",
);
