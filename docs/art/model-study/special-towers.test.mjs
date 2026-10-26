import assert from "node:assert/strict";
import { Box3, Raycaster, Vector3 } from "three";
import { createGemTower, SPECIAL_TOWERS, QUALITY_TIERS } from "./models.js";

const aims = [
  [],
  ...Array.from({ length: 8 }, (_, i) => [
    3 * Math.cos((i * Math.PI) / 4),
    3 * Math.sin((i * Math.PI) / 4),
  ]),
];
const report = [];
assert.equal(SPECIAL_TOWERS.length, 4);
assert.throws(() => createGemTower("gemtd_unknown"), RangeError);
assert.throws(() => createGemTower("D", { quality: null }), RangeError);
assert.equal(createGemTower("D").userData.quality.tier, 6);
for (const spec of SPECIAL_TOWERS) {
  const model = createGemTower(spec.id);
  assert.equal(model.name, spec.name);
  assert.equal(model.userData.quality.tier, spec.quality);
  const tower = model.children.at(-1);
  model.updateMatrixWorld(true);
  const rest = [];
  tower.traverse((part) => {
    if (part.isMesh) rest.push(part.matrixWorld.clone());
  });
  let triangles = 0,
    meshes = 0;
  const materials = new Set();
  tower.traverse((part) => {
    if (!part.isMesh) return;
    meshes++;
    materials.add(part.material);
    const p = part.geometry.attributes.position;
    const index = part.geometry.index;
    triangles += (index?.count ?? p.count) / 3;
    const vertex = (i) =>
      new Vector3().fromBufferAttribute(p, index ? index.getX(i) : i);
    for (let i = 0; i < (index?.count ?? p.count); i += 3) {
      const a = vertex(i),
        b = vertex(i + 1),
        c = vertex(i + 2);
      assert.ok(
        b.sub(a).cross(c.sub(a)).lengthSq() > 1e-14,
        `${spec.name}: nonzero solid faces`,
      );
    }
    assert.ok(part.castShadow && part.receiveShadow);
  });
  assert.ok(
    meshes <= 32 && triangles <= 800 && materials.size <= 4,
    `${spec.name}: budgets`,
  );
  let margin = Infinity;
  for (const { tier, width } of QUALITY_TIERS) {
    const candidate = createGemTower(spec.id, { quality: tier });
    const scale = width / 0.68;
    for (const aim of aims) {
      candidate.userData.aimAt(...aim);
      candidate.updateMatrixWorld(true);
      const structure = candidate.children.at(-1);
      const bounds = new Box3().setFromObject(structure, true);
      assert.ok(
        bounds.max.y <= 0.08 + 1.08 * scale + 1e-6 && bounds.max.y >= 0.5,
        `${spec.name}: height`,
      );
      const size = bounds.getSize(new Vector3());
      assert.ok(
        size.x <= width + 1e-6 && size.z <= width + 1e-6,
        `${spec.name}: footprint`,
      );
      structure.traverse((part) => {
        if (!part.isMesh) return;
        const p = part.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const v = new Vector3()
            .fromBufferAttribute(p, i)
            .applyMatrix4(part.matrixWorld);
          const clearance =
            1.2376 - 0.5 * (Math.abs(v.x) + Math.abs(v.z)) - v.y;
          margin = Math.min(margin, clearance);
          assert.ok(
            clearance >= 0.01,
            `${spec.name}: visibility margin ${clearance}`,
          );
        }
      });
    }
  }
  // An isolated tower never hides a small creep's top in the four game-camera directions.
  for (let turn = 0; turn < 4; turn++) {
    const a = Math.PI / 4 + (turn * Math.PI) / 2;
    const view = new Vector3(
      Math.sin(a),
      1 / Math.sqrt(2),
      Math.cos(a),
    ).normalize();
    for (let x = -1; x <= 1; x++)
      for (let z = -1; z <= 1; z++) {
        if (!x && !z) continue;
        for (const aim of [[], [x, z]]) {
          model.userData.aimAt(...aim);
          model.updateMatrixWorld(true);
          const point = new Vector3(x, 0.2376, z);
          const hits = new Raycaster(
            point.clone().addScaledVector(view, 50),
            view.clone().negate(),
          ).intersectObject(model, true);
          assert.ok(
            !hits.some((hit) => hit.distance < 49.99),
            `${spec.name}: visible creep top`,
          );
        }
      }
  }
  model.userData.aimAt();
  model.updateMatrixWorld(true);
  let restIndex = 0;
  tower.traverse((part) => {
    if (part.isMesh)
      assert.deepEqual(
        part.matrixWorld,
        rest[restIndex++],
        `${spec.name}: exact rest pose`,
      );
  });
  report.push({
    tower: spec.name,
    meshes,
    triangles,
    materials: materials.size,
    margin: margin.toFixed(3),
  });
}
for (const family of ["Silver", "Malachite"]) {
  const [base, upgrade] = report.filter(
    (r) => SPECIAL_TOWERS.find((s) => s.name === r.tower).family === family,
  );
  assert.ok(
    upgrade.meshes > base.meshes && upgrade.triangles > base.triangles,
    `${family}: upgrade gains visible details`,
  );
}
console.table(report);
console.log(
  "PASS: four canonical special variants, family progression, tier bounds, aimed visibility margins, solid faces, material/mesh/triangle budgets and creep-top visibility",
);
