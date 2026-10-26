import assert from "node:assert/strict";
import { Box3, Raycaster, Vector3 } from "three";
import {
  createStone,
  createGemTower,
  GEM_TYPES,
  SPECIAL_TOWERS,
} from "./models.js";
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
for (const type of [...GEM_TYPES, ...SPECIAL_TOWERS])
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
    const original = createGemTower(type.id, { quality, seed: 7 });
    const structure = (model) => {
      const parts = [];
      model.children.at(-1).traverse((part) => {
        if (part.isMesh)
          parts.push([
            ...part.geometry.attributes.position.array,
            ...part.matrix.elements,
          ]);
      });
      return parts;
    };
    assert.deepEqual(
      structure(tower),
      structure(original),
      "Joining preserves the original tower structure",
    );
    for (const [side, axis, sign] of [
      ["east", "x", 1],
      ["west", "x", -1],
      ["south", "z", 1],
      ["north", "z", -1],
    ]) {
      const joined = createGemTower(type.id, {
        quality,
        neighbours: { [side]: true },
      });
      joined.updateMatrixWorld(true);
      const shaft = joined.children.at(-1);
      const head = shaft.children.at(-1);
      const restBottom = new Box3().setFromObject(head).min.y;
      joined.userData.aimAt(3, 2);
      joined.updateMatrixWorld(true);
      const headBottom = Math.min(
        restBottom,
        new Box3().setFromObject(head).min.y,
      );
      joined.userData.aimAt();
      joined.updateMatrixWorld(true);
      const adjacent = createStone({
        x: axis === "x" ? sign : 0,
        z: axis === "z" ? sign : 0,
        neighbours: {
          [{ east: "west", west: "east", north: "south", south: "north" }[
            side
          ]]: true,
        },
      });
      assert.deepEqual(
        section(joined, axis, sign * 0.5),
        section(adjacent, axis, sign * 0.5),
        "All cardinal tower boundaries match raised walls",
      );
      const arm = joined.children[1].children[0];
      const vertices = arm.geometry.attributes.position;
      let cap = new Vector3(0, -Infinity, 0);
      for (let i = 0; i < arm.userData.merlons[0].start; i++) {
        const p = new Vector3().fromBufferAttribute(vertices, i);
        if (Math.abs(p[axis]) < 0.32 && p.y > cap.y) cap = p;
      }
      for (let i = 0; i < vertices.count; i += 3) {
        const a = new Vector3().fromBufferAttribute(vertices, i),
          b = new Vector3().fromBufferAttribute(vertices, i + 1),
          c = new Vector3().fromBufferAttribute(vertices, i + 2);
        assert.ok(
          b.sub(a).cross(c.sub(a)).lengthSq() > 1e-15,
          "Fitted wall faces remain nondegenerate",
        );
      }
      assert.ok(
        Math.abs(cap.y - ((headBottom - 0.025) * 0.122) / 0.196) < 1e-6,
        `${type.name} tier ${quality} ${side}: fitted coping remains beneath the gem head`,
      );
      const origin = cap.clone();
      origin[axis] = sign * 0.5;
      const direction = new Vector3();
      direction[axis] = -sign;
      const hit = new Raycaster(origin, direction).intersectObjects(
        shaft.children.filter((p) => p !== head),
        false,
      )[0];
      assert.ok(
        hit && Math.abs(sign * (hit.point[axis] - cap[axis]) - 0.002) < 1e-5,
        `${type.name} tier ${quality} ${side} joins the shaft surface`,
      );
      for (const { start, count } of arm.userData.merlons) {
        const bounds = new Box3();
        for (let i = start; i < start + count; i++)
          bounds.expandByPoint(new Vector3().fromBufferAttribute(vertices, i));
        const size = bounds.getSize(new Vector3());
        assert.ok(
          Math.abs(size[axis] - 0.14) < 1e-6 &&
            Math.abs(size[axis === "x" ? "z" : "x"] - 0.08) < 1e-6 &&
            Math.abs(size.y - (0.078 * 0.38) / 0.196) < 1e-6,
          "Tower approach merlons retain the same length, width and height as ordinary wall merlons",
        );
      }
    }
  }
// Animation stays closed, nondegenerate and within the existing wall/creep limits.
const straight = createStone({ neighbours: { east: true, west: true } });
for (const axis of ["x", "z"]) {
  const wall = createStone({
    neighbours:
      axis === "x" ? { east: true, west: true } : { north: true, south: true },
  });
  wall.updateMatrixWorld(true);
  for (const along of [-0.375, -0.125, 0.125, 0.375])
    for (const across of [-0.15, 0, 0.15]) {
      const origin = new Vector3(
        axis === "x" ? along : across,
        1,
        axis === "x" ? across : along,
      );
      const hit = new Raycaster(origin, new Vector3(0, -1, 0)).intersectObject(
        wall,
        true,
      )[0];
      assert.ok(hit);
      assert.ok(
        across === 0 ? hit.point.y < 0.25 : Math.abs(hit.point.y - 0.38) < 1e-6,
        "Merlons occupy both exterior edges and leave the centre walkway clear",
      );
    }
}
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
    for (const { start, count } of mesh.userData.merlons) {
      const block = new Box3();
      for (let i = start; i < start + count; i++)
        block.expandByPoint(new Vector3().fromBufferAttribute(p, i));
      const size = block.getSize(new Vector3());
      const footprint = [size.x, size.z].sort((a, b) => a - b);
      assert.ok(
        Math.abs(footprint[0] - 0.08) < 1e-6 &&
          Math.abs(footprint[1] - 0.14) < 1e-6 &&
          Math.abs(size.y - (0.078 * 0.38) / 0.196) < 1e-6,
        "Every wall and junction merlon has uniform dimensions",
      );
    }
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
  assert.ok(triangles <= 1080, `Mask ${mask} wall budget: ${triangles}`);
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
  `PASS: 768 wall profiles/colours, ${(GEM_TYPES.length + SPECIAL_TOWERS.length) * 6} tower transitions, ${(GEM_TYPES.length + SPECIAL_TOWERS.length) * 24} fitted cardinal shaft contacts and head clearances, preserved towers, all masks, face/budget checks and batched merge animation`,
);
