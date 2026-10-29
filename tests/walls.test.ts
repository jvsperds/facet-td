import * as THREE from 'three';
import { expect, test } from 'vitest';
import {
  CHAMFER,
  HALF_BAND,
  TURRET_TOP,
  WALL_TOP,
  cellKey,
  filledAtPoint,
  insetAt,
  joins,
  wallMesh,
  wallParts,
  wallRaster,
  type Occupancy,
  type WallParts,
} from '../src/world/walls';
import type { Cell } from '../src/sim/board';

// Issue #9: diagonal runs, clean corners, continuous sections, merlons only on outer faces;
// towers stand on the wall and join it like stones.

const occupancy = (stones: Cell[], towers: Cell[] = []): Occupancy =>
  new Map([
    ...stones.map((c) => [cellKey(c), 'stone'] as const),
    ...towers.map((c) => [cellKey(c), 'tower'] as const),
  ]);
const partsOf = (occ: Occupancy) => {
  const r = wallRaster(occ);
  const all: WallParts = { walk: [], faces: [], steps: [], merlons: [] };
  for (const k of occ.keys()) {
    const p = wallParts(r, { x: k % 64, y: Math.floor(k / 64) });
    all.walk.push(...p.walk);
    all.faces.push(...p.faces);
    all.merlons.push(...p.merlons);
    all.steps.push(...p.steps);
  }
  return all;
};
const area = (p: WallParts) =>
  p.walk.reduce((sum, { points: [a, b, c] }) => {
    return sum + Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
  }, 0);
const faceLength = (p: WallParts) =>
  p.faces.reduce((sum, f) => sum + Math.hypot(f.to[0] - f.from[0], f.to[1] - f.from[1]), 0);

test('a solid 4x4 block is one walkway with merlons on its outer faces only', () => {
  const stones: Cell[] = [];
  for (let x = 10; x < 14; x++) for (let y = 10; y < 14; y++) stones.push({ x, y });
  const p = partsOf(occupancy(stones));
  // The four outer corners are bevelled by a quarter cell; nothing else is cut.
  const bevel = 0.25 * 0.25 * 0.5;
  expect(area(p)).toBeCloseTo(16 - 4 * bevel);
  // The block's perimeter with bevelled corners: no interior faces.
  expect(faceLength(p)).toBeCloseTo(16 - 4 * 0.5 + 4 * 0.25 * Math.SQRT2);
  // One merlon per quarter-cell edge of the perimeter, one per corner bevel.
  expect(p.merlons).toHaveLength(4 * 14 + 4);
  for (const m of p.merlons) {
    const toEdge = Math.min(m.x - 9.5, 13.5 - m.x, m.y - 9.5, 13.5 - m.y);
    expect(toEdge).toBeLessThan(0.2);
  }
});

test('a diagonal run is one straight 45 degree wall, as wide as a straight wall', () => {
  const stones = [0, 1, 2, 3].map((i) => ({ x: 10 + i, y: 10 + i }));
  const occ = occupancy(stones);
  expect(joins(occ, stones[1]).diagonal).toEqual([
    [1, 1],
    [-1, -1],
  ]);
  const p = partsOf(occ);
  // Side faces run along the diagonal on the lines x - y = ±0.75: 1.06 cells apart, matching the
  // 1.0-wide straight walls as closely as the quarter-cell lattice allows.
  const sides = p.faces.filter((f) => Math.abs(f.nx + f.ny) < 1e-9);
  expect(sides.length).toBeGreaterThan(0);
  for (const f of sides) expect(Math.abs(f.from[0] - f.from[1])).toBeCloseTo(0.75);
  expect(2 * HALF_BAND).toBeCloseTo(1.06, 2);
  // Only the two rounded end caps leave the side lines.
  const caps = p.faces.filter((f) => Math.abs(f.nx + f.ny) >= 1e-9);
  for (const f of caps) {
    const nearEnd = [f.from, f.to].every(
      ([x, y]) => Math.hypot(x - 10, y - 10) < 0.8 || Math.hypot(x - 13, y - 13) < 0.8,
    );
    expect(nearEnd).toBe(true);
  }
  // The wall is continuous across the shared corners: the corner point lies inside the walkway.
  const corner = [10.5, 10.5];
  const covering = p.walk.filter(({ points }) =>
    points.some(([x, y]) => Math.abs(x - corner[0]) < 1e-9 && Math.abs(y - corner[1]) < 1e-9),
  );
  expect(covering.length).toBeGreaterThanOrEqual(4);
  expect(p.merlons.length).toBeGreaterThan(0);
});

test('a diagonal turn meets cleanly, and an L corner keeps a crisp inner corner', () => {
  const v = occupancy([
    { x: 10, y: 10 },
    { x: 11, y: 11 },
    { x: 12, y: 10 },
  ]);
  // The two bands meet at the peak: the V's inside stays open, its arms are filled.
  const rv = wallRaster(v);
  expect(filledAtPoint(rv, 11, 10.2)).toBe(false);
  expect(filledAtPoint(rv, 10.5, 10.5)).toBe(true);
  expect(filledAtPoint(rv, 11.5, 10.5)).toBe(true);

  const l = occupancy([
    { x: 10, y: 10 },
    { x: 11, y: 10 },
    { x: 11, y: 11 },
  ]);
  expect(joins(l, { x: 10, y: 10 }).diagonal).toEqual([]);
  const q = partsOf(l);
  // Five free outer corners are bevelled; the inner corner (10.5, 10.5) is not filled.
  expect(area(q)).toBeCloseTo(3 - 5 * 0.25 * 0.25 * 0.5);
  expect(filledAtPoint(wallRaster(l), 10.45, 10.55)).toBe(false);
});

test('a straight wall turns into a diagonal without a step', () => {
  // A wall running north from (10, 8) to (10, 11), then diagonally north-west.
  const stones = [8, 9, 10, 11].map((y) => ({ x: 10, y }));
  stones.push({ x: 9, y: 12 }, { x: 8, y: 13 });
  const p = partsOf(occupancy(stones));
  // No face of the bend cell faces straight north: its top is the diagonal's edge.
  const step = p.faces.filter(
    (f) => Math.abs(f.ny - 1) < 1e-9 && f.from[1] === 11.5 && f.from[0] >= 9.5 && f.to[0] <= 10.5,
  );
  expect(step).toEqual([]);
  // East of the bend, the vertical face continues straight into the band's edge.
  expect(filledAtPoint(wallRaster(occupancy(stones)), 10.4, 11.3)).toBe(true);
  expect(filledAtPoint(wallRaster(occupancy(stones)), 10.45, 11.4)).toBe(false);
});

test('towers stand in turrets: joined like stones, one course taller, crenellated', () => {
  const occ = occupancy(
    [
      { x: 10, y: 10 },
      { x: 12, y: 10 },
    ],
    [
      { x: 11, y: 10 },
      { x: 13, y: 11 },
    ],
  );
  // The stone at (12, 10) joins the tower at (13, 11) along the diagonal.
  expect(joins(occ, { x: 12, y: 10 }).diagonal).toEqual([[1, 1]]);
  const r = wallRaster(occ);
  const turret = wallParts(r, { x: 11, y: 10 });
  expect(turret.walk.every((w) => w.top === TURRET_TOP)).toBe(true);
  // Brick steps rise from the wall walk on both sides, where the stones meet the turret.
  expect(turret.steps.length).toBeGreaterThan(0);
  for (const st of turret.steps) expect([st.low, st.high]).toEqual([WALL_TOP, TURRET_TOP]);
  expect(turret.steps.some((st) => st.nx === -1)).toBe(true);
  expect(turret.steps.some((st) => st.nx === 1)).toBe(true);
  // Its outer faces reach the turret top and carry merlons there.
  expect(turret.faces.every((f) => f.top === TURRET_TOP)).toBe(true);
  expect(turret.merlons.length).toBeGreaterThan(0);
  expect(turret.merlons.every((m) => m.top === TURRET_TOP)).toBe(true);
  // Stone cells keep the ordinary wall height.
  expect(wallParts(r, { x: 10, y: 10 }).walk.every((w) => w.top === WALL_TOP)).toBe(true);
  // Turret meshes top out one course above the wall's merlons.
  const mesh = wallMesh(r, { x: 11, y: 10 }, new THREE.MeshStandardMaterial())!;
  mesh.geometry.computeBoundingBox();
  expect(mesh.geometry.boundingBox!.max.y).toBeCloseTo(TURRET_TOP + 0.09);
});

test('wall meshes are finite, outward-facing and only exist for stones', () => {
  const stones = [
    { x: 5, y: 5 },
    { x: 6, y: 6 },
    { x: 6, y: 5 },
    { x: 20, y: 20 },
  ];
  const r = wallRaster(occupancy(stones));
  const material = new THREE.MeshStandardMaterial();
  for (const c of stones) {
    const mesh = wallMesh(r, c, material)!;
    const position = mesh.geometry.getAttribute('position');
    expect(position.array.every(Number.isFinite)).toBe(true);
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox!;
    expect(box.min.y).toBeCloseTo(0);
    expect(box.max.y).toBeCloseTo(0.38);
  }
  expect(wallMesh(r, { x: 7, y: 7 }, material)).toBeNull();
});

test('outer top edges are chamfered a little and mitred at corners; interiors stay flat', () => {
  const stones: Cell[] = [];
  for (let x = 10; x < 14; x++) for (let y = 10; y < 14; y++) stones.push({ x, y });
  const r = wallRaster(occupancy(stones));
  // Middle of the west face: straight inward by the chamfer.
  const [x, y] = insetAt(r, 9.5, 11.5);
  expect(x).toBeCloseTo(9.5 + CHAMFER);
  expect(y).toBeCloseTo(11.5);
  // Where the face meets the corner bevel: mitred, moving inward on both axes' sides.
  const corner = insetAt(r, 9.5, 9.75);
  expect(corner[0]).toBeGreaterThan(9.5);
  expect(corner[1]).toBeGreaterThan(9.75);
  expect(filledAtPoint(r, ...corner)).toBe(true);
  // Interior vertex: untouched.
  expect(insetAt(r, 11.5, 11.5)).toEqual([11.5, 11.5]);

  // A diagonal band's side moves perpendicular to the run.
  const band = wallRaster(occupancy([0, 1, 2].map((i) => ({ x: 20 + i, y: 20 + i }))));
  const side = insetAt(band, 20.5, 21.25); // on the band's north-west side, x - y = -0.75
  expect(side[0] - 20.5).toBeCloseTo(CHAMFER / Math.SQRT2);
  expect(side[1] - 21.25).toBeCloseTo(-CHAMFER / Math.SQRT2);
  expect(filledAtPoint(band, ...side)).toBe(true);

  // The mesh still tops out at 0.38 and its walkway corners sit inside the footprint.
  const mesh = wallMesh(r, { x: 10, y: 10 }, new THREE.MeshStandardMaterial())!;
  mesh.geometry.computeBoundingBox();
  expect(mesh.geometry.boundingBox!.max.y).toBeCloseTo(0.38);
});
