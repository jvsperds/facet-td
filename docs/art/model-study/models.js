import * as THREE from "three";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

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
      [0.06, 0.785],
      [0.27, 0.88],
      [0.17, 1.025],
      [0, 1.105],
    ],
    tower: {
      shape: "waist",
      profile: [
        [0, 0.2],
        [0.255, 0.2],
        [0.225, 0.27],
        [0.095, 0.47],
        [0.095, 0.5],
        [0.2, 0.705],
        [0.28, 0.725],
        [0.26, 0.755],
        [0, 0.755],
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
      [0.14, 0.775],
      [0.235, 0.83],
      [0.235, 0.925],
      [0.15, 1.015],
      [0.12, 1.025],
    ],
    tower: {
      shape: "keep",
      profile: [
        [0, 0.2],
        [0.245, 0.2],
        [0.18, 0.28],
        [0.17, 0.61],
        [0.27, 0.675],
        [0.27, 0.715],
        [0.25, 0.735],
        [0, 0.735],
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
      [0.105, 0.795],
      [0.18, 0.835],
      [0.18, 0.985],
      [0.12, 1.07],
    ],
    tower: {
      shape: "spire",
      profile: [
        [0, 0.2],
        [0.23, 0.2],
        [0.17, 0.28],
        [0.105, 0.72],
        [0.19, 0.755],
        [0.175, 0.78],
        [0, 0.78],
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
      [0.17, 0.775],
      [0.25, 0.815],
      [0.22, 0.89],
      [0.13, 0.96],
      [0.06, 0.975],
    ],
    tower: {
      shape: "cup",
      profile: [
        [0, 0.2],
        [0.24, 0.2],
        [0.12, 0.34],
        [0.105, 0.53],
        [0.27, 0.69],
        [0.27, 0.72],
        [0.245, 0.745],
        [0, 0.745],
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
        [0.28, 0.2],
        [0.25, 0.25],
        [0.25, 0.36],
        [0.205, 0.375],
        [0.205, 0.53],
        [0.15, 0.545],
        [0.15, 0.71],
        [0.24, 0.74],
        [0.22, 0.765],
        [0, 0.765],
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
        [0.235, 0.27],
        [0.21, 0.57],
        [0.28, 0.615],
        [0.28, 0.645],
        [0.255, 0.665],
        [0, 0.665],
      ],
    },
  },
];

const flat = (color) =>
  new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true });
// Dark masonry against the light board; all faces use the existing wall palette.
const WALL_TONES = ["#565b5e", "#5f6466", "#686c6c", "#717473", "#7a7c78"].map(
  (color) => new THREE.Color(color).toArray(),
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
/** Castle masonry; the legacy factory name and neighbour/merge API stay compatible. */
export function createStone({
  x = 0,
  z = 0,
  neighbours = {},
  seed = 1,
  towerBase = false,
} = {}) {
  if (![x, z, seed].every(Number.isInteger))
    throw new TypeError("Stone coordinates and seed must be integers");
  const group = new THREE.Group();
  const arms = [];
  const horizontal =
    !towerBase &&
    (neighbours.east || neighbours.west) &&
    !neighbours.north &&
    !neighbours.south;
  const vertical =
    !towerBase &&
    (neighbours.north || neighbours.south) &&
    !neighbours.east &&
    !neighbours.west;
  const axis = horizontal ? "x" : vertical ? "z" : undefined;
  const internalX = (v) =>
    horizontal &&
    [0.2, 0.22].some((edge) => Math.abs(Math.abs(v) - edge) < 1e-8);
  const internalZ = (v) =>
    vertical && [0.2, 0.22].some((edge) => Math.abs(Math.abs(v) - edge) < 1e-8);
  const flush = (x0, x1, z0, z1) => [
    (x0 === -0.5 && neighbours.west) ||
      (internalX(x0) && neighbours[x0 < 0 ? "west" : "east"]),
    (x1 === 0.5 && neighbours.east) ||
      (internalX(x1) && neighbours[x1 < 0 ? "west" : "east"]),
    (z0 === -0.5 && neighbours.north) ||
      (internalZ(z0) && neighbours[z0 < 0 ? "north" : "south"]),
    (z1 === 0.5 && neighbours.south) ||
      (internalZ(z1) && neighbours[z1 < 0 ? "north" : "south"]),
  ];
  const box = (parts, rect, y0, y1, tone, bevel = 0.004) => {
    const [x0, x1, z0, z1] = rect;
    const [west, east, north, south] = flush(...rect);
    const ring = (loX, hiX, loZ, hiZ, y) =>
      [
        [loX, y, loZ],
        [hiX, y, loZ],
        [hiX, y, hiZ],
        [loX, y, hiZ],
      ].map((v) => new THREE.Vector3(...v));
    const geometry = new ConvexGeometry([
      ...ring(x0, x1, z0, z1, y0),
      ...ring(x0, x1, z0, z1, y1 - bevel),
      ...ring(
        x0 + (west ? 0 : bevel),
        x1 - (east ? 0 : bevel),
        z0 + (north ? 0 : bevel),
        z1 - (south ? 0 : bevel),
        y1,
      ),
    ]);
    parts.push(paint(geometry, () => WALL_TONES[tone]));
  };
  const bricks = (parts, rect, axis) => {
    // A world-aligned bond continues through tile cuts: shared bricks keep their colour and cut face.
    const [x0, x1, z0, z1] = rect;
    for (let row = 0; row < 2; row++) {
      const shift = row * 0.125,
        pitch = 0.25,
        gap = 0.005;
      const fromX =
        axis === "z"
          ? Math.floor(x / pitch)
          : Math.floor((x + x0 - shift) / pitch);
      const toX =
        axis === "z" ? fromX + 1 : Math.ceil((x + x1 - shift) / pitch);
      const fromZ =
        axis === "x"
          ? Math.floor(z / pitch)
          : Math.floor((z + z0 - shift) / pitch);
      const toZ =
        axis === "x" ? fromZ + 1 : Math.ceil((z + z1 - shift) / pitch);
      for (let bx = fromX; bx < toX; bx++)
        for (let bz = fromZ; bz < toZ; bz++) {
          const loX =
              axis === "z"
                ? x0
                : Math.max(x0, bx * pitch + shift - x + gap / 2),
            hiX =
              axis === "z"
                ? x1
                : Math.min(x1, (bx + 1) * pitch + shift - x - gap / 2);
          const loZ =
              axis === "x"
                ? z0
                : Math.max(z0, bz * pitch + shift - z + gap / 2),
            hiZ =
              axis === "x"
                ? z1
                : Math.min(z1, (bz + 1) * pitch + shift - z - gap / 2);
          if (hiX - loX < 0.009 || hiZ - loZ < 0.009) continue;
          box(
            parts,
            [loX, hiX, loZ, hiZ],
            0.027 + row * 0.043,
            0.063 + row * 0.043,
            1 + (noise(bx, row, bz, seed) % 4),
          );
        }
    }
  };
  const mesh = (parts) => {
    const geometry = mergeGeometries(parts);
    parts.forEach((part) => part.dispose());
    const result = new THREE.Mesh(geometry, paletteMasonry);
    result.castShadow = true;
    result.receiveShadow = true;
    result.userData.sharedMaterial = true;
    return result;
  };
  const core = [];
  const coreRect = (length, half) =>
    horizontal
      ? [-length, length, -half, half]
      : vertical
        ? [-half, half, -length, length]
        : [-length, length, -length, length];
  box(
    core,
    coreRect(0.22, 0.16),
    0,
    0.025,
    0,
    axis ? 0.004 : 0.005 + (noise(x, 0, z, seed) % 3) * 0.001,
  );
  box(core, coreRect(0.195, 0.135), 0.02, 0.11, 0, 0);
  bricks(core, coreRect(0.2, 0.14), axis);
  box(core, coreRect(0.22, 0.16), 0.108, 0.122, 3);
  if (axis)
    for (const along of [-0.125, 0.125])
      box(
        core,
        horizontal
          ? [along - 0.07, along + 0.07, -0.14, 0.14]
          : [-0.14, 0.14, along - 0.07, along + 0.07],
        0.118,
        0.196,
        3,
      );
  else
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        box(
          core,
          [
            sx < 0 ? -0.21 : 0.11,
            sx < 0 ? -0.11 : 0.21,
            sz < 0 ? -0.21 : 0.11,
            sz < 0 ? -0.11 : 0.21,
          ],
          0.118,
          0.196,
          3,
        );
  group.add(mesh(core));
  for (const [side, dx, dz] of [
    ["north", 0, -1],
    ["east", 1, 0],
    ["south", 0, 1],
    ["west", -1, 0],
  ]) {
    if (!neighbours[side]) continue;
    const rect = (start, end, half) =>
      dx
        ? [dx > 0 ? start : -end, dx > 0 ? end : -start, -half, half]
        : [-half, half, dz > 0 ? start : -end, dz > 0 ? end : -start];
    const parts = [];
    box(parts, rect(0.22, 0.5, 0.16), 0, 0.025, 0);
    box(parts, rect(0.195, 0.5, 0.135), 0.02, 0.11, 0, 0);
    bricks(parts, rect(0.2, 0.5, 0.14), dx ? "x" : "z");
    box(parts, rect(0.22, 0.5, 0.16), 0.108, 0.122, 3);
    box(parts, rect(towerBase ? 0.2 : 0.305, 0.445, 0.14), 0.118, 0.196, 3);
    const arm = new THREE.Group();
    arm.add(mesh(parts));
    group.add(arm);
    arms.push({ arm, dx });
  }
  group.position.set(x, 0, z);
  group.userData.setMerge = (progress) => {
    const t = THREE.MathUtils.clamp(progress, 0, 1),
      eased = t * t * (3 - 2 * t);
    for (const { arm, dx } of arms)
      arm.scale.set(
        dx ? 0.45 + 0.55 * eased : 1,
        0.65 + 0.35 * eased,
        dx ? 1 : 0.45 + 0.55 * eased,
      );
  };
  group.userData.setMerge(1);
  if (!towerBase)
    group.traverse((part) => {
      if (!part.isMesh) return;
      part.geometry.scale(1, 0.38 / 0.196, 1);
    });
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

// Shaft and cap palette colours share one material to keep the four-material budget.
const paletteMasonry = carvedMaterials[0].clone();
paletteMasonry.color.set("#ffffff");

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
      paletteMasonry,
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

// The remaining builders share the same solid, palette and setting tools, not their silhouettes.
function towerTools(add, place, head, { sides, color }) {
  const ring = (r, y, count = sides) =>
    r
      ? Array.from({ length: count }, (_, i) => {
          const a = (i * 2 * Math.PI) / count;
          return new THREE.Vector3(r * Math.cos(a), y, r * Math.sin(a));
        })
      : [new THREE.Vector3(0, y, 0)];
  const solid = (points, role, key, parent) => {
    const palette = carvedMaterials[role].color.toArray();
    return add(
      paint(new ConvexGeometry(points), (n) =>
        stoneShade(key)(n).map((v, i) => v * palette[i]),
      ),
      paletteMasonry,
      parent,
    );
  };
  const block = (profile, role = 0, key = 1, parent) =>
    solid(
      profile.flatMap(([r, y]) => ring(r, y)),
      role,
      key,
      parent,
    );
  const base = new THREE.Color(color);
  const deep = base.clone().multiplyScalar(0.7);
  const tone = (mix) =>
    base
      .clone()
      .lerp(mix < 0 ? new THREE.Color("#ffffff") : deep, Math.abs(mix))
      .toArray();
  const material = new THREE.MeshStandardMaterial({
    roughness: 0.48,
    metalness: 0,
    flatShading: true,
    vertexColors: true,
  });
  const gem = (
    points,
    parent,
    colorOf = (n) => {
      if (n.y > 0.99) return tone(-0.6);
      if (n.y > 0.05)
        return tone(
          Math.floor(
            (Math.atan2(n.z, n.x) + 2 * Math.PI) / ((2 * Math.PI) / sides),
          ) & 1
            ? 0.45
            : -0.3,
        );
      return tone(n.y < -0.05 ? 0.7 : 0.3);
    },
  ) =>
    place(
      new THREE.Mesh(paint(new ConvexGeometry(points), colorOf), material),
      parent,
    );
  const seat = (y) => {
    const lean = new THREE.Group();
    const pivot = new THREE.Group();
    head.position.y = y;
    // All authored head heights stay in tower space; the lean pivots on its overlapping foot.
    lean.position.y = -y;
    head.add(pivot);
    pivot.add(lean);
    return { lean, pivot };
  };
  const inlays = (r, y, count = sides) => {
    for (let i = 0; i < count; i++) {
      const a = (i * 2 * Math.PI) / count + Math.PI / sides;
      const at = (dy, t, out) =>
        new THREE.Vector3(
          (r + out) * Math.cos(a) - t * Math.sin(a),
          y + dy,
          (r + out) * Math.sin(a) + t * Math.cos(a),
        );
      gem(
        [0.004, -0.012]
          .flatMap((out) => [
            at(0.035, 0, out),
            at(-0.035, 0, out),
            at(0, 0.028, out),
            at(0, -0.028, out),
          ])
          .concat(at(0, 0, 0.024)),
        undefined,
        () => tone(-0.4),
      );
    }
  };
  const grips = (parent, count, sections, role = 2, turn = 0) => {
    for (let i = 0; i < count; i++) {
      const a = turn + (i * 2 * Math.PI) / count;
      solid(
        sections.flatMap(([r0, r1, y, w]) =>
          [r0, r1].flatMap((r) =>
            [-w, w].map(
              (t) =>
                new THREE.Vector3(
                  r * Math.cos(a) - t * Math.sin(a),
                  y,
                  r * Math.sin(a) + t * Math.cos(a),
                ),
            ),
          ),
        ),
        role,
        60 + i,
        parent,
      );
    }
  };
  const courses = (quality, bottom, top, radius) => {
    const count = quality >= 3 ? 3 : 2;
    for (let i = 0; i < count; i++) {
      const lo = bottom + ((top - bottom) * i) / count;
      const hi = bottom + ((top - bottom) * (i + 1)) / count;
      block(
        [
          [radius(lo), lo],
          [radius(hi), hi - 0.014],
          [radius(hi) - 0.012, hi],
        ],
        0,
        50 + i,
      );
    }
  };
  return { ring, solid, block, gem, seat, inlays, grips, courses };
}

/** Topaz: three-fold hourglass masonry and three swept prongs around a pointed triangular cut. */
function buildTopaz(add, place, head, quality, spec) {
  const { ring, block, gem, seat, inlays, grips } = towerTools(
    add,
    place,
    head,
    spec,
  );
  block(
    [
      [0.255, 0.2],
      [0.255, 0.24],
      [0.225, 0.27],
    ],
    1,
    70,
  );
  block(
    [
      [0.22, 0.26],
      [0.095, 0.47],
      [0.095, 0.5],
    ],
    0,
    71,
  );
  block(
    [
      [0.095, 0.49],
      [0.22, 0.69],
      [0.2, 0.705],
    ],
    0,
    72,
  );
  block(
    [
      [0.2, 0.685],
      [0.28, 0.725],
      [0.26, 0.755],
    ],
    1,
    73,
  );
  if (quality >= 2) inlays(0.095 * Math.cos(Math.PI / 3), 0.48, 3);
  if (quality >= 3)
    block(
      [
        [0.13, 0.41],
        [0.13, 0.445],
        [0.105, 0.46],
      ],
      1,
      74,
    );
  if (quality >= 5)
    block(
      [
        [0.21, 0.285],
        [0.225, 0.3],
        [0.2, 0.33],
      ],
      1,
      75,
    );
  const { lean, pivot } = seat(0.755);
  block(
    [
      [0.15, 0.735],
      [0.18, 0.78],
      [0.15, 0.8],
    ],
    2,
    76,
    lean,
  );
  grips(lean, 3, [
    [0.105, 0.18, 0.72, 0.04],
    [0.27, 0.3, 0.88, 0.035],
    [0.24, 0.275, 0.94, 0.022],
  ]);
  if (quality >= 4)
    block(
      [
        [0.18, 0.76],
        [0.21, 0.785],
        [0.18, 0.81],
      ],
      2,
      77,
      lean,
    );
  gem(
    [
      [0.06, 0.785],
      [0.27, 0.88],
      [0.17, 1.025],
      [0, 1.105],
    ].flatMap(([r, y]) => ring(r, y)),
    lean,
  );
  return [pivot];
}

/** Ruby: an eight-sided keep with pale battlements and a broad cushion-cut crown. */
function buildRuby(add, place, head, quality, spec) {
  const { ring, block, gem, seat, inlays, grips, courses } = towerTools(
    add,
    place,
    head,
    spec,
  );
  block(
    [
      [0.245, 0.2],
      [0.245, 0.235],
      [0.18, 0.28],
    ],
    1,
    80,
  );
  courses(quality, 0.27, 0.61, () => 0.17);
  block(
    [
      [0.17, 0.6],
      [0.27, 0.675],
      [0.27, 0.715],
      [0.25, 0.735],
    ],
    1,
    81,
  );
  if (quality >= 2) inlays(0.17 * Math.cos(Math.PI / 8), 0.54, 4);
  if (quality >= 4)
    block(
      [
        [0.245, 0.66],
        [0.285, 0.68],
        [0.27, 0.705],
      ],
      1,
      82,
    );
  if (quality >= 5)
    block(
      [
        [0.17, 0.3],
        [0.195, 0.32],
        [0.195, 0.35],
        [0.17, 0.365],
      ],
      1,
      83,
    );
  const { lean, pivot } = seat(0.735);
  block(
    [
      [0.19, 0.715],
      [0.22, 0.76],
      [0.22, 0.795],
    ],
    2,
    84,
    lean,
  );
  grips(
    lean,
    8,
    [
      [0.23, 0.28, 0.695, 0.035],
      [0.235, 0.28, 0.87, 0.035],
      [0.245, 0.27, 0.89, 0.025],
    ],
    1,
  );
  gem(
    [
      [0.14, 0.775],
      [0.235, 0.83],
      [0.235, 0.925],
      [0.15, 1.015],
      [0.12, 1.025],
    ].flatMap(([r, y]) => ring(r, y)),
    lean,
  );
  return [pivot];
}

/** Emerald: a tapered spire and square step cut, held outside its chamfered corners. */
function buildEmerald(add, place, head, quality, spec) {
  const { block, solid, gem, seat, inlays, grips, courses } = towerTools(
    add,
    place,
    head,
    spec,
  );
  block(
    [
      [0.23, 0.2],
      [0.23, 0.235],
      [0.17, 0.28],
    ],
    1,
    90,
  );
  const radius = (y) => 0.17 - (0.065 * (y - 0.27)) / 0.45;
  courses(quality, 0.27, 0.72, radius);
  block(
    [
      [0.105, 0.71],
      [0.19, 0.755],
      [0.175, 0.78],
    ],
    1,
    91,
  );
  if (quality >= 2) inlays(radius(0.63) * Math.cos(Math.PI / 4), 0.63, 4);
  if (quality >= 4)
    block(
      [
        [0.115, 0.675],
        [0.145, 0.69],
        [0.135, 0.715],
      ],
      1,
      92,
    );
  if (quality >= 5)
    block(
      [
        [0.16, 0.31],
        [0.18, 0.325],
        [0.17, 0.35],
      ],
      1,
      93,
    );
  const { lean, pivot } = seat(0.78);
  solid(
    [
      [0.11, 0.76],
      [0.145, 0.795],
      [0.13, 0.82],
    ].flatMap(([r, y]) => squareRing(r, y)),
    2,
    94,
    lean,
  );
  grips(
    lean,
    4,
    [
      [0.11, 0.17, 0.75, 0.035],
      [0.23, 0.26, 0.835, 0.025],
      [0.23, 0.25, 0.93, 0.02],
    ],
    2,
    Math.PI / 4,
  );
  gem(
    [
      [0.105, 0.795],
      [0.18, 0.835],
      [0.18, 0.985],
      [0.12, 1.07],
    ].flatMap(([r, y]) => squareRing(r, y)),
    lean,
  );
  return [pivot];
}

/** Opal: a stemmed goblet with a flared bowl and a low, broad cabochon in a dark bezel. */
function buildOpal(add, place, head, quality, spec) {
  const { ring, block, gem, seat, inlays, courses } = towerTools(
    add,
    place,
    head,
    spec,
  );
  block(
    [
      [0.24, 0.2],
      [0.24, 0.235],
      [0.12, 0.34],
    ],
    1,
    100,
  );
  courses(quality, 0.33, 0.53, () => 0.105);
  block(
    [
      [0.105, 0.52],
      [0.27, 0.69],
      [0.27, 0.72],
      [0.245, 0.745],
    ],
    1,
    101,
  );
  if (quality >= 2) inlays(0.105 * Math.cos(Math.PI / 8), 0.465, 4);
  if (quality >= 4)
    block(
      [
        [0.245, 0.665],
        [0.28, 0.69],
        [0.275, 0.715],
      ],
      1,
      102,
    );
  if (quality >= 5)
    block(
      [
        [0.105, 0.35],
        [0.14, 0.365],
        [0.14, 0.39],
        [0.105, 0.405],
      ],
      1,
      103,
    );
  const { lean, pivot } = seat(0.745);
  block(
    [
      [0.21, 0.725],
      [0.255, 0.77],
      [0.25, 0.795],
    ],
    2,
    104,
    lean,
  );
  gem(
    [
      [0.17, 0.775],
      [0.25, 0.815],
      [0.22, 0.89],
      [0.13, 0.96],
      [0.06, 0.975],
    ].flatMap(([r, y]) => ring(r, y)),
    lean,
  );
  return [pivot];
}

/** Aquamarine: three pentagonal terraces carry two separate pointed crystals. */
function buildAquamarine(add, place, head, quality, spec) {
  const { ring, block, gem, seat, inlays } = towerTools(add, place, head, spec);
  block(
    [
      [0.28, 0.2],
      [0.28, 0.23],
      [0.25, 0.25],
    ],
    1,
    110,
  );
  block(
    [
      [0.25, 0.24],
      [0.25, 0.36],
      [0.23, 0.375],
    ],
    0,
    111,
  );
  block(
    [
      [0.205, 0.37],
      [0.205, 0.53],
      [0.185, 0.545],
    ],
    0,
    112,
  );
  block(
    [
      [0.15, 0.54],
      [0.15, 0.71],
      [0.135, 0.725],
    ],
    0,
    113,
  );
  block(
    [
      [0.135, 0.71],
      [0.24, 0.74],
      [0.22, 0.765],
    ],
    1,
    114,
  );
  if (quality >= 2) inlays(0.205 * Math.cos(Math.PI / 5), 0.475, 5);
  if (quality >= 3)
    block(
      [
        [0.25, 0.33],
        [0.26, 0.35],
        [0.24, 0.375],
      ],
      1,
      115,
    );
  if (quality >= 5)
    block(
      [
        [0.205, 0.51],
        [0.22, 0.53],
        [0.2, 0.555],
      ],
      1,
      116,
    );
  const { lean, pivot } = seat(0.765);
  block(
    [
      [0.19, 0.745],
      [0.21, 0.775],
      [0.19, 0.8],
    ],
    2,
    117,
    lean,
  );
  for (let i = 0; i < 2; i++) {
    const x = i ? 0.115 : -0.115;
    const shift = (points) =>
      points.map((p) => p.add(new THREE.Vector3(x, 0, 0)));
    if (quality >= 4) {
      // Each raised cuff grips its own crystal; both belong to the same tier detail.
      const cuff = block(
        [
          [0.075, 0.775],
          [0.12, 0.805],
          [0.12, 0.835],
        ],
        2,
        118 + i,
        lean,
      );
      cuff.position.x = x;
    }
    gem(
      shift(
        [
          [0.065, 0.78],
          [0.115, 0.825],
          [0.115, i ? 1.015 : 0.97],
          [0, i ? 1.115 : 1.07],
        ].flatMap(([r, y]) => ring(r, y)),
      ),
      lean,
    );
  }
  return [pivot];
}

/** Amethyst: a squat six-sided drum and three evenly spaced crystal points. */
function buildAmethyst(add, place, head, quality, spec) {
  const { ring, block, gem, seat, inlays, courses } = towerTools(
    add,
    place,
    head,
    spec,
  );
  block(
    [
      [0.26, 0.2],
      [0.26, 0.235],
      [0.235, 0.27],
    ],
    1,
    120,
  );
  courses(quality, 0.26, 0.57, (y) => 0.235 - (0.025 * (y - 0.26)) / 0.31);
  block(
    [
      [0.21, 0.56],
      [0.28, 0.615],
      [0.28, 0.645],
      [0.255, 0.665],
    ],
    1,
    121,
  );
  if (quality >= 2) inlays(0.22 * Math.cos(Math.PI / 6), 0.485, 6);
  if (quality >= 4)
    block(
      [
        [0.25, 0.6],
        [0.29, 0.62],
        [0.28, 0.645],
      ],
      2,
      122,
    );
  if (quality >= 5)
    block(
      [
        [0.23, 0.29],
        [0.255, 0.31],
        [0.245, 0.335],
      ],
      1,
      123,
    );
  const { lean, pivot } = seat(0.665);
  block(
    [
      [0.2, 0.645],
      [0.225, 0.68],
      [0.21, 0.7],
    ],
    2,
    124,
    lean,
  );
  for (let i = 0; i < 3; i++) {
    const a = (i * 2 * Math.PI) / 3;
    const x = 0.125 * Math.cos(a),
      z = 0.125 * Math.sin(a);
    const socket = block(
      [
        [0.065, 0.68],
        [0.105, 0.72],
        [0.1, 0.75],
      ],
      2,
      125 + i,
      lean,
    );
    socket.position.set(x, 0, z);
    gem(
      [
        [0.065, 0.705],
        [0.105, 0.76],
        [0.105, 0.96],
        [0, 1.065],
      ]
        .flatMap(([r, y]) => ring(r, y))
        .map((p) => p.add(new THREE.Vector3(x, 0, z))),
      lean,
    );
  }
  return [pivot];
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
  const model = createStone({ x, z, neighbours, seed, towerBase: true });
  const tower = new THREE.Group();
  // The head (prongs or claws, and gems) turns on the shaft axis toward the creep under attack.
  const head = new THREE.Group();
  const plinth = stoneMesh(
    paint(
      new THREE.CylinderGeometry(0.28, 0.31, 0.12, 8).toNonIndexed(),
      (normal) => WALL_TONES[2].map((v, i) => v * stoneShade(11)(normal)[i]),
    ),
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
    const build = {
      Y: buildTopaz,
      R: buildRuby,
      G: buildEmerald,
      E: buildOpal,
      Q: buildAquamarine,
      P: buildAmethyst,
    }[type];
    leaners.push(...build(stoneMesh, place, head, quality, spec));
  }
  tower.add(head);
  for (const part of leaners) part.rotation.order = "ZYX"; // Lean in the head's frame.
  const scale = tier.width / 0.68;
  tower.scale.setScalar(scale);
  tower.position.y = 0.08 * (1 - scale); // Keep the plinth seated on the stone.
  model.add(tower);
  model.updateMatrixWorld(true);
  const restBottom = new THREE.Box3().setFromObject(head).min.y;
  for (const part of leaners) part.rotation.z = -AIM_LEAN;
  model.updateMatrixWorld(true);
  const headBottom = Math.min(
    restBottom,
    new THREE.Box3().setFromObject(head).min.y,
  );
  for (const part of leaners) part.rotation.z = 0;
  model.updateMatrixWorld(true);
  const joinHeight = headBottom - 0.025;
  const staticParts = tower.children.filter((part) => part !== head);
  const ray = new THREE.Raycaster();
  // Fit each wall to the original shaft, narrowing the inner edge to avoid shoulders beside slim columns.
  for (const arm of model.children.slice(1, -1)) {
    const mesh = arm.children[0];
    const p = mesh.geometry.attributes.position;
    const axis = Math.abs(p.getX(0)) > Math.abs(p.getZ(0)) ? "x" : "z";
    const alongIndex = axis === "x" ? 0 : 2;
    const acrossIndex = axis === "x" ? 2 : 0;
    const sign = Math.sign(p.getComponent(0, alongIndex));
    for (let i = 0; i < p.count; i++) {
      const along = Math.abs(p.getComponent(i, alongIndex));
      const blend = THREE.MathUtils.clamp((0.5 - along) / 0.28, 0, 1);
      const y =
        (p.getY(i) * THREE.MathUtils.lerp(0.38, joinHeight, blend)) / 0.196;
      const across =
        p.getComponent(i, acrossIndex) * THREE.MathUtils.lerp(1, 0.25, blend);
      let fitted = along;
      if (along <= 0.220001) {
        const origin = new THREE.Vector3(x, y, z);
        origin[axis] += sign * 0.5;
        origin[axis === "x" ? "z" : "x"] += across;
        const direction = new THREE.Vector3();
        direction[axis] = -sign;
        ray.set(origin, direction);
        const hit = ray.intersectObjects(staticParts, false)[0];
        fitted = hit
          ? Math.max(
              0,
              sign * (hit.point[axis] - (axis === "x" ? x : z)) - 0.002,
            )
          : 0;
      }
      p.setComponent(i, alongIndex, sign * fitted);
      p.setComponent(i, acrossIndex, across);
      p.setY(i, y);
    }
    mesh.geometry.computeVertexNormals();
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
  }
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
