import assert from "node:assert/strict";
import * as THREE from "three";
import { createModelBatch } from "./model-batch.js";
import {
  createGemTower,
  createStone,
  createCreep,
  GEM_TYPES,
  SPECIAL_TOWERS,
  QUALITY_TIERS,
} from "./models.js";

function surface(root) {
  const sum = Array(12).fill(0);
  let vertices = 0;
  const flags = new Map();
  const matrix = new THREE.Matrix4(),
    instance = new THREE.Matrix4();
  root.updateWorldMatrix(true, true);
  root.traverseVisible((mesh) => {
    if (!mesh.isMesh) return;
    const flag = `${mesh.castShadow}:${mesh.receiveShadow}:${mesh.material.type}:${mesh.material.transparent}:${mesh.material.opacity}`;
    const { position, normal, color } = mesh.geometry.attributes;
    for (let k = 0; k < (mesh.isInstancedMesh ? mesh.count : 1); k++) {
      matrix.copy(mesh.matrixWorld);
      if (mesh.isInstancedMesh) {
        mesh.getMatrixAt(k, instance);
        matrix.multiply(instance);
      }
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
      const index = mesh.geometry.index;
      const count = index?.count ?? position.count;
      vertices += count;
      flags.set(flag, (flags.get(flag) ?? 0) + count);
      for (let i = 0; i < count; i++) {
        const at = index ? index.getX(i) : i;
        const p = new THREE.Vector3()
          .fromBufferAttribute(position, at)
          .applyMatrix4(matrix);
        const n = new THREE.Vector3()
          .fromBufferAttribute(normal, at)
          .applyNormalMatrix(normalMatrix);
        const c = mesh.material.color.clone();
        if (mesh.material.vertexColors && color)
          c.multiply(new THREE.Color().fromBufferAttribute(color, at));
        [
          p.x,
          p.y,
          p.z,
          p.x * p.x,
          p.y * p.y,
          p.z * p.z,
          n.x,
          n.y,
          n.z,
          c.r,
          c.g,
          c.b,
        ].forEach((value, j) => (sum[j] += value));
      }
    }
  });
  return { vertices, sum, flags: [...flags].sort() };
}
function equivalent(source, batch) {
  const a = surface(source),
    b = surface(batch.group);
  assert.equal(a.vertices, b.vertices, "triangle count preserved");
  assert.deepEqual(a.flags, b.flags, "shadow and transparency flags preserved");
  a.sum.forEach((value, i) =>
    assert.ok(
      Math.abs(value - b.sum[i]) < 0.0001 * Math.max(1, Math.abs(value)),
      `surface component ${i}: ${value} vs ${b.sum[i]}`,
    ),
  );
}
for (const type of [...GEM_TYPES, ...SPECIAL_TOWERS])
  for (const { tier } of QUALITY_TIERS) {
    const source = new THREE.Group();
    const roots = [];
    const towers = [1, 7].map((seed, i) => {
      const tower = createGemTower(type.id, {
        x: i * 2,
        z: 1,
        seed,
        quality: tier,
        neighbours: { east: true, south: true },
      });
      source.add(tower);
      roots.push(
        tower.children.at(-1).children.at(-1),
        ...tower.children.slice(1, -1),
      );
      return tower;
    });
    const moving = createCreep({ modelScale: 1.6, flying: true });
    source.add(moving);
    roots.push(moving);
    const batch = createModelBatch(source, { dynamicRoots: roots });
    equivalent(source, batch);
    for (const [x, z] of [
      [6, 3],
      [-2, 4],
      [0, -5],
    ]) {
      towers.forEach((tower) => tower.userData.aimAt(x, z));
      moving.position.set(x, 0.2, z);
      moving.rotation.y = 0.7;
      batch.update([roots[0], roots[3], moving]);
      equivalent(source, batch);
    }
    towers.forEach((tower) => {
      tower.userData.aimAt();
      tower.userData.setMerge(0.35);
    });
    batch.update();
    equivalent(source, batch);
    let borrowedDisposed = false;
    source.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.geometry.addEventListener(
          "dispose",
          () => (borrowedDisposed = true),
        );
        mesh.material.addEventListener(
          "dispose",
          () => (borrowedDisposed = true),
        );
      }
    });
    batch.dispose();
    assert.equal(batch.group.children.length, 0);
    assert.equal(
      borrowedDisposed,
      false,
      "batch does not dispose borrowed source resources",
    );
  }
// Fresh factories must batch as effectively as clones, even with different material UUIDs.
const source = new THREE.Group();
const heads = [];
for (let i = 0; i < 16; i++) {
  const tower = createGemTower("B", { x: i, z: 0 });
  source.add(tower);
  heads.push(tower.children.at(-1).children.at(-1));
}
const batch = createModelBatch(source, { dynamicRoots: heads });
assert.ok(
  batch.group.children
    .filter((o) => o.isInstancedMesh)
    .some((o) => o.count === 16),
);
const staticMeshes = batch.group.children.filter((o) => !o.isInstancedMesh);
const staticVersions = staticMeshes.map(
  (o) => o.geometry.attributes.position.version,
);
const untouched = [];
source.children.slice(1).forEach((tower) =>
  tower.traverse((mesh) => {
    if (mesh.isMesh) {
      const update = mesh.updateWorldMatrix;
      mesh.updateWorldMatrix = function (...args) {
        untouched.push(mesh);
        return update.apply(this, args);
      };
    }
  }),
);
source.children[0].userData.aimAt(3, 8);
batch.update([heads[0]]);
assert.equal(untouched.length, 0, "selective update skips other towers");
assert.deepEqual(
  staticMeshes.map((o) => o.geometry.attributes.position.version),
  staticVersions,
  "static geometry is not uploaded again",
);
batch.dispose();
source.children[0].visible = false;
const hidden = createModelBatch(source, { dynamicRoots: heads });
equivalent(source, hidden);
hidden.dispose();
const stone = createStone({ neighbours: { east: true } }),
  stones = new THREE.Group();
stones.add(stone);
const joins = createModelBatch(stones, {
  dynamicRoots: stone.children.slice(1),
});
for (const t of [0, 0.5, 1]) {
  stone.userData.setMerge(t);
  joins.update();
  equivalent(stones, joins);
}
joins.dispose();
console.log(
  "PASS: batches preserve basic and special towers at six tiers, aims, colours/normals, joins, flying shadows, visibility, resource ownership and selective updates",
);
