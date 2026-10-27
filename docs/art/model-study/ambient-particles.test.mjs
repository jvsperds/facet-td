import assert from "node:assert/strict";
import * as THREE from "three";
import { createGemTower } from "./models.js";
import { createTowerParticles } from "./ambient-particles.js";

const root = new THREE.Group();
const a = createGemTower("gemtd_huangcailanbaoshi");
const b = createGemTower("gemtd_jin");
root.add(a, b);
const fx = createTowerParticles([a, b]);
const geometry = fx.points.geometry;
assert.equal(geometry.drawRange.count, 16);
const first = geometry.attributes.position.array.slice();
fx.update(1);
assert.notDeepEqual(geometry.attributes.position.array, first);
assert.ok([...geometry.attributes.position.array].every(Number.isFinite));
assert.ok(
  [...geometry.attributes.alpha.array].every((v) => v >= 0 && v <= 0.65),
);
fx.update(0);
assert.deepEqual(
  geometry.attributes.position.array,
  first,
  "repeatable clock permits frozen reduced motion",
);
b.visible = false;
fx.update(0);
assert.equal(geometry.drawRange.count, 8);
const before = geometry.attributes.position.getX(0);
a.position.x = 4;
fx.update(0);
assert.ok(Math.abs(geometry.attributes.position.getX(0) - before - 4) < 1e-5);
root.visible = false;
fx.update(0);
assert.equal(geometry.drawRange.count, 0, "hidden ancestors suppress emitters");
fx.points.visible = false;
root.visible = true;
fx.update(0);
assert.equal(geometry.drawRange.count, 0);
let disposed = 0;
geometry.addEventListener("dispose", () => disposed++);
fx.points.material.addEventListener("dispose", () => disposed++);
fx.dispose();
assert.equal(disposed, 2);
root.traverse((mesh) => {
  if (mesh.isMesh) mesh.geometry.dispose();
});
console.log(
  "Ambient particles: motion, visibility, relocation, frozen clock and disposal passed.",
);
