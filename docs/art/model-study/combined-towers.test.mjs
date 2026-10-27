import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Box3, Raycaster, Vector3 } from "three";
import { createGemTower, QUALITY_TIERS, SPECIAL_TOWERS } from "./models.js";
import { COMBINED_TOWERS, COMBINED_FAMILIES } from "./combined-towers.js";

const baseline = JSON.parse(
  readFileSync(new URL("./combined-source.json", import.meta.url), "utf8"),
);
const expected = baseline.recipeIds
  .filter((id) => !SPECIAL_TOWERS.some((tower) => tower.id === id))
  .sort();
assert.equal(COMBINED_TOWERS.length, 34);
assert.equal(new Set(COMBINED_TOWERS.map((tower) => tower.id)).size, 34);
assert.deepEqual(COMBINED_TOWERS.map((tower) => tower.id).sort(), expected);
assert.equal(COMBINED_FAMILIES.length, 12);
assert.equal(new Set(COMBINED_FAMILIES).size, 12);
assert.deepEqual(
  [...new Set(COMBINED_TOWERS.map((tower) => tower.family))].sort(),
  [...COMBINED_FAMILIES].sort(),
);

const aims = [
  [],
  ...Array.from({ length: 8 }, (_, i) => [
    3 * Math.cos((i * Math.PI) / 4),
    3 * Math.sin((i * Math.PI) / 4),
  ]),
];
const failures = [];
const report = [];
function dispose(model) {
  const geometries = new Set(),
    materials = new Set();
  model.traverse((part) => {
    if (!part.isMesh) return;
    geometries.add(part.geometry);
    if (!part.userData.sharedMaterial)
      for (const material of Array.isArray(part.material)
        ? part.material
        : [part.material])
        materials.add(material);
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}
for (const spec of COMBINED_TOWERS) {
  assert.ok(
    spec.name &&
      spec.family &&
      spec.effect &&
      spec.design &&
      spec.sourceDescription,
    `${spec.id}: source role metadata`,
  );
  assert.ok(
    Array.isArray(spec.abilities) &&
      (spec.abilities.length || spec.id === "gemtd_tianranzumulv") &&
      spec.abilities.every((id) => typeof id === "string" && id.length),
    `${spec.id}: source abilities`,
  );
  // Natural Zumurud has empty unit slots; its three-ability theft is specified by the source help text.
  if (spec.id === "gemtd_tianranzumulv")
    assert.match(spec.sourceDescription, /steal 3 abilities/);
  assert.ok(
    QUALITY_TIERS.some(({ tier }) => tier === spec.quality),
    `${spec.id}: default quality`,
  );
  const defaultModel = createGemTower(spec.id);
  assert.equal(defaultModel.name, spec.name);
  assert.equal(defaultModel.userData.quality.tier, spec.quality);
  dispose(defaultModel);
  let budget;
  let margin = Infinity;
  for (const { tier, width } of QUALITY_TIERS) {
    const model = createGemTower(spec.id, { quality: tier });
    const tower = model.children.at(-1);
    model.updateMatrixWorld(true);
    const rest = [];
    let triangles = 0,
      meshes = 0;
    const materials = new Set();
    tower.traverse((part) => {
      if (!part.isMesh) return;
      rest.push(part.matrixWorld.clone());
      meshes++;
      for (const material of Array.isArray(part.material)
        ? part.material
        : [part.material])
        materials.add(material);
      const p = part.geometry.attributes.position,
        index = part.geometry.index;
      assert.ok(
        p && p.count > 0,
        `${spec.name} tier ${tier}: nonempty geometry`,
      );
      const count = index?.count ?? p.count;
      assert.ok(
        count > 0 && count % 3 === 0,
        `${spec.name} tier ${tier}: complete triangles`,
      );
      triangles += count / 3;
      const vertex = (i) =>
        new Vector3().fromBufferAttribute(p, index ? index.getX(i) : i);
      for (let i = 0; i < count; i += 3) {
        const a = vertex(i),
          b = vertex(i + 1),
          c = vertex(i + 2);
        assert.ok(
          [...a, ...b, ...c].every(Number.isFinite),
          `${spec.name} tier ${tier}: finite vertices`,
        );
        assert.ok(
          b.sub(a).cross(c.sub(a)).lengthSq() > 1e-14,
          `${spec.name} tier ${tier}: nondegenerate triangles`,
        );
      }
      assert.ok(
        part.castShadow && part.receiveShadow,
        `${spec.name}: shadow flags`,
      );
    });
    assert.ok(
      meshes && triangles && materials.size,
      `${spec.name}: nonempty superstructure`,
    );
    if (tier === 6)
      budget = {
        tower: spec.name,
        meshes,
        triangles,
        materials: materials.size,
      };
    for (const aim of aims) {
      model.userData.aimAt(...aim);
      model.updateMatrixWorld(true);
      const bounds = new Box3().setFromObject(tower, true),
        size = bounds.getSize(new Vector3());
      assert.ok(
        bounds.max.y <= 0.08 + (1.08 * width) / 0.68 + 1e-6 &&
          bounds.max.y >= 0.5,
        `${spec.name} tier ${tier}: height ${bounds.max.y}`,
      );
      assert.ok(
        size.x <= width + 1e-6 && size.z <= width + 1e-6,
        `${spec.name} tier ${tier}: footprint ${size.x}, ${size.z}`,
      );
      tower.traverse((part) => {
        if (!part.isMesh) return;
        const p = part.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const v = new Vector3()
            .fromBufferAttribute(p, i)
            .applyMatrix4(part.matrixWorld);
          const clearance =
            1.2376 - 0.5 * (Math.abs(v.x) + Math.abs(v.z)) - v.y;
          margin = Math.min(margin, clearance);
        }
      });
    }
    model.userData.aimAt();
    model.updateMatrixWorld(true);
    let i = 0;
    tower.traverse((part) => {
      if (part.isMesh)
        assert.deepEqual(
          part.matrixWorld,
          rest[i++],
          `${spec.name} tier ${tier}: aim reset`,
        );
    });
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
              `${spec.name} tier ${tier}: smallest creep top remains visible`,
            );
          }
        }
    }
    dispose(model);
  }
  report.push({ ...budget, margin: margin.toFixed(3) });
  if (margin < 0.01)
    failures.push({ tower: spec.name, visibilityMargin: margin });
  if (budget.triangles > 800 || budget.meshes > 32 || budget.materials > 4)
    failures.push(budget);
}
console.table(report);
assert.deepEqual(
  failures,
  [],
  `Tier 6 budgets exceeded: ${JSON.stringify(failures)}`,
);
console.log(
  "PASS: 34 baseline combined towers, roles, qualities, geometry, tier bounds, visibility, aim resets and budgets",
);
