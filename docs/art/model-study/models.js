import * as THREE from "three";

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

const cube = new THREE.BoxGeometry(1, 1, 1);
const stoneColors = ["#717877", "#818784", "#8b918c", "#969b94", "#a4a79d"].map(
  (color) => new THREE.Color(color),
);
const stoneMaterial = new THREE.MeshStandardMaterial({
  color: "#ffffff",
  roughness: 1,
  flatShading: true,
});
const noise = (x, y, z, seed) => {
  let n =
    Math.imul(x + 173, 374761393) ^
    Math.imul(y + 53, 668265263) ^
    Math.imul(z + 97, 1274126177) ^
    seed;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
};

/** Pure voxel layout: cardinal neighbours reach the shared cell edge; diagonals do not connect. */
export function stoneVoxels(x, z, neighbours = {}, seed = 1) {
  if (![x, z, seed].every(Number.isInteger))
    throw new TypeError("Stone coordinates and seed must be integers");
  const voxels = [];
  const shape = noise(x, 0, z, seed);
  const radiusX = 0.084 + (shape % 4) * 0.007;
  const radiusZ = 0.063 + ((shape >>> 2) % 4) * 0.007;
  for (let i = -5; i < 5; i++)
    for (let k = -5; k < 5; k++) {
      const px = (i + 0.5) * 0.1,
        pz = (k + 0.5) * 0.1;
      const core = (px * px) / radiusX + (pz * pz) / radiusZ < 1;
      const arm =
        (neighbours.east && px > 0 && Math.abs(pz) < 0.21) ||
        (neighbours.west && px < 0 && Math.abs(pz) < 0.21) ||
        (neighbours.north && pz < 0 && Math.abs(px) < 0.21) ||
        (neighbours.south && pz > 0 && Math.abs(px) < 0.21);
      if (!core && !arm) continue;
      const h = 2 + (noise(x * 10 + i, 0, z * 10 + k, seed) % 3);
      for (let j = 0; j < h; j++)
        voxels.push({
          x: px,
          y: (j + 0.5) * 0.05,
          z: pz,
          color: noise(x * 10 + i, j, z * 10 + k, seed) % stoneColors.length,
        });
    }
  return voxels;
}

/** progress 0 = separate stone, 1 = connected wall. Reuse the same seed when adjacency changes. */
export function createStone({ x = 0, z = 0, neighbours = {}, seed = 1 } = {}) {
  const group = new THREE.Group();
  const voxels = stoneVoxels(x, z, neighbours, seed);
  const mesh = new THREE.InstancedMesh(cube, stoneMaterial, voxels.length);
  // Each instance uses a vertex colour; one material keeps all voxels in one draw call.
  const matrix = new THREE.Matrix4();
  const scale = new THREE.Vector3(0.1, 0.05, 0.1);
  const rotation = new THREE.Quaternion();
  voxels.forEach((v, i) => mesh.setColorAt(i, stoneColors[v.color]));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  group.position.set(x, 0, z);
  group.userData.setMerge = (progress) => {
    const t = THREE.MathUtils.clamp(progress, 0, 1);
    const eased = t * t * (3 - 2 * t);
    voxels.forEach((v, i) => {
      const connected = Math.abs(v.x) > 0.3 || Math.abs(v.z) > 0.3;
      const amount = connected ? 0.64 + 0.36 * eased : 1;
      matrix.compose(
        new THREE.Vector3(
          v.x * amount,
          v.y * (connected ? 0.35 + 0.65 * eased : 1),
          v.z * amount,
        ),
        rotation,
        new THREE.Vector3(
          scale.x,
          scale.y * (connected ? 0.35 + 0.65 * eased : 1),
          scale.z,
        ),
      );
      mesh.setMatrixAt(i, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
  };
  group.userData.setMerge(1);
  return group;
}

/** Basic gem mockups. All geometry is local to one cell and uses shared stone geometry. */
export function createGemTower(type, { seed = 1 } = {}) {
  const spec = GEM_TYPES.find((g) => g.id === type);
  if (!spec) throw new RangeError(`Unknown gem type: ${type}`);
  const group = createStone({ seed });
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
    gem.position.set((i - (count - 1) / 2) * 0.17, 0.2, 0);
    gem.rotation.y = Math.PI / 4;
    gem.castShadow = true;
    gem.receiveShadow = true;
    group.add(gem);
  }
  group.name = spec.name;
  return group;
}
