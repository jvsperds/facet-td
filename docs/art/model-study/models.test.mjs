import assert from "node:assert/strict";
import { Box3, Color, Raycaster, Vector3 } from "three";
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
assert.notDeepEqual(
  geometry(7),
  geometry(8),
  "Seeds vary the masonry footing bevel",
);
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
    assert.ok(bounds.min.y >= -1e-7 && bounds.max.y <= 0.380001);
    assert.ok(bounds.min.x >= -0.500001 && bounds.max.x <= 0.500001);
    assert.ok(bounds.min.z >= -0.500001 && bounds.max.z <= 0.500001);
  }
  assert.equal(
    stone.children.length,
    1 + Object.values(neighbours).filter(Boolean).length,
    "One masonry pier plus one wall arm per neighbour",
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
// Bounds hold at rest and with the head aimed at any of eight compass points.
const aims = [
  [],
  ...Array.from({ length: 8 }, (_, i) => [
    3 * Math.cos((i * Math.PI) / 4),
    3 * Math.sin((i * Math.PI) / 4),
  ]),
];
for (const type of GEM_TYPES)
  for (const { tier, width } of QUALITY_TIERS) {
    const scale = width / 0.68;
    const tower = createGemTower(type.id, { quality: tier });
    const greys = ["#5f6466", "#686c6c", "#717473"].map((hex) =>
      new Color(hex).toArray(),
    );
    tower.children.at(-1).traverse((part) => {
      if (!part.isMesh || !part.userData.sharedMaterial) return;
      const colors = part.geometry.attributes.color;
      for (let i = 0; i < colors.count; i++) {
        const effective = [colors.getX(i), colors.getY(i), colors.getZ(i)].map(
          (v, k) => v * part.material.color.toArray()[k],
        );
        assert.ok(
          greys.some((tone) => {
            const shade = effective[0] / tone[0];
            return (
              shade >= 0.92999 &&
              shade <= 1.03001 &&
              effective.every((v, k) => Math.abs(v - tone[k] * shade) < 1e-6)
            );
          }),
          "Tower masonry uses the wall grey palette",
        );
      }
    });
    for (const aim of aims) {
      tower.userData.aimAt(...aim);
      tower.updateMatrixWorld(true);
      const bounds = new Box3().setFromObject(tower.children.at(-1), true);
      const label = `${type.name} tier ${tier} aim ${aim}`;
      const cap = 0.08 + 1.08 * scale; // Plinth stays seated at 0.08.
      assert.ok(bounds.max.y <= cap + 1e-6, `${label} height cap`);
      assert.ok(bounds.max.x - bounds.min.x <= width + 1e-6, `${label} width`);
      assert.ok(bounds.max.z - bounds.min.z <= width + 1e-6, `${label} depth`);
      assert.ok(bounds.max.y >= 0.5, `${label} rises well above its wall`);
    }
  }
// The head turns toward its target from any cell, and rests again without one.
for (const type of GEM_TYPES) {
  const tower = createGemTower(type.id, { x: 4, z: -2 });
  const head = tower.children.at(-1).children.at(-1);
  // Gem vertex centroid: on the shaft axis at rest, so only the lean moves it.
  const centre = () => {
    const sum = new Vector3();
    let count = 0;
    tower.updateMatrixWorld(true);
    head.traverse((object) => {
      if (!object.isMesh || object.userData.sharedMaterial) return;
      const position = object.geometry.attributes.position;
      for (let i = 0; i < position.count; i++, count++)
        sum.add(
          new Vector3()
            .fromBufferAttribute(position, i)
            .applyMatrix4(object.matrixWorld),
        );
    });
    return sum.divideScalar(count);
  };
  const rest = centre();
  for (const [dx, dz] of [
    [3, 0],
    [0, 3],
    [-2, -2],
  ]) {
    tower.userData.aimAt(4 + dx, -2 + dz);
    const shift = centre().sub(rest);
    assert.ok(
      shift.x * dx + shift.z * dz > 0.01 * Math.hypot(dx, dz),
      `${type.name} gem leans toward its target`,
    );
  }
  tower.userData.aimAt();
  assert.ok(centre().distanceTo(rest) < 1e-9, `${type.name} head rests`);
}
// Diamond quality steps add detail: face emblems, a course, eight claws, a course; huge only grows.
const diamondParts = QUALITY_TIERS.map(({ tier }) => {
  let meshes = 0;
  createGemTower("D", { quality: tier })
    .children.at(-1)
    .traverse((object) => (meshes += object.isMesh ? 1 : 0));
  return meshes;
});
assert.deepEqual(
  diamondParts.slice(1).map((parts, i) => parts > diamondParts[i]),
  [true, true, true, true, false],
  "Diamond tiers gain detail",
);
// Each redesigned tier gains one visible detail through perfect; huge only grows.
for (const type of GEM_TYPES.filter(({ id }) => id !== "D")) {
  const tierParts = QUALITY_TIERS.map(({ tier }) => {
    const model = createGemTower(type.id, { quality: tier });
    const tower = model.children.at(-1);
    const head = tower.children.at(-1);
    let meshes = 0;
    let triangles = 0;
    const materials = new Set();
    const rest = [];
    model.updateMatrixWorld(true);
    tower.traverse((object) => {
      if (!object.isMesh) return;
      meshes++;
      const p = object.geometry.attributes.position;
      triangles += (object.geometry.index?.count ?? p.count) / 3;
      materials.add(object.material);
      rest.push(object.matrixWorld.clone());
      assert.ok(object.castShadow && object.receiveShadow);
      const vertex = (i) => new Vector3().fromBufferAttribute(p, i);
      const index = object.geometry.index;
      for (let i = 0; i < (index?.count ?? p.count); i += 3) {
        const a = vertex(index ? index.getX(i) : i);
        const b = vertex(index ? index.getX(i + 1) : i + 1);
        const c = vertex(index ? index.getX(i + 2) : i + 2);
        assert.ok(
          b.sub(a).cross(c.sub(a)).lengthSq() > 1e-14,
          `${type.name} solid faces`,
        );
      }
    });
    assert.ok(meshes <= 32 && triangles <= 800 && materials.size <= 4);
    for (const aim of aims) {
      model.userData.aimAt(...aim);
      model.updateMatrixWorld(true);
      tower.traverse((object) => {
        if (!object.isMesh) return;
        const p = object.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const v = new Vector3()
            .fromBufferAttribute(p, i)
            .applyMatrix4(object.matrixWorld);
          assert.ok(
            1.2376 -
              (0.7071 * (Math.abs(v.x) + Math.abs(v.z))) / Math.SQRT2 -
              v.y >=
              0.01,
            `${type.name} tier ${tier} creep-visibility margin`,
          );
        }
      });
    }
    model.userData.aimAt();
    model.updateMatrixWorld(true);
    let i = 0;
    tower.traverse((object) => {
      if (object.isMesh)
        assert.deepEqual(
          object.matrixWorld,
          rest[i++],
          `${type.name} exact rest pose`,
        );
    });
    const gemBounds = new Box3();
    head.traverse((object) => {
      if (object.isMesh && !object.userData.sharedMaterial)
        gemBounds.expandByObject(object, true);
    });
    const size = gemBounds.getSize(new Vector3());
    const scale = QUALITY_TIERS[tier - 1].width / 0.68;
    assert.ok(size.x >= 0.35 * scale - 1e-6, `${type.name} gem width`);
    assert.ok(size.y >= 0.2 * scale - 1e-6, `${type.name} gem height`);
    return meshes;
  });
  assert.deepEqual(
    tierParts.slice(1).map((parts, i) => parts > tierParts[i]),
    [true, true, true, true, false],
    `${type.name} tiers gain detail`,
  );
}
// Emerald's grips stay outside the gem's convex faces, including the lower bevel.
const emeraldHead = createGemTower("G").children.at(-1).children.at(-1)
  .children[0].children[0];
const emeraldGem = emeraldHead.children.at(-1).geometry;
const gemPositions = emeraldGem.attributes.position;
const gemNormals = emeraldGem.attributes.normal;
for (const grip of emeraldHead.children.slice(1, 5)) {
  const positions = grip.geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const point = new Vector3().fromBufferAttribute(positions, i);
    let inside = true;
    for (let face = 0; face < gemPositions.count; face += 3) {
      const normal = new Vector3().fromBufferAttribute(gemNormals, face);
      const vertex = new Vector3().fromBufferAttribute(gemPositions, face);
      if (point.clone().sub(vertex).dot(normal) >= -1e-6) {
        inside = false;
        break;
      }
    }
    assert.ok(!inside, "Emerald grip vertices stay outside its gem");
  }
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
    createStone({ x: 3, z: 5, seed: 9, towerBase: true }).children[0].geometry
      .attributes.position.array,
  ),
  "Tower base matches its masonry pier",
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
// Walls one cell either side of a corridor protrude up to 0.22 (pier) or 0.31 (huge tower plinth).
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
// Each cell is checked with the head at rest and aimed at that cell, its worst lean.
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
      const blocked = (...aim) => {
        tower.userData.aimAt(...aim);
        tower.updateMatrixWorld(true);
        return ray
          .intersectObject(tower, true)
          .some((hit) => hit.distance < 49.99);
      };
      if (blocked() || blocked(x, z)) cells.push(`${x},${z}`);
    }
  return cells;
};
const smallest = createCreep().userData.height;
const occlusion = QUALITY_TIERS.map(({ tier, name }) => {
  const views = [0, 0.5, 1, 2, 3].map((quarter) =>
    Math.max(
      ...GEM_TYPES.map((type) => {
        const tower = createGemTower(type.id, { quality: tier });
        return hidden(tower, Math.PI / 4 + (quarter * Math.PI) / 2).length;
      }),
    ),
  );
  const creepViews = [0, 1, 2, 3, 0.5].map((quarter) =>
    Math.max(
      ...GEM_TYPES.map((type) => {
        const tower = createGemTower(type.id, { quality: tier });
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
  "PASS: 16 adjacency masks, merge bounds, deterministic variation, eight distinct towers at six tier bounds with aimed heads, head aim, all tower tier details, redesigned tower budgets and visibility margins, tower-wall joins, creep scale, occlusion budgets and invalid inputs",
);
