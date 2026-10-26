import * as THREE from "three";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";

export const GEM_TYPES = [
  {
    id: "D",
    name: "Diamond",
    color: "#dceef2",
    // Square masonry, not a lathe: [half-width, height] from footing to collar.
    tower: {
      shape: "setting",
      profile: [
        [0.225, 0.2],
        [0.19, 0.245],
        [0.118, 0.7],
        [0.195, 0.765],
      ],
    },
  },
  {
    id: "B",
    name: "Sapphire",
    color: "#386bd6",
    sides: 6,
    profile: [
      [0.125, 0.785],
      [0.21, 0.835],
      [0.21, 0.99],
      [0, 1.105],
    ],
    tower: {
      shape: "column",
      profile: [
        [0, 0.2],
        [0.23, 0.2],
        [0.155, 0.28],
        [0.145, 0.64],
        [0.235, 0.71],
        [0.235, 0.745],
        [0.215, 0.765],
        [0, 0.765],
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

// Masonry takes per-face shades from vertex colours, so stacked courses read as cut blocks.
const carvedMaterials = ["#8b918c", "#a4a79d", "#4f565a"].map(
  (color) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness: 1,
      flatShading: true,
      vertexColors: true,
    }),
);
const paint = (geometry, colorOf) => {
  const normals = geometry.attributes.normal;
  const colors = [];
  for (let i = 0; i < normals.count; i++)
    colors.push(
      ...colorOf(new THREE.Vector3().fromBufferAttribute(normals, i)),
    );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
};
const stoneShade = (key) => (n) => {
  const v =
    0.93 +
    (noise(Math.round(n.x * 8), Math.round(n.y * 8), Math.round(n.z * 8), key) %
      11) /
      100;
  return [v, v, v];
};
// Square with bevelled corners in plan at height y.
const squareRing = (half, y) => {
  const c = half * 0.8;
  return [
    [half, c],
    [c, half],
    [-c, half],
    [-half, c],
    [-half, -c],
    [-c, -half],
    [c, -half],
    [half, -c],
  ].map(([px, pz]) => new THREE.Vector3(px, y, pz));
};

/**
 * Diamond: a coursed square tower; a stone corbel and dark claw setting hold a large brilliant-cut stone.
 * Each step up in quality adds one detail: face emblems (2), a third course (3), eight claws (4), a fourth course (5).
 */
function buildDiamond(
  add,
  place,
  head,
  quality,
  { color, tower: { profile } },
) {
  const block = (rings, material, key) =>
    add(
      paint(
        new ConvexGeometry(rings.flatMap(([half, y]) => squareRing(half, y))),
        stoneShade(key),
      ),
      material,
    );
  const [
    [footHalf, ground],
    [baseHalf, base],
    [neckHalf, neck],
    [collarHalf, collar],
  ] = profile;
  const halfAt = (y) =>
    baseHalf + ((neckHalf - baseHalf) * (y - base)) / (neck - base);
  // Stacked courses with bevelled tops; the first one splays into a battered foot.
  const courses = 2 + Math.floor((quality - 1) / 2);
  const course = (neck - ground) / courses;
  for (let k = 0; k < courses; k++) {
    const y0 = ground + course * k,
      y1 = y0 + course;
    block(
      [
        ...(k
          ? [[halfAt(y0), y0]]
          : [
              [footHalf, ground],
              [baseHalf, base],
            ]),
        [halfAt(y1 - 0.014), y1 - 0.014],
        [halfAt(y1) - 0.012, y1],
      ],
      carvedMaterials[0],
      2 + k,
    );
  }
  block(
    [
      [neckHalf, neck],
      [collarHalf, collar],
      [collarHalf, collar + 0.02],
    ],
    carvedMaterials[1],
    9,
  );
  block(
    [
      [collarHalf - 0.02, collar + 0.02],
      [collarHalf - 0.02, collar + 0.05],
      [collarHalf - 0.035, collar + 0.06],
    ],
    carvedMaterials[1],
    10,
  );
  const radial = (a, r, y, t) =>
    new THREE.Vector3(
      Math.cos(a) * r - Math.sin(a) * t,
      y,
      Math.sin(a) * r + Math.cos(a) * t,
    );
  // Claws and stone turn and lean as one head, pivoting on the setting band.
  const pivot = collar + 0.06;
  const lean = new THREE.Group();
  head.position.y = pivot;
  head.add(lean);
  const claws = quality >= 4 ? 8 : 4;
  for (let i = 0; i < claws; i++) {
    const a = (i * 2 * Math.PI) / claws;
    const section = (r0, r1, y, w) =>
      [r0, r1].flatMap((r) => [-w, w].map((t) => radial(a, r, y, t)));
    const grip = section(0.235, 0.275, 0.965, 0.032);
    for (const points of [
      [...section(0.13, 0.2, collar + 0.02, 0.05), ...grip],
      [...grip, ...section(0.2, 0.23, 1.02, 0.018)],
    ])
      add(
        paint(new ConvexGeometry(points), stoneShade(20 + i)),
        carvedMaterials[2],
        lean,
      ).position.y = -pivot;
  }
  // Facet tones, not reflections: bright table, alternating crown facets, deeper pavilion.
  const ice = new THREE.Color(color);
  const tone = (mix) =>
    ice
      .clone()
      .lerp(new THREE.Color(mix < 0 ? "#ffffff" : "#6fa3b8"), Math.abs(mix))
      .toArray();
  const facet = (n) => {
    if (n.y > 0.99) return tone(-0.6);
    if (n.y > 0.05)
      return tone(
        Math.round(Math.atan2(n.z, n.x) / (Math.PI / 8)) & 1 ? 0.45 : -0.3,
      );
    return tone(n.y > -0.05 ? 0.3 : 0.7);
  };
  const material = new THREE.MeshStandardMaterial({
    roughness: 0.48,
    metalness: 0,
    flatShading: true,
    vertexColors: true,
  });
  const gem = (points, colorOf = facet) =>
    new THREE.Mesh(paint(new ConvexGeometry(points), colorOf), material);
  // Brilliant cut, point down: table, 16 crown facets, girdle band, 8 pavilion facets.
  const ring = (r, y, turn) =>
    Array.from({ length: 8 }, (_, k) =>
      radial(((k + turn) * Math.PI) / 4, r, y, 0),
    );
  place(
    gem([
      new THREE.Vector3(0, 0.79, 0),
      ...ring(0.24, 0.965, 0),
      ...ring(0.24, 0.985, 0),
      ...ring(0.135, 1.07, 0.5),
    ]),
    lean,
  ).position.y = -pivot;
  // A small faceted lozenge set into each face of the top course.
  if (quality >= 2) {
    const y = neck - course / 2 - 0.007;
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      const at = (dy, t, out) => radial(a, halfAt(y + dy) + out, y + dy, t);
      place(
        gem(
          [0.004, -0.01]
            .flatMap((out) => [
              at(0.045, 0, out),
              at(-0.045, 0, out),
              at(0, 0.032, out),
              at(0, -0.032, out),
            ])
            .concat(at(0, 0, 0.026)),
          () => tone(-0.4),
        ),
      );
    }
  }
  return [lean];
}

// Shaft and cap palette colours share one material, keeping Sapphire within the four-material budget.
const sapphireMasonry = carvedMaterials[0].clone();
sapphireMasonry.color.set("#ffffff");

/** Sapphire: a six-sided coursed column, wide capital and pointed prism in a dark setting. */
function buildSapphire(add, place, head, quality, { color, sides, profile }) {
  const ring = (r, y) =>
    Array.from({ length: sides }, (_, i) => {
      const a = (i * 2 * Math.PI) / sides;
      return new THREE.Vector3(r * Math.cos(a), y, r * Math.sin(a));
    });
  const block = (rings, material, key, parent) =>
    add(
      paint(new ConvexGeometry(rings.flatMap(([r, y]) => ring(r, y))), (n) =>
        stoneShade(key)(n).map((v, i) => v * material.color.toArray()[i]),
      ),
      sapphireMasonry,
      parent,
    );
  block(
    [
      [0.23, 0.2],
      [0.23, 0.23],
      [0.155, 0.28],
    ],
    carvedMaterials[1],
    30,
  );
  const courses = quality >= 3 ? 3 : 2;
  for (let i = 0; i < courses; i++) {
    const bottom = 0.28 + (0.37 * i) / courses;
    const top = 0.28 + (0.37 * (i + 1)) / courses;
    block(
      [
        [0.145, bottom],
        [0.145, top - 0.014],
        [0.133, top],
      ],
      carvedMaterials[0],
      31 + i,
    );
  }
  block(
    [
      [0.145, 0.64],
      [0.235, 0.71],
      [0.235, 0.745],
      [0.215, 0.765],
    ],
    carvedMaterials[1],
    35,
  );
  if (quality >= 5)
    block(
      [
        [0.145, 0.36],
        [0.175, 0.375],
        [0.175, 0.405],
        [0.145, 0.42],
      ],
      carvedMaterials[1],
      36,
    );

  // The socket and grips tip with the prism; their feet overlap the capital at every yaw.
  const pivot = 0.765;
  const lean = new THREE.Group();
  head.position.y = pivot;
  head.add(lean);
  block(
    [
      [0.15, 0.745],
      [0.175, 0.79],
      [0.175, 0.83],
    ],
    carvedMaterials[2],
    37,
    lean,
  ).position.y = -pivot;
  const grips = quality >= 4 ? 6 : 3;
  for (let i = 0; i < grips; i++) {
    const a = (i * 2 * Math.PI) / grips;
    const section = (r0, r1, y, w) =>
      [r0, r1].flatMap((r) =>
        [-w, w].map(
          (t) =>
            new THREE.Vector3(
              r * Math.cos(a) - t * Math.sin(a),
              y,
              r * Math.sin(a) + t * Math.cos(a),
            ),
        ),
      );
    add(
      paint(
        new ConvexGeometry([
          ...section(0.12, 0.18, 0.775, 0.04),
          ...section(0.21, 0.25, 0.885, 0.03),
          ...section(0.21, 0.235, 0.925, 0.02),
        ]),
        stoneShade(40 + i),
      ),
      carvedMaterials[2],
      lean,
    ).position.y = -pivot;
  }
  const blue = new THREE.Color(color);
  const deep = blue.clone().multiplyScalar(0.7);
  const tone = (mix) =>
    blue
      .clone()
      .lerp(mix < 0 ? new THREE.Color("#ffffff") : deep, Math.abs(mix))
      .toArray();
  const material = new THREE.MeshStandardMaterial({
    roughness: 0.48,
    metalness: 0,
    flatShading: true,
    vertexColors: true,
  });
  const gem = (points, facet) =>
    new THREE.Mesh(paint(new ConvexGeometry(points), facet), material);
  place(
    gem(
      profile.flatMap(([r, y]) =>
        r ? ring(r, y) : [new THREE.Vector3(0, y, 0)],
      ),
      (n) => {
        if (n.y > 0.05)
          return tone(
            Math.floor((Math.atan2(n.z, n.x) + 2 * Math.PI) / (Math.PI / 3)) & 1
              ? 0.45
              : -0.3,
          );
        return tone(n.y < -0.05 ? 0.7 : 0.3);
      },
    ),
    lean,
  ).position.y = -pivot;
  if (quality >= 2)
    for (let i = 0; i < sides; i++) {
      const a = ((i + 0.5) * 2 * Math.PI) / sides;
      const at = (dy, t, out) =>
        new THREE.Vector3(
          (0.145 * Math.cos(Math.PI / sides) + out) * Math.cos(a) -
            t * Math.sin(a),
          0.57 + dy,
          (0.145 * Math.cos(Math.PI / sides) + out) * Math.sin(a) +
            t * Math.cos(a),
        );
      place(
        gem(
          [0.004, -0.01]
            .flatMap((out) => [
              at(0.043, 0, out),
              at(-0.043, 0, out),
              at(0, 0.03, out),
              at(0, -0.03, out),
            ])
            .concat(at(0, 0, 0.024)),
          () => tone(-0.4),
        ),
      );
    }
  return [lean];
}

/** Aiming tips the head this far toward its target, so the turn reads even on round gems. */
const AIM_LEAN = 0.17;

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
  const place = (mesh, parent = tower) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const stoneMesh = (geometry, material, parent) => {
    const mesh = place(new THREE.Mesh(geometry, material), parent);
    mesh.userData.sharedMaterial = true;
    return mesh;
  };
  const model = createStone({ x, z, neighbours, seed });
  const tower = new THREE.Group();
  // The head (prongs or claws, and gems) turns on the shaft axis toward the creep under attack.
  const head = new THREE.Group();
  const plinth = stoneMesh(
    new THREE.CylinderGeometry(0.28, 0.31, 0.12, 8),
    model.children[0].material,
  );
  plinth.position.y = 0.14;
  plinth.rotation.y = Math.PI / 8;
  const leaners = [];
  if (type === "D")
    leaners.push(...buildDiamond(stoneMesh, place, head, quality, spec));
  else if (type === "B")
    leaners.push(...buildSapphire(stoneMesh, place, head, quality, spec));
  else {
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
    head.position.y = crown;
    for (let i = 0; i < prongs; i++) {
      const prong = stoneMesh(
        new THREE.CylinderGeometry(0.04, 0.05, 0.12, 4),
        masonryMaterials[1],
        head,
      );
      const a = (i * 2 * Math.PI) / prongs;
      prong.position.set(
        Math.cos(a) * (crownRadius - 0.04),
        0.05,
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
      gem.position.set((i - (count - 1) / 2) * 0.145, 0, 0);
      gem.rotation.y = Math.PI / 4;
      leaners.push(place(gem, head)); // Each crystal leans on its own base, so clusters stay seated.
    }
  }
  tower.add(head);
  for (const part of leaners) part.rotation.order = "ZYX"; // Lean in the head's frame.
  const scale = tier.width / 0.68;
  tower.scale.setScalar(scale);
  tower.position.y = 0.08 * (1 - scale); // Keep the plinth seated on the stone.
  model.add(tower);
  model.name = spec.name;
  model.userData.quality = tier;
  const local = new THREE.Vector3();
  /** Turn the head toward a world-space board point (x, z); call with no arguments to rest it. */
  model.userData.aimAt = (targetX, targetZ) => {
    const aiming = targetX !== undefined;
    head.rotation.y = 0;
    if (aiming) {
      tower.updateWorldMatrix(true, false);
      tower.worldToLocal(local.set(targetX, 0, targetZ));
      head.rotation.y = Math.atan2(-local.z, local.x);
    }
    for (const part of leaners) part.rotation.z = aiming ? -AIM_LEAN : 0;
  };
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
