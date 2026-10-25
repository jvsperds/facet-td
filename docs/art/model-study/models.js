import * as THREE from "three";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";

export const GEM_TYPES = [
  {
    id: "D",
    name: "Diamond",
    color: "#dceef2",
    sides: 4,
    profile: [
      [0, 0],
      [0.24, 0.16],
      [0.17, 0.31],
      [0, 0.43],
    ],
    tower: {
      shape: "obelisk",
      profile: [
        [0, 0.2],
        [0.21, 0.2],
        [0.09, 0.78],
        [0, 0.78],
      ],
    },
  },
  {
    id: "B",
    name: "Sapphire",
    color: "#386bd6",
    sides: 6,
    profile: [
      [0, 0],
      [0.18, 0.05],
      [0.18, 0.32],
      [0, 0.43],
    ],
    tower: {
      shape: "column",
      profile: [
        [0, 0.2],
        [0.16, 0.2],
        [0.16, 0.66],
        [0.21, 0.68],
        [0.21, 0.78],
        [0, 0.78],
      ],
    },
  },
  {
    id: "Y",
    name: "Topaz",
    color: "#edb837",
    sides: 3,
    profile: [
      [0, 0],
      [0.24, 0.06],
      [0.17, 0.28],
      [0, 0.43],
    ],
    tower: {
      shape: "waist",
      profile: [
        [0, 0.2],
        [0.21, 0.2],
        [0.09, 0.48],
        [0.22, 0.76],
        [0, 0.76],
      ],
      prongs: 3,
    },
  },
  {
    id: "R",
    name: "Ruby",
    color: "#ce4059",
    sides: 8,
    profile: [
      [0, 0],
      [0.24, 0.09],
      [0.24, 0.24],
      [0.14, 0.33],
      [0, 0.33],
    ],
    tower: {
      shape: "keep",
      profile: [
        [0, 0.2],
        [0.17, 0.2],
        [0.17, 0.58],
        [0.27, 0.66],
        [0.27, 0.74],
        [0, 0.74],
      ],
      prongs: 8,
    },
  },
  {
    id: "G",
    name: "Emerald",
    color: "#23956d",
    sides: 4,
    profile: [
      [0, 0],
      [0.16, 0.04],
      [0.16, 0.35],
      [0.11, 0.43],
      [0, 0.43],
    ],
    tower: {
      shape: "spire",
      profile: [
        [0, 0.2],
        [0.13, 0.2],
        [0.13, 0.8],
        [0, 0.8],
      ],
      prongs: 4,
    },
  },
  {
    id: "E",
    name: "Opal",
    color: "#c86daf",
    sides: 8,
    profile: [
      [0, 0],
      [0.26, 0.1],
      [0.23, 0.21],
      [0, 0.29],
    ],
    tower: {
      shape: "cup",
      profile: [
        [0, 0.2],
        [0.21, 0.2],
        [0.11, 0.34],
        [0.11, 0.52],
        [0.26, 0.7],
        [0, 0.7],
      ],
    },
  },
  {
    id: "Q",
    name: "Aquamarine",
    color: "#31b1bf",
    sides: 5,
    cluster: 2,
    tower: {
      shape: "stepped",
      profile: [
        [0, 0.2],
        [0.25, 0.2],
        [0.25, 0.36],
        [0.19, 0.36],
        [0.19, 0.54],
        [0.13, 0.54],
        [0.13, 0.76],
        [0, 0.76],
      ],
    },
  },
  {
    id: "P",
    name: "Amethyst",
    color: "#9963d2",
    sides: 6,
    cluster: 3,
    tower: {
      shape: "drum",
      profile: [
        [0, 0.2],
        [0.26, 0.2],
        [0.23, 0.5],
        [0.27, 0.56],
        [0.27, 0.62],
        [0, 0.62],
      ],
    },
  },
];

const flat = (color) =>
  new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true });
// Dark rock against the light slate floor, so the maze reads at overview zoom.
const stoneMaterials = [
  "#565b5e",
  "#5f6466",
  "#686c6c",
  "#717473",
  "#7a7c78",
].map(flat);
const masonryMaterials = ["#8b918c", "#a4a79d"].map(flat);
const noise = (x, y, z, seed) => {
  let n =
    Math.imul(x + 173, 374761393) ^
    Math.imul(y + 53, 668265263) ^
    Math.imul(z + 97, 1274126177) ^
    seed;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
};
// Every arm ends in this cross-section, so neighbouring cells meet without cracks.
const RIDGE_SECTION = [
  [-0.19, 0],
  [0.19, 0],
  [-0.1, 0.07],
  [0.1, 0.07],
  [0, 0.09],
];

/** Craggy rock; cardinal neighbours extend it into one continuous jagged ridge. */
export function createStone({ x = 0, z = 0, neighbours = {}, seed = 1 } = {}) {
  if (![x, z, seed].every(Number.isInteger))
    throw new TypeError("Stone coordinates and seed must be integers");
  const rand = (i, k) => (noise(x, i, z, seed + k) % 1000) / 1000;
  const group = new THREE.Group();
  const points = [];
  for (let i = 0; i < 7; i++) {
    const angle = (i * 2 * Math.PI) / 7 + rand(i, 2) * 0.4;
    const radius = 0.2 + rand(i, 0) * 0.07;
    const px = Math.cos(angle) * radius,
      pz = Math.sin(angle) * radius;
    points.push(
      new THREE.Vector3(px, 0, pz),
      new THREE.Vector3(px * 0.6, 0.08 + rand(i, 1) * 0.05, pz * 0.6),
    );
  }
  points.push(
    new THREE.Vector3(
      (rand(0, 3) - 0.5) * 0.1,
      0.17 + rand(0, 4) * 0.03,
      (rand(1, 3) - 0.5) * 0.1,
    ),
  );
  const material = stoneMaterials[noise(x, 0, z, seed) % stoneMaterials.length];
  group.add(new THREE.Mesh(new ConvexGeometry(points), material));
  const arms = [];
  [
    ["north", 0, -1],
    ["east", 1, 0],
    ["south", 0, 1],
    ["west", -1, 0],
  ].forEach(([side, dx, dz], s) => {
    if (!neighbours[side]) return;
    const toCell = (along, across, height) =>
      new THREE.Vector3(
        dx * along + dz * across,
        height,
        dz * along - dx * across,
      );
    const arm = new THREE.Group();
    const ridge = [];
    for (const along of [0, 0.5])
      for (const [across, height] of RIDGE_SECTION)
        ridge.push(toCell(along, across, height));
    arm.add(new THREE.Mesh(new ConvexGeometry(ridge), material));
    // Big leaning crags set the jagged crest; they stay inside this cell.
    for (const [k, along] of [0.13, 0.28, 0.41].entries()) {
      const r = (j) => rand(10 + s * 4 + k, j);
      const half = Math.min(0.08 + r(0) * 0.06, 0.5 - along);
      const across = 0.13 + r(4) * 0.05;
      arm.add(
        new THREE.Mesh(
          new ConvexGeometry([
            toCell(along - half, -across, 0),
            toCell(along - half, across, 0),
            toCell(along + half, -across, 0),
            toCell(along + half, across, 0),
            toCell(along - half * 0.5, (r(5) - 0.5) * 0.12, 0.08),
            toCell(
              along + (r(1) - 0.5) * 0.1,
              (r(2) - 0.5) * 0.1,
              0.13 + r(3) * 0.07,
            ),
          ]),
          material,
        ),
      );
    }
    group.add(arm);
    arms.push({ arm, dx });
  });
  group.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = true;
      object.receiveShadow = true;
      object.userData.sharedMaterial = true;
    }
  });
  group.position.set(x, 0, z);
  group.userData.setMerge = (progress) => {
    const t = THREE.MathUtils.clamp(progress, 0, 1);
    const eased = t * t * (3 - 2 * t);
    for (const { arm, dx } of arms)
      arm.scale.set(
        dx ? 0.45 + 0.55 * eased : 1,
        0.65 + 0.35 * eased,
        dx ? 1 : 0.45 + 0.55 * eased,
      );
  };
  group.userData.setMerge(1);
  return group;
}

export const QUALITY_TIERS = [
  { tier: 1, name: "Chipped", width: 0.38 },
  { tier: 2, name: "Flawed", width: 0.44 },
  { tier: 3, name: "Normal", width: 0.5 },
  { tier: 4, name: "Flawless", width: 0.56 },
  { tier: 5, name: "Perfect", width: 0.62 },
  { tier: 6, name: "Huge", width: 0.68 },
];

/**
 * Masonry tower on its cell's stone: the base joins neighbouring walls and shares their variation.
 * Quality scales the tower above the base; the base stays wall-sized so joins meet the cell edge.
 */
export function createGemTower(
  type,
  { x = 0, z = 0, neighbours = {}, seed = 1, quality = 6 } = {},
) {
  const spec = GEM_TYPES.find((g) => g.id === type);
  if (!spec) throw new RangeError(`Unknown gem type: ${type}`);
  const tier = QUALITY_TIERS.find((q) => q.tier === quality);
  if (!tier) throw new RangeError(`Unknown quality tier: ${quality}`);
  const stoneMesh = (geometry, material) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.sharedMaterial = true;
    tower.add(mesh);
    return mesh;
  };
  const model = createStone({ x, z, neighbours, seed });
  const tower = new THREE.Group();
  const plinth = stoneMesh(
    new THREE.CylinderGeometry(0.28, 0.31, 0.12, 8),
    model.children[0].material,
  );
  plinth.position.y = 0.14;
  plinth.rotation.y = Math.PI / 8;
  // The shaft shares its gem's facet count and owns the silhouette, so type reads without colour.
  const { profile: shaft, prongs = 0 } = spec.tower;
  stoneMesh(
    new THREE.LatheGeometry(
      shaft.map(([r, h]) => new THREE.Vector2(r, h)),
      spec.sides,
      Math.PI / spec.sides,
    ),
    masonryMaterials[0],
  );
  const [crownRadius, crown] = shaft.at(-2);
  for (let i = 0; i < prongs; i++) {
    const prong = stoneMesh(
      new THREE.CylinderGeometry(0.04, 0.05, 0.12, 4),
      masonryMaterials[1],
    );
    const a = (i * 2 * Math.PI) / prongs;
    prong.position.set(
      Math.cos(a) * (crownRadius - 0.04),
      crown + 0.05,
      Math.sin(a) * (crownRadius - 0.04),
    );
  }
  const material = new THREE.MeshStandardMaterial({
    color: spec.color,
    roughness: 0.48,
    metalness: 0,
    flatShading: true,
  });
  const count = spec.cluster || 1;
  for (let i = 0; i < count; i++) {
    const profile = spec.profile || [
      [0, 0],
      [0.105, 0.04],
      [0.105, i === 1 ? 0.32 : 0.22],
      [0, i === 1 ? 0.43 : 0.33],
    ];
    const geometry = new THREE.LatheGeometry(
      profile.map(([r, h]) => new THREE.Vector2(r, h)),
      spec.sides,
    ).toNonIndexed();
    geometry.computeVertexNormals();
    const gem = new THREE.Mesh(geometry, material);
    gem.scale.set(0.85, 0.8, 0.85);
    gem.position.set((i - (count - 1) / 2) * 0.145, crown, 0);
    gem.rotation.y = Math.PI / 4;
    gem.castShadow = true;
    gem.receiveShadow = true;
    tower.add(gem);
  }
  const scale = tier.width / 0.68;
  tower.scale.setScalar(scale);
  tower.position.y = 0.08 * (1 - scale); // Keep the plinth seated on the stone.
  model.add(tower);
  model.name = spec.name;
  model.userData.quality = tier;
  return model;
}

const creepBody = flat("#ddd3c2");
const creepTrim = flat("#2f3438");
const creepShadow = new THREE.MeshBasicMaterial({
  color: "#1d2024",
  transparent: true,
  opacity: 0.3,
  depthWrite: false,
});
export const FLY_ALTITUDE = 1.35;

/**
 * Creep body length in cells, proportional to VPK ModelScale so the original's size ratios hold:
 * 0.36 for wave 1, 0.79 at the late-wave 2.2, 1.8 for a 5.0 boss.
 */
export const creepSize = (modelScale) => 0.36 * modelScale;

/** Boxy placeholder creep facing +x: light body, dark trim. It fixes scale and readability, not designs. */
export function createCreep({
  modelScale = 1,
  flying = false,
  boss = false,
} = {}) {
  if (!(modelScale > 0 && Number.isFinite(modelScale)))
    throw new RangeError("Creep ModelScale must be a positive number");
  const length = creepSize(modelScale),
    width = 0.7 * length,
    height = 0.66 * length;
  const group = new THREE.Group();
  const body = new THREE.Group();
  const box = (w, h, d, material, x, y, z = 0, parent = body) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.userData.sharedMaterial = true;
    parent.add(mesh);
    return mesh;
  };
  const legs = flying ? 0 : 0.3 * height;
  box(
    0.72 * length,
    0.5 * height,
    width,
    creepBody,
    -0.1 * length,
    legs + 0.25 * height,
  );
  box(
    0.74 * length,
    0.08 * height,
    1.04 * width,
    creepTrim,
    -0.1 * length,
    legs + 0.04 * height,
  );
  // Head and dark visor show the walking direction.
  box(
    0.32 * length,
    0.42 * height,
    0.62 * width,
    creepBody,
    0.33 * length,
    legs + 0.5 * height,
  );
  box(
    0.06 * length,
    0.12 * height,
    0.5 * width,
    creepTrim,
    0.5 * length,
    legs + 0.56 * height,
  );
  if (!flying)
    for (const lx of [-0.32, 0.12])
      for (const side of [-1, 1])
        box(
          0.12 * length,
          legs,
          0.14 * width,
          creepTrim,
          lx * length,
          legs / 2,
          side * 0.32 * width,
        );
  if (boss)
    for (const side of [-1, 1]) {
      box(
        0.3 * length,
        0.22 * height,
        0.24 * width,
        creepTrim,
        -0.15 * length,
        legs + 0.6 * height,
        side * 0.42 * width,
      );
      box(
        0.12 * length,
        0.25 * height,
        0.12 * width,
        creepBody,
        -0.15 * length,
        legs + 0.83 * height,
        side * 0.42 * width,
      );
    }
  if (flying) {
    for (const side of [-1, 1])
      box(
        0.4 * length,
        0.04 * height,
        0.5 * length,
        creepTrim,
        -0.1 * length,
        0.4 * height,
        side * (width / 2 + 0.25 * length),
      );
    body.position.y = FLY_ALTITUDE;
    // Air units float off the grid in isometric view; the shadow marks their cell.
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.45 * length, 12),
      creepShadow,
    );
    shadow.userData.sharedMaterial = true;
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    group.add(shadow);
  }
  group.add(body);
  const top = new THREE.Box3().setFromObject(body).max.y;
  // The HUD anchors health bars here: just above the body, whatever the size.
  group.userData = { length, height, flying, boss, healthBarY: top + 0.15 };
  return group;
}
