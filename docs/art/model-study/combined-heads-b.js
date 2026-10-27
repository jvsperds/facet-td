import * as THREE from "three";
import { effectTools } from "./combined-effect-shapes.js";

const point = (x, y, z) => new THREE.Vector3(x, y, z);
const tint = (hex) => () => new THREE.Color(hex).toArray();

function darkEmerald(t, s) {
  const { block, solid, gem, seat, grips } = t;
  block(
    [
      [0.3, 0.2],
      [0.27, 0.29],
      [0.21, 0.34],
    ],
    1,
    201,
  );
  for (const x of [-0.16, 0.16])
    solid(
      [-0.06, 0.06].flatMap((z) => [
        point(x - 0.06, 0.3, z),
        point(x + 0.06, 0.3, z),
        point(x - 0.045, 0.62, z),
        point(x + 0.045, 0.62, z),
      ]),
      0,
      202 + (x > 0 ? 1 : 0),
    );
  block(
    [
      [0.14, 0.58],
      [0.25, 0.65],
      [0.2, 0.7],
    ],
    1,
    204,
  );

  const { lean, pivot } = seat(0.71),
    fx = effectTools(t);
  block(
    [
      [0.15, 0.69],
      [0.21, 0.74],
      [0.17, 0.78],
    ],
    2,
    205,
    lean,
  );
  if (s.variant === "golem") {
    const outline = [
      [-0.24, 0.94],
      [-0.15, 1.04],
      [0, 1.075],
      [0.15, 1.04],
      [0.24, 0.94],
      [0, 0.82],
    ];
    gem(
      [-0.04, 0.06].flatMap((x) => outline.map(([z, y]) => point(x, y, z))),
      lean,
      tint("#697a6d"),
    );
    gem(
      [0.075, 0.12].flatMap((x) =>
        Array.from({ length: 8 }, (_, i) =>
          point(
            x,
            0.945 + 0.075 * Math.cos((i * Math.PI) / 4),
            0.065 * Math.sin((i * Math.PI) / 4),
          ),
        ),
      ),
      lean,
      tint("#b0d18a"),
    );
    fx.beam(lean, [0.14, 0.89, 0], [0.14, 1.0, 0], 0.022, "#173e2a");
    for (const side of [-1, 1])
      solid(
        [
          [0.27, 0.77, 0.05],
          [0.27, 0.91, 0.045],
          [0.19, 1.01, 0.025],
        ].flatMap(([z, y, w]) =>
          [-w, w].flatMap((x) =>
            [-0.025, 0.025].map((d) => point(x, y, side * (z + d))),
          ),
        ),
        0,
        206,
        lean,
      );
  } else {
    // An exposed emerald hammer strikes the small anvil; the stone setting no longer hides its head.
    gem(
      [-0.1, 0.1]
        .flatMap((z) => [
          point(-0.21, 0.88, z),
          point(0.21, 0.88, z),
          point(-0.18, 1.065, z),
          point(0.18, 1.065, z),
        ])
        .concat(point(0, 0.78, 0)),
      lean,
      tint("#2e6b4b"),
    );
    fx.beam(lean, [-0.1, 0.76, 0], [-0.1, 0.91, 0], 0.055, "#777f79");
    for (const side of [-1, 1])
      fx.beam(
        lean,
        [-0.06, 0.76, side * 0.19],
        [-0.06, 1.01, side * 0.19],
        0.035,
        "#929b92",
      );
  }
  // Iron cuffs sit on the pier faces, leaving the open centre clear.
  for (const x of [-0.16, 0.16])
    for (const z of [-0.069, 0.069])
      for (const y of [0.38, 0.55])
        fx.beam(
          undefined,
          [x - 0.048, y, z],
          [x + 0.048, y, z],
          0.024,
          "#46564e",
        );
  return [pivot];
}

function yellowSapphire(t, s) {
  const { block, solid, gem, seat, grips } = t,
    fx = effectTools(t);
  block(
    [
      [0.29, 0.2],
      [0.26, 0.28],
      [0.2, 0.33],
    ],
    1,
    211,
  );
  for (const x of [-0.18, 0.18])
    solid(
      [-0.06, 0.06].flatMap((z) => [
        point(x - 0.05, 0.31, z),
        point(x + 0.05, 0.31, z),
        point(x - 0.04, 0.62, z),
        point(x + 0.04, 0.62, z),
      ]),
      0,
      212 + (x > 0 ? 1 : 0),
    );
  block(
    [
      [0.14, 0.59],
      [0.25, 0.66],
      [0.21, 0.7],
    ],
    1,
    214,
  );
  const { lean, pivot } = seat(0.71);
  grips(lean, 3, [[0.13, 0.23, 0.72, 0.024]], 2, Math.PI / 6);
  if (s.variant === "saber") {
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3;
      fx.beam(
        lean,
        [0.12 * Math.cos(a), 0.79, 0.12 * Math.sin(a)],
        [0.27 * Math.cos(a), 0.91, 0.27 * Math.sin(a)],
        0.055,
        "#b8eff1",
      );
      fx.shard(
        lean,
        0.28 * Math.cos(a),
        0.87,
        0.28 * Math.sin(a),
        0.055,
        0.1,
        "#d7f9fb",
        4,
      );
    }
    gem(
      [...t.ring(0.15, 0.78, 6), ...t.ring(0.16, 0.88, 6), point(0, 1.02, 0)],
      lean,
      tint("#5b8fd8"),
    );
  } else if (s.variant === "star") {
    fx.halo(lean, 0.29, 0.88, 0.035, "#bdeff5", 8);
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI * 2) / 6;
      fx.beam(
        lean,
        [0, 0.87, 0],
        [0.3 * Math.cos(a), 1.01, 0.3 * Math.sin(a)],
        0.045,
        "#d8fbff",
      );
    }
    gem(
      [...t.ring(0.12, 0.78, 6), ...t.ring(0.16, 0.89, 6), point(0, 1.04, 0)],
      lean,
      tint("#4c7bcf"),
    );
  } else {
    fx.halo(lean, 0.28, 0.8, 0.04, "#c7f7f8", 6);
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      fx.shard(
        lean,
        0.18 * Math.cos(a),
        0.78,
        0.18 * Math.sin(a),
        0.06,
        0.23,
        "#b8ebef",
        4,
      );
    }
    gem(
      [...t.ring(0.12, 0.77, 6), ...t.ring(0.15, 0.88, 6), point(0, 1.03, 0)],
      lean,
      tint("#e8bf35"),
    );
  }
  for (const x of [-0.18, 0.18])
    for (const z of [-0.069, 0.069]) {
      fx.beam(undefined, [x, 0.35, z], [x, 0.61, z], 0.026, "#a4d4dd");
      fx.beam(
        undefined,
        [x - 0.035, 0.4, z],
        [x + 0.035, 0.4, z],
        0.023,
        "#dbeaed",
      );
    }
  return [pivot];
}

function paraiba(t, s) {
  const { block, solid, gem, seat, grips } = t,
    fx = effectTools(t);
  block(
    [
      [0.3, 0.2],
      [0.27, 0.29],
      [0.2, 0.34],
    ],
    1,
    221,
  );
  for (const x of [-0.19, 0.19])
    solid(
      [-0.065, 0.065].flatMap((z) => [
        point(x - 0.05, 0.31, z),
        point(x + 0.05, 0.31, z),
        point(x - 0.04, 0.61, z),
        point(x + 0.04, 0.61, z),
      ]),
      0,
      222 + (x > 0 ? 1 : 0),
    );
  block(
    [
      [0.22, 0.58],
      [0.27, 0.65],
      [0.17, 0.7],
    ],
    1,
    224,
  );
  const { lean, pivot } = seat(0.71);
  grips(lean, 2, [[0.1, 0.2, 0.73, 0.025]], 2, 0);
  const adam = s.variant === "adam";
  gem(
    [...t.ring(0.13, 0.78, 6), ...t.ring(0.16, 0.89, 6), point(0, 1.04, 0)],
    lean,
    tint(adam ? "#4f87d6" : "#43c2bd"),
  );
  const count = s.variant === "carved" ? 6 : 4;
  for (let i = 0; i < count; i++) {
    const a = (i * Math.PI * 2) / count + Math.PI / 8,
      r = s.variant === "carved" ? 0.27 : 0.25;
    fx.plate(
      lean,
      [
        [(r - 0.07) * Math.cos(a), (r - 0.07) * Math.sin(a)],
        [(r + 0.07) * Math.cos(a), (r + 0.07) * Math.sin(a)],
        [(r + 0.02) * Math.cos(a + 0.32), (r + 0.02) * Math.sin(a + 0.32)],
      ],
      0.86 + (i & 1) * 0.08,
      0.04,
      adam ? "#9ce9f0" : "#74d8d1",
    );
  }
  if (adam) {
    fx.halo(lean, 0.29, 0.84, 0.028, "#b6f1f7", 6);
    for (let i = 0; i < 3; i++)
      fx.shard(
        lean,
        0.2 * Math.cos(i * 2.1),
        0.79,
        0.2 * Math.sin(i * 2.1),
        0.045,
        0.12,
        "#8baa42",
        4,
      );
  }
  for (const x of [-0.18, 0.18])
    for (const z of [-0.069, 0.069])
      fx.bolt(
        undefined,
        [
          [x - 0.025, 0.35, z],
          [x + 0.02, 0.43, z],
          [x - 0.02, 0.5, z],
          [x + 0.025, 0.59, z],
        ],
        0.025,
        "#63b9b1",
      );
  return [pivot];
}

function catEye(t, s) {
  const { block, solid, gem, seat } = t,
    fx = effectTools(t);
  block(
    [
      [0.27, 0.2],
      [0.23, 0.28],
      [0.15, 0.44],
    ],
    1,
    231,
  );
  for (const x of [-0.14, 0.14])
    solid(
      [-0.06, 0.06].flatMap((z) => [
        point(x - 0.05, 0.4, z),
        point(x + 0.05, 0.4, z),
        point(x - 0.035, 0.67, z),
        point(x + 0.035, 0.67, z),
      ]),
      0,
      232 + (x > 0 ? 1 : 0),
    );
  block(
    [
      [0.18, 0.64],
      [0.23, 0.69],
      [0.17, 0.73],
    ],
    1,
    234,
  );
  const { lean, pivot } = seat(0.74);
  if (s.variant === "coral" || s.variant === "carmen") {
    const arms = s.variant === "carmen" ? 6 : 4;
    for (let i = 0; i < arms; i++) {
      const a = (i * Math.PI * 2) / arms;
      fx.bolt(
        lean,
        [
          [0, 0.78, 0],
          [0.15 * Math.cos(a), 0.88, 0.15 * Math.sin(a)],
          [
            0.27 * Math.cos(a + 0.18),
            s.variant === "carmen" ? 1.02 : 0.98,
            0.27 * Math.sin(a + 0.18),
          ],
        ],
        s.variant === "carmen" ? 0.06 : 0.075,
        s.variant === "carmen" ? "#bb3556" : "#d15c59",
      );
    }
    fx.halo(
      lean,
      s.variant === "carmen" ? 0.3 : 0.25,
      0.83,
      0.035,
      "#f0a7a2",
      arms,
    );
    if (s.variant === "carmen") fx.halo(lean, 0.2, 0.99, 0.028, "#e46a80", 6);
  } else {
    fx.plate(
      lean,
      [
        [-0.28, -0.07],
        [-0.2, -0.13],
        [0.2, -0.13],
        [0.28, -0.07],
        [0.28, 0.07],
        [0.2, 0.13],
        [-0.2, 0.13],
        [-0.28, 0.07],
      ],
      0.84,
      0.07,
      "#9b9e55",
    );
    gem(
      [
        point(-0.18, 0.82, -0.11),
        point(0.18, 0.82, -0.11),
        point(0.18, 0.82, 0.11),
        point(-0.18, 0.82, 0.11),
        point(0, 0.98, 0),
      ],
      lean,
      tint("#d9d56a"),
    );
    fx.beam(lean, [0, 0.86, -0.13], [0, 0.86, -0.31], 0.05, "#25242a");
    fx.halo(lean, 0.29, 0.81, 0.025, "#d9d56a", 8);
  }
  for (const x of [-0.14, 0.14])
    for (const z of [-0.069, 0.069])
      fx.beam(undefined, [x, 0.44, z], [x, 0.64, z], 0.025, "#bd9f68");
  return [pivot];
}

function gold(t, s) {
  const { block, solid, gem, seat } = t,
    fx = effectTools(t);
  block(
    [
      [0.28, 0.2],
      [0.27, 0.25],
      [0.2, 0.29],
    ],
    1,
    241,
  );
  for (const side of [-1, 1])
    solid(
      [0.29, 0.63].flatMap((y) =>
        [-0.07, 0.07].flatMap((x) =>
          [-0.055, 0.055].map((z) => point(x, y, side * 0.15 + z)),
        ),
      ),
      0,
      242,
    );
  block(
    [
      [0.2, 0.61],
      [0.27, 0.67],
      [0.23, 0.71],
    ],
    1,
    243,
  );
  const { lean, pivot } = seat(0.72);
  for (const side of [-1, 1]) {
    const outline = [
      [side * 0.06, 0.77],
      [side * 0.23, 0.79],
      [side * 0.21, 0.94],
      [side * 0.09, 0.91],
    ];
    solid(
      [0.035, 0.085].flatMap((x) => outline.map(([z, y]) => point(x, y, z))),
      2,
      244,
      lean,
    );
  }
  gem(
    [-0.05, 0.03]
      .flatMap((x) => [
        point(x, 1.08, -0.16),
        point(x, 1.08, 0.16),
        point(x, 0.91, 0.12),
        point(x, 0.79, 0),
        point(x, 0.91, -0.12),
      ])
      .concat(point(0.12, 0.98, 0)),
    lean,
    tint("#e1af3d"),
  );
  fx.beam(lean, [-0.09, 1.085, -0.17], [-0.09, 1.085, 0.17], 0.045, "#b48b35");
  if (s.variant === "egypt") {
    fx.beam(lean, [-0.13, 0.86, -0.25], [-0.13, 0.86, 0.25], 0.025, "#e0bb57");
    for (const side of [-1, 1]) {
      fx.beam(
        lean,
        [-0.13, 0.86, side * 0.23],
        [-0.13, 0.75, side * 0.23],
        0.015,
        "#e0bb57",
      );
      fx.plate(
        lean,
        [
          [-0.19, side * 0.18],
          [-0.07, side * 0.18],
          [-0.07, side * 0.28],
          [-0.19, side * 0.28],
        ],
        0.75,
        0.018,
        "#dbb152",
      );
    }
    gem(
      [...t.ring(0.07, 0.39, 8), ...t.ring(0.07, 0.42, 8)],
      undefined,
      tint("#deb34b"),
    );
  }
  for (const z of [-0.15, 0.15])
    for (const x of [-0.079, 0.079]) {
      fx.beam(undefined, [x, 0.33, z], [x, 0.6, z], 0.025, "#c3a05b");
      fx.beam(
        undefined,
        [x, 0.38, z - 0.047],
        [x, 0.38, z + 0.047],
        0.024,
        "#ddbd76",
      );
    }
  return [pivot];
}

function pearl(t, s) {
  const { block, gem, seat, grips } = t,
    fx = effectTools(t);
  block(
    [
      [0.29, 0.2],
      [0.25, 0.28],
      [0.18, 0.35],
      [0.14, 0.57],
      [0.25, 0.65],
    ],
    1,
    251,
  );
  const { lean, pivot } = seat(0.72);
  grips(lean, 5, [[0.13, 0.23, 0.74, 0.022]], 2, Math.PI / 5);
  if (s.variant === "zumurud") {
    gem(
      [...t.ring(0.13, 0.78, 5), ...t.ring(0.16, 0.89, 5), point(0, 1.05, 0)],
      lean,
      tint("#21855a"),
    );
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 3,
        x = 0.27 * Math.cos(a),
        z = 0.27 * Math.sin(a);
      gem(
        [
          ...t.ring(0.052, 0.82, 4).map((p) => p.add(point(x, 0, z))),
          point(x, 0.92, z),
        ],
        lean,
        tint(["#e9c95d", "#8fcfdf", "#c7a1db"][i]),
      );
      fx.beam(lean, [x, 0.85, z], [0, 0.92, 0], 0.035, "#7be6a1");
    }
  } else {
    gem(
      [...t.ring(0.12, 0.78, 8), ...t.ring(0.17, 0.88, 8), point(0, 1.02, 0)],
      lean,
      tint("#eee5d5"),
    );
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5;
      gem(
        [
          [0.26, 0.8],
          [0.27, 0.9],
          [0.08, 1.07],
        ].flatMap(([r, y]) =>
          [a - 0.3, a + 0.3].flatMap((angle) =>
            [r, r - 0.022].map((radius) =>
              point(radius * Math.cos(angle), y, radius * Math.sin(angle)),
            ),
          ),
        ),
        lean,
        tint(i % 2 ? "#e8efe9" : "#d2e7e8"),
      );
    }
    fx.halo(lean, 0.25, 0.78, 0.022, "#b9dce5", 8);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI * 2) / 6;
    fx.beam(
      undefined,
      [0.252 * Math.cos(a), 0.36, 0.252 * Math.sin(a)],
      [0.252 * Math.cos(a), 0.57, 0.252 * Math.sin(a)],
      0.032,
      s.variant === "zumurud" ? "#72b79b" : "#c8d5d2",
    );
  }
  return [pivot];
}

export const combinedBuildersB = {
  "dark-emerald": darkEmerald,
  "yellow-sapphire": yellowSapphire,
  paraiba,
  "cat-eye": catEye,
  gold,
  pearl,
};
