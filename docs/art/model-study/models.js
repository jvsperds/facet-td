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
  },
  { id: "Q", name: "Aquamarine", color: "#31b1bf", sides: 5, cluster: 2 },
  { id: "P", name: "Amethyst", color: "#9963d2", sides: 6, cluster: 3 },
];

const stoneMaterials = [
  "#717877",
  "#818784",
  "#8b918c",
  "#969b94",
  "#a4a79d",
].map(
  (color) =>
    new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true }),
);
const noise = (x, y, z, seed) => {
  let n =
    Math.imul(x + 173, 374761393) ^
    Math.imul(y + 53, 668265263) ^
    Math.imul(z + 97, 1274126177) ^
    seed;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
};

/** Broad irregular boulder, with cardinal ridges that meet the adjacent cell. */
export function createStone({ x = 0, z = 0, neighbours = {}, seed = 1 } = {}) {
  if (![x, z, seed].every(Number.isInteger))
    throw new TypeError("Stone coordinates and seed must be integers");
  const group = new THREE.Group();
  const points = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    const radius = 0.27 + (noise(x, i, z, seed) % 50) / 1000;
    const px = Math.cos(angle) * radius,
      pz = Math.sin(angle) * radius;
    points.push(
      new THREE.Vector3(px, 0, pz),
      new THREE.Vector3(
        px * 0.88,
        0.11 + (noise(x, i, z, seed + 1) % 50) / 1000,
        pz * 0.88,
      ),
    );
  }
  points.push(new THREE.Vector3(0.035, 0.2, -0.025));
  const material = stoneMaterials[noise(x, 0, z, seed) % stoneMaterials.length];
  const core = new THREE.Mesh(new ConvexGeometry(points), material);
  group.add(core);
  const arms = [];
  for (const [side, dx, dz] of [
    ["north", 0, -1],
    ["east", 1, 0],
    ["south", 0, 1],
    ["west", -1, 0],
  ]) {
    if (!neighbours[side]) continue;
    const ridge = [];
    // Matching edge cross-sections avoid cracks between neighbouring cell meshes.
    for (const length of [0, 0.5])
      for (const [width, height] of [
        [-0.18, 0],
        [0.18, 0],
        [-0.16, 0.11],
        [0.16, 0.11],
        [0, 0.18],
      ]) {
        ridge.push(
          new THREE.Vector3(
            dx * length + dz * width,
            height,
            dz * length - dx * width,
          ),
        );
      }
    const arm = new THREE.Mesh(new ConvexGeometry(ridge), material);
    group.add(arm);
    arms.push({ arm, dx });
  }
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

/** Tapered masonry tower with a gem mounted on its crown. */
export function createGemTower(type, { seed = 1 } = {}) {
  const spec = GEM_TYPES.find((g) => g.id === type);
  if (!spec) throw new RangeError(`Unknown gem type: ${type}`);
  const group = createStone({ seed });
  const shaftMaterial = stoneMaterials[2];
  const trimMaterial = stoneMaterials[4];
  const masonry = (bottom, top, height, y, material, sides = 8) => {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(top, bottom, height, sides),
      material,
    );
    mesh.position.y = y;
    mesh.rotation.y = Math.PI / 8;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.sharedMaterial = true;
    group.add(mesh);
    return mesh;
  };
  masonry(0.31, 0.28, 0.12, 0.14, trimMaterial);
  masonry(0.24, 0.18, 0.47, 0.425, shaftMaterial);
  masonry(0.225, 0.21, 0.055, 0.34, trimMaterial);
  masonry(0.19, 0.27, 0.11, 0.7, trimMaterial);
  masonry(0.27, 0.27, 0.06, 0.785, shaftMaterial);
  // Four stone prongs make the crown read as a tower even when the gem is squat.
  for (let i = 0; i < 4; i++) {
    const prong = masonry(0.055, 0.045, 0.14, 0.85, trimMaterial, 4);
    prong.position.x = Math.cos((i * Math.PI) / 2) * 0.205;
    prong.position.z = Math.sin((i * Math.PI) / 2) * 0.205;
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
    gem.position.set((i - (count - 1) / 2) * 0.145, 0.815, 0);
    gem.rotation.y = Math.PI / 4;
    gem.castShadow = true;
    gem.receiveShadow = true;
    group.add(gem);
  }
  group.name = spec.name;
  return group;
}
