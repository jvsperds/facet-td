import * as THREE from "three";
import { effectTools } from "./combined-effect-shapes.js";

const point = (a, r, y, t = 0) =>
  new THREE.Vector3(
    r * Math.cos(a) - t * Math.sin(a),
    y,
    r * Math.sin(a) + t * Math.cos(a),
  );
const tint = (hex) => () => new THREE.Color(hex).toArray();

function ruby(t, s) {
  t.block(
    [
      [0.25, 0.2],
      [0.26, 0.25],
      [0.2, 0.29],
    ],
    1,
    200,
  );
  t.block(
    [
      [0.2, 0.28],
      [0.17, 0.53],
      [0.24, 0.63],
    ],
    0,
    201,
  );
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3;
    t.solid(
      [
        [0.21, 0.26, 0.055],
        [0.22, 0.48, 0.04],
        [0.16, 0.59, 0.03],
      ].flatMap(([r, y, w]) =>
        [r - 0.025, r + 0.025].flatMap((rad) =>
          [-w, w].map((v) => point(a, rad, y, v)),
        ),
      ),
      0,
      202 + i,
    );
  }
  t.block(
    [
      [0.23, 0.6],
      [0.28, 0.66],
      [0.24, 0.7],
    ],
    1,
    206,
  );

  const e = effectTools(t),
    { lean, pivot } = t.seat(0.72);
  t.block(
    [
      [0.2, 0.69],
      [0.26, 0.74],
      [0.23, 0.78],
    ],
    2,
    207,
    lean,
  );
  const flames = s.variant === "volcano" ? 7 : 5;
  for (let i = 0; i < flames; i++) {
    const a = (i * Math.PI * 2) / flames,
      r = s.variant === "volcano" ? 0.17 : 0.14;
    e.shard(
      lean,
      r * Math.cos(a),
      0.76,
      r * Math.sin(a),
      0.055,
      0.23 + (i % 2) * 0.06,
      "#de6948",
    );
    e.shard(
      lean,
      r * 0.8 * Math.cos(a),
      0.78,
      r * 0.8 * Math.sin(a),
      0.027,
      0.19,
      "#f8cb70",
      4,
    );
  }
  t.gem(
    [...t.ring(0.13, 0.75), ...t.ring(0.16, 0.85), ...t.ring(0.08, 0.93)],
    lean,
    tint("#f7b966"),
  );
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3;
    e.beam(
      undefined,
      point(a, 0.19, 0.34),
      point(a, 0.18, 0.55),
      0.035,
      "#bd573d",
    );
  }
  e.halo(undefined, 0.24, 0.28, 0.035, "#ca6643", 6);
  return [pivot];
}

function jade(t, s) {
  t.block(
    [
      [0.24, 0.2],
      [0.25, 0.25],
      [0.17, 0.28],
    ],
    1,
    210,
  );
  t.block(
    [
      [0.14, 0.26],
      [0.12, 0.65],
    ],
    0,
    211,
  );
  const levels = s.stage >= 2 ? 3 : 2;
  for (let i = 0; i < levels; i++) {
    const y = 0.37 + i * 0.12,
      r = 0.27 - i * 0.018;
    t.solid(
      [
        [r, y],
        [r - 0.045, y + 0.025],
        [r - 0.08, y + 0.05],
      ].flatMap(([radius, height]) => t.ring(radius, height, 4)),
      1,
      212 + i,
    );
  }
  t.block(
    [
      [0.12, 0.62],
      [0.24, 0.67],
      [0.21, 0.7],
    ],
    1,
    216,
  );

  const e = effectTools(t),
    { lean, pivot } = t.seat(0.73);
  t.block(
    [
      [0.16, 0.7],
      [0.2, 0.75],
      [0.16, 0.78],
    ],
    2,
    217,
    lean,
  );
  const ranged = ["gray", "monkey", "cullinan"].includes(s.variant);
  if (s.variant !== "cullinan")
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3;
      e.beam(
        undefined,
        point(a, 0.145, 0.31),
        point(a, 0.14, 0.58),
        0.03,
        "#68b56f",
      );
    }
  t.gem(
    [
      ...t.ring(0.11, 0.76),
      ...t.ring(ranged ? 0.16 : 0.19, 0.86),
      ...t.ring(0.105, 1.0),
      ...t.ring(0.055, 1.055),
    ],
    lean,
  );
  if (ranged) {
    const lenses = s.variant === "monkey" ? [-0.105, 0.105] : [0];
    for (const z of lenses) {
      const sight = new THREE.Group();
      lean.add(sight);
      sight.position.set(0.16, 0.94, z);
      sight.rotation.z = Math.PI / 2;
      e.halo(
        sight,
        s.variant === "monkey" ? 0.085 : 0.14,
        0,
        0.026,
        "#e0dca6",
        8,
      );
      e.beam(
        lean,
        [0.18, 0.94, z - 0.08],
        [0.18, 0.94, z + 0.08],
        0.012,
        "#ebd684",
      );
      e.beam(lean, [0.18, 0.86, z], [0.18, 1.02, z], 0.012, "#ebd684");
    }
    if (s.variant === "monkey")
      e.beam(lean, [0, 0.79, -0.23], [0, 0.99, 0.23], 0.035, "#d6b34e");
    if (s.variant === "cullinan")
      t.grips(
        lean,
        4,
        [
          [0.15, 0.18, 0.75, 0.025],
          [0.25, 0.28, 0.91, 0.018],
        ],
        2,
        Math.PI / 4,
      );
  } else {
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3;
      e.shard(
        lean,
        0.2 * Math.cos(a),
        0.78,
        0.2 * Math.sin(a),
        0.04,
        0.19,
        "#8bc46d",
        4,
      );
      e.shard(
        lean,
        0.2 * Math.cos(a),
        0.72,
        0.2 * Math.sin(a),
        0.018,
        0.06,
        "#c4de7a",
        4,
      );
    }
    if (s.variant === "lucky") {
      e.beam(
        lean,
        [0.155, 0.91, -0.065],
        [0.155, 0.91, 0.065],
        0.035,
        "#b6ebac",
      );
      e.beam(lean, [0.155, 0.845, 0], [0.155, 0.975, 0], 0.035, "#b6ebac");
      for (const z of [-0.17, 0.17])
        e.beam(lean, [-0.08, 0.88, z], [0.08, 1.065, z], 0.024, "#d7e6d5");
    }
  }
  return [pivot];
}

function quartz(t, s) {
  t.block(
    [
      [0.25, 0.2],
      [0.25, 0.25],
      [0.18, 0.29],
    ],
    1,
    220,
  );
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    t.solid(
      [
        [0.15, 0.28, 0.055],
        [0.11, 0.51, 0.035],
        [0.2, 0.64, 0.045],
      ].flatMap(([r, y, w]) =>
        [r - 0.025, r + 0.025].flatMap((rad) =>
          [-w, w].map((v) => point(a, rad, y, v)),
        ),
      ),
      0,
      221 + i,
    );
  }
  t.block(
    [
      [0.12, 0.28],
      [0.085, 0.6],
      [0.22, 0.67],
    ],
    0,
    225,
  );
  t.block(
    [
      [0.22, 0.64],
      [0.26, 0.69],
      [0.22, 0.72],
    ],
    1,
    226,
  );
  if (s.stage)
    t.block(
      [
        [0.17, 0.46],
        [0.19, 0.49],
        [0.16, 0.515],
      ],
      1,
      227,
    );

  const e = effectTools(t),
    { lean, pivot } = t.seat(0.73);
  t.block(
    [
      [0.18, 0.7],
      [0.23, 0.75],
      [0.17, 0.79],
    ],
    2,
    228,
    lean,
  );
  t.gem(
    [
      new THREE.Vector3(0, 0.76, 0),
      ...t.ring(0.16, 0.89, 6),
      ...t.ring(0.095, 1.035, 6),
    ],
    lean,
  );
  // Upward interceptor forks carry the anti-air role, even without attack animation.
  for (const side of [-1, 1]) {
    const z = side * 0.2;
    e.bolt(
      lean,
      [
        [0, 0.77, z],
        [0.015, 0.96, side * 0.255],
        [0.035, 1.085, side * 0.18],
      ],
      0.035,
      s.variant === "lapis" ? "#83b9e8" : "#d9d6f0",
    );
    e.beam(
      lean,
      [0.015, 0.96, side * 0.255],
      [0.02, 1.04, side * 0.29],
      0.025,
      "#d5e5ef",
    );
    t.solid(
      [
        point(side > 0 ? Math.PI / 2 : -Math.PI / 2, 0.17, 0.77, -0.04),
        point(side > 0 ? Math.PI / 2 : -Math.PI / 2, 0.17, 0.77, 0.04),
        point(side > 0 ? Math.PI / 2 : -Math.PI / 2, 0.29, 0.87, -0.02),
        point(side > 0 ? Math.PI / 2 : -Math.PI / 2, 0.29, 0.87, 0.02),
        point(side > 0 ? Math.PI / 2 : -Math.PI / 2, 0.21, 0.92, 0),
      ],
      1,
      229,
      lean,
    );
  }
  if (s.variant === "jubilee") {
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3;
      e.shard(
        lean,
        0.13 * Math.cos(a),
        0.77,
        0.13 * Math.sin(a),
        0.045,
        0.25,
        "#ee9a4f",
      );
    }
    e.halo(lean, 0.22, 0.81, 0.03, "#f2bf64", 6);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    e.bolt(
      undefined,
      [point(a, 0.175, 0.31), point(a, 0.14, 0.51), point(a, 0.225, 0.63)],
      0.028,
      "#b3a7c5",
    );
  }
  return [pivot];
}

function pinkDiamond(t, s) {
  t.block(
    [
      [0.25, 0.2],
      [0.25, 0.25],
      [0.19, 0.29],
    ],
    1,
    230,
  );
  t.block(
    [
      [0.17, 0.27],
      [0.11, 0.55],
      [0.19, 0.65],
    ],
    0,
    231,
  );
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    t.solid(
      [
        [0.21, 0.27, 0.045],
        [0.18, 0.45, 0.035],
        [0.13, 0.58, 0.025],
      ].flatMap(([r, y, w]) =>
        [r - 0.025, r + 0.025].flatMap((rad) =>
          [-w, w].map((v) => point(a, rad, y, v)),
        ),
      ),
      0,
      232 + i,
    );
  }
  t.block(
    [
      [0.18, 0.62],
      [0.27, 0.69],
      [0.23, 0.72],
    ],
    1,
    236,
  );
  if (s.stage)
    t.block(
      [
        [0.18, 0.46],
        [0.19, 0.49],
        [0.17, 0.52],
      ],
      1,
      237,
    );

  const e = effectTools(t),
    { lean, pivot } = t.seat(0.73);
  t.block(
    [
      [0.17, 0.7],
      [0.24, 0.75],
      [0.19, 0.79],
    ],
    2,
    238,
    lean,
  );
  const width = s.stage ? 0.255 : 0.22;
  // Broad cutting faces and a heavy spine read as a critical strike rather than a decorative heart.
  t.gem(
    [-0.045, 0.045]
      .flatMap((x) =>
        [
          [-width, 0.99],
          [width, 0.99],
          [width * 0.7, 0.9],
          [0, 0.76],
          [-width * 0.7, 0.9],
        ].map(([z, y]) => new THREE.Vector3(x, y, z)),
      )
      .concat(new THREE.Vector3(0.125, 0.93, 0)),
    lean,
  );
  e.beam(lean, [-0.08, 1.01, -width], [-0.08, 1.01, width], 0.06, "#6c7171");
  for (const z of [-width, width])
    e.shard(
      lean,
      -0.02,
      0.88,
      z,
      0.04,
      0.19,
      s.variant === "kohinoor" ? "#dceef1" : "#e8adc9",
      4,
    );
  if (s.stage) {
    t.grips(
      lean,
      4,
      [
        [0.14, 0.18, 0.74, 0.03],
        [0.25, 0.28, 0.88, 0.022],
      ],
      2,
      Math.PI / 4,
    );
    if (s.variant !== "kohinoor")
      for (const z of [-0.15, 0.15])
        e.shard(lean, 0.09, 0.78, z, 0.025, 0.13, "#c8e7ee", 4);
  }
  if (s.variant === "kohinoor") {
    for (const side of [-1, 1])
      e.plate(
        undefined,
        [
          [side * 0.08, -0.1],
          [side * 0.24, -0.12],
          [side * 0.25, 0.1],
          [side * 0.13, 0.08],
        ],
        0.36,
        0.025,
        "#8c9391",
      );
  }
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    e.bolt(
      undefined,
      [point(a, 0.225, 0.3), point(a, 0.205, 0.45), point(a, 0.16, 0.57)],
      0.028,
      "#bc829d",
    );
  }
  return [pivot];
}

function bloodstone(t, s) {
  t.block(
    [
      [0.25, 0.2],
      [0.25, 0.25],
      [0.17, 0.3],
    ],
    1,
    240,
  );
  t.block(
    [
      [0.15, 0.28],
      [0.125, 0.54],
      [0.21, 0.63],
    ],
    0,
    241,
  );
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    t.solid(
      [
        [0.145, 0.31, 0.024],
        [0.135, 0.52, 0.018],
        [0.2, 0.61, 0.022],
      ].flatMap(([r, y, w]) =>
        [r - 0.015, r + 0.015].flatMap((rad) =>
          [-w, w].map((v) => point(a, rad, y, v)),
        ),
      ),
      0,
      242 + i,
    );
  }
  t.block(
    [
      [0.2, 0.6],
      [0.265, 0.67],
      [0.235, 0.71],
    ],
    1,
    248,
  );
  if (s.stage)
    t.block(
      [
        [0.17, 0.42],
        [0.19, 0.46],
        [0.16, 0.49],
      ],
      1,
      249,
    );

  const e = effectTools(t),
    { lean, pivot } = t.seat(0.72);
  t.block(
    [
      [0.18, 0.69],
      [0.23, 0.75],
      [0.18, 0.79],
    ],
    2,
    250,
    lean,
  );
  t.gem(
    [...t.ring(0.13, 0.77), ...t.ring(0.18, 0.88), ...t.ring(0.1, 1.035)],
    lean,
  );
  const terminals = s.variant === "prince" ? 4 : s.stage ? 3 : 2;
  for (let i = 0; i < terminals; i++) {
    const a = (i * Math.PI * 2) / terminals;
    const p = point(a, 0.24, 0.85);
    e.beam(lean, point(a, 0.18, 0.75), point(a, 0.24, 1.015), 0.04, "#858d8d");
    e.shard(
      lean,
      p.x,
      1.0,
      p.z,
      0.04,
      0.08,
      s.stage ? "#f2b46b" : "#d8eaf4",
      4,
    );
  }
  for (const side of [-1, 1])
    e.bolt(
      lean,
      [
        [0.205, 1.02, side * 0.2],
        [0.205, 0.955, side * 0.065],
        [0.205, 0.98, side * 0.12],
        [0.205, 0.86, 0],
      ],
      0.018,
      "#b3def2",
    );
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3;
    e.beam(
      undefined,
      point(a, 0.15, 0.32),
      point(a, 0.15, 0.57),
      0.02,
      "#91b9c7",
    );
  }
  if (s.variant === "prince") {
    e.halo(lean, 0.23, 0.79, 0.025, "#cc6b45", 6);
    for (const z of [-0.12, 0.12])
      e.shard(lean, 0.12, 0.78, z, 0.025, 0.13, "#89b873", 4);
  }
  return [pivot];
}

function uranium(t, s) {
  t.block(
    [
      [0.25, 0.2],
      [0.25, 0.25],
      [0.2, 0.28],
    ],
    1,
    260,
  );
  t.block(
    [
      [0.09, 0.26],
      [0.09, 0.62],
    ],
    2,
    261,
  );
  const posts = s.stage ? 5 : 3;
  for (let i = 0; i < posts; i++) {
    const a = (i * 2 * Math.PI) / posts;
    t.solid(
      [
        [0.19, 0.28, 0.045],
        [0.19, 0.57, 0.035],
        [0.15, 0.65, 0.035],
      ].flatMap(([r, y, w]) =>
        [r - 0.025, r + 0.025].flatMap((rad) =>
          [-w, w].map((v) => point(a, rad, y, v)),
        ),
      ),
      0,
      262 + i,
    );
  }
  t.block(
    [
      [0.2, 0.6],
      [0.27, 0.66],
      [0.235, 0.7],
    ],
    1,
    268,
  );
  if (s.stage)
    t.block(
      [
        [0.22, 0.4],
        [0.23, 0.435],
        [0.21, 0.46],
      ],
      1,
      269,
    );

  const e = effectTools(t),
    { lean, pivot } = t.seat(0.72);
  t.block(
    [
      [0.19, 0.69],
      [0.24, 0.75],
      [0.2, 0.78],
    ],
    2,
    270,
    lean,
  );
  t.gem(
    [...t.ring(0.1, 0.76), ...t.ring(0.13, 0.94), ...t.ring(0.07, 1.055)],
    lean,
  );
  const ports = 12;
  for (let i = 0; i < ports; i++) {
    const a = (i * 2 * Math.PI) / ports;
    const inner = point(a, 0.14, 0.82),
      outer = point(a, 0.28, 0.91 + (i % 2) * 0.02);
    e.beam(lean, inner, outer, 0.045, "#747c78");
    e.shard(
      lean,
      outer.x,
      outer.y - 0.02,
      outer.z,
      0.028,
      0.07,
      s.variant === "depleted" ? "#9ed7c7" : "#c4d97a",
      4,
    );
  }
  e.halo(
    lean,
    0.25,
    0.78,
    0.035,
    s.variant === "depleted" ? "#68b9b8" : "#93b65e",
    8,
  );
  if (s.stage)
    e.halo(
      undefined,
      0.225,
      0.43,
      0.025,
      s.variant === "depleted" ? "#72b3b3" : "#b3c16a",
      6,
    );
  return [pivot];
}

export const combinedBuildersA = {
  ruby,
  jade,
  quartz,
  "pink-diamond": pinkDiamond,
  bloodstone,
  uranium,
};
