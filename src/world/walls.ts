import * as THREE from 'three';
import { BOARD_SIZE, type Cell } from '../sim/board';

// Board castle walls (issue #9). The wall network is one footprint shared by every stone and tower
// cell (towers stand on the wall):
// - orthogonal neighbours join edge to edge, so straight runs and solid blocks merge;
// - cells that touch only diagonally (both orthogonal cells free) are joined by a 45° band, so
//   diagonal mazes read as one wall running along the diagonal instead of corner-touching blocks;
// - corners no neighbour fills are bevelled by a quarter cell, flush with any diagonal band's edge,
//   so a straight wall turns diagonal without a step; diagonal and straight walls share a width.
// The footprint is rasterised onto a quarter-cell lattice of triangles (each 0.25 square split by
// both diagonals); every footprint edge lies on that lattice, so each triangle is fully in or out.
// Faces and merlons sit only on edges between filled and free triangles: the outer faces of the
// union. Solid blocks keep a clear walkway inside. Tower cells get no merlons (the plinth covers them).
// Coordinates here are board units: x east, y north, cell (x, y) spans x ± 0.5, y ± 0.5.

export type Occupant = 'stone' | 'tower';
export type Occupancy = Map<number, Occupant>;

const SUB = 4; // lattice steps per cell
const STEP = 1 / SUB;
const N = BOARD_SIZE * SUB;
const ORIGIN = 0.5; // board x of lattice column 0 (west edge of cell 1)
/**
 * Diagonal band half-width. Straight walls fill their cell (1.0 wide); a band whose edges lie on
 * the quarter-cell lattice closest to that is 0.75 / sqrt(2) each side, 1.06 wide, so diagonal and
 * straight walls read as the same wall. (The narrower 0.71-wide band looked thin beside them.)
 */
export const HALF_BAND = 0.75 / Math.SQRT2;
export const WALL_TOP = 0.29;
/** A tower cell is a turret in the wall, one course taller; the tower's shaft rises from it. */
export const TURRET_TOP = 0.39;
const MERLON = { height: 0.09, depth: 0.08, axis: 0.14, diagonal: 0.18 };
/** Chamfer on every outer top edge, in cells: just enough to catch the light. */
export const CHAMFER = 0.025;
const MERLON_CHAMFER = 0.012;
/** Course heights of a face up to `top`: footing, brick courses, coping, then the chamfer. */
const coursesTo = (top: number) => [
  0,
  0.03,
  0.115,
  0.2,
  ...(top > WALL_TOP ? [0.285] : []),
  top - CHAMFER - 0.02,
  top - CHAMFER,
];
const TONES = {
  footing: '#55595B',
  bricks: ['#6E7272', '#686C6C', '#737676', '#636767'],
  coping: '#7E8282',
  walk: ['#5F6466', '#5B6062', '#63686A'],
  merlon: ['#717473', '#767978', '#6C706F'],
};

export const cellKey = (c: Cell) => c.y * 64 + c.x;
const keyOf = (x: number, y: number) => y * 64 + x;

type Point = [number, number];
type Poly = Point[];
export interface WallRaster {
  occ: Occupancy;
  /** One byte per lattice triangle: index ((j * N + i) * 4 + q), q = 0 S, 1 E, 2 N, 3 W. */
  filled: Uint8Array;
  /** Cell key of the wall cell that owns each filled triangle. */
  owner: Int32Array;
}

/**
 * Joins of one wall cell: orthogonal neighbours, and diagonal bands to cells that touch only at a
 * corner (both orthogonal cells free). Towers count like stones: they stand on the wall.
 */
export function joins(occ: Occupancy, c: Cell) {
  const has = (x: number, y: number) => occ.has(keyOf(x, y));
  const orthogonal = [has(c.x + 1, c.y), has(c.x, c.y + 1), has(c.x - 1, c.y), has(c.x, c.y - 1)];
  const diagonal: Point[] = [];
  for (const sx of [1, -1])
    for (const sy of [1, -1])
      if (has(c.x + sx, c.y + sy) && !has(c.x + sx, c.y) && !has(c.x, c.y + sy))
        diagonal.push([sx, sy]);
  return { orthogonal, diagonal };
}

/** Corner bevel of a cell's core where no orthogonal arm fills that corner, in cells. */
const CORNER_CUT = 0.25;

function footprint(occ: Occupancy, c: Cell): Poly[] {
  const { orthogonal, diagonal } = joins(occ, c);
  const [east, north, west, south] = orthogonal;
  const { x, y } = c;
  // Core: the cell square with its corners bevelled by a quarter cell. That bevel is exactly a
  // diagonal band's edge, so a straight wall turns diagonal without a step, and it softens outer
  // corners and wall ends elsewhere. Orthogonal arms and bands fill the corners they touch.
  const cut = CORNER_CUT;
  const core: Point[] = [];
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]) {
    const along = sx * sy > 0 ? 1 : -1; // keep the ring counter-clockwise
    const a: Point = [x + sx * 0.5, y + sy * (0.5 - cut)];
    const b: Point = [x + sx * (0.5 - cut), y + sy * 0.5];
    core.push(...(along > 0 ? [a, b] : [b, a]));
  }
  const polys: Poly[] = [core];
  const arm = (x0: number, x1: number, y0: number, y1: number): Poly => [
    [x + x0, y + y0],
    [x + x1, y + y0],
    [x + x1, y + y1],
    [x + x0, y + y1],
  ];
  if (east) polys.push(arm(0, 0.5, -0.5, 0.5));
  if (west) polys.push(arm(-0.5, 0, -0.5, 0.5));
  if (north) polys.push(arm(-0.5, 0.5, 0, 0.5));
  if (south) polys.push(arm(-0.5, 0.5, -0.5, 0));
  // Band from the centre to the shared corner; the neighbour's band continues from there.
  const h = HALF_BAND / Math.SQRT2;
  for (const [sx, sy] of diagonal) {
    const [kx, ky] = [x + sx / 2, y + sy / 2];
    const [nx, ny] = [-sy * h, sx * h];
    polys.push([
      [x + nx, y + ny],
      [x - nx, y - ny],
      [kx - nx, ky - ny],
      [kx + nx, ky + ny],
    ]);
  }
  return polys;
}

function inside(poly: Poly, px: number, py: number) {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % poly.length];
    const cross = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    if (Math.abs(cross) < 1e-9) continue;
    if (sign && Math.sign(cross) !== sign) return false;
    sign = Math.sign(cross);
  }
  return true;
}

/** Centroid of lattice triangle (i, j, q) in board units. */
function centroid(i: number, j: number, q: number): Point {
  const cx = ORIGIN + (i + 0.5) * STEP;
  const cy = ORIGIN + (j + 0.5) * STEP;
  const d = STEP / 3;
  return [cx + [0, d, 0, -d][q], cy + [-d, 0, d, 0][q]];
}
const cellAt = (x: number, y: number): Cell => ({ x: Math.round(x), y: Math.round(y) });

export function wallRaster(occ: Occupancy): WallRaster {
  const filled = new Uint8Array(N * N * 4);
  const owner = new Int32Array(N * N * 4).fill(-1);
  for (const k of occ.keys()) {
    const c = { x: k % 64, y: Math.floor(k / 64) };
    const i0 = Math.max(0, (c.x - 2) * SUB);
    const j0 = Math.max(0, (c.y - 2) * SUB);
    const polys = footprint(occ, c);
    for (let j = j0; j < Math.min(N, j0 + SUB * 3); j++)
      for (let i = i0; i < Math.min(N, i0 + SUB * 3); i++)
        for (let q = 0; q < 4; q++) {
          const [px, py] = centroid(i, j, q);
          if (!polys.some((p) => inside(p, px, py))) continue;
          const t = (j * N + i) * 4 + q;
          filled[t] = 1;
          // A triangle inside a stone cell belongs to that stone; band tips in a free cell go to
          // the first stone that reaches them.
          const home = cellAt(px, py);
          if (owner[t] < 0 || (home.x === c.x && home.y === c.y)) owner[t] = k;
        }
  }
  return { occ, filled, owner };
}

/** Occupancy of the 5×5 cells around `c`: everything a cell's wall geometry depends on. */
export function neighbourhood(occ: Occupancy, c: Cell) {
  let sig = '';
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) sig += occ.get(keyOf(c.x + dx, c.y + dy))?.[0] ?? '.';
  return sig;
}

const hash = (a: number, b: number, c: number) => {
  let h = Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul(c | 0, 83492791);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
};
const COLOR = new THREE.Color();
const pick = (list: string[], h: number) => COLOR.set(list[h % list.length]);

/** Triangle corners in board units: q's outer edge (a -> b) and the lattice square's centre. */
function corners(i: number, j: number, q: number) {
  const [x0, y0] = [ORIGIN + i * STEP, ORIGIN + j * STEP];
  const [x1, y1] = [x0 + STEP, y0 + STEP];
  const c: Point = [x0 + STEP / 2, y0 + STEP / 2];
  const ring: Point[] = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
  return { a: ring[q], b: ring[(q + 1) % 4], c };
}
const filledAt = (r: WallRaster, i: number, j: number, q: number) =>
  i >= 0 && j >= 0 && i < N && j < N && r.filled[(j * N + i) * 4 + q] === 1;

/** Is the board point (x, y) inside the wall footprint? */
export function filledAtPoint(r: WallRaster, x: number, y: number) {
  const fx = (x - ORIGIN) / STEP;
  const fy = (y - ORIGIN) / STEP;
  const [i, j] = [Math.floor(fx), Math.floor(fy)];
  const [u, v] = [fx - i, fy - j];
  const q = v < u && v < 1 - u ? 0 : u > v && u > 1 - v ? 1 : v > u && v > 1 - u ? 2 : 3;
  return filledAt(r, i, j, q);
}

const insetCache = new WeakMap<WallRaster, Map<string, Point>>();
/**
 * Where a walkway vertex moves for the top-edge chamfer: inward by CHAMFER from every outer
 * edge meeting it, mitred at corners. Only depends on the shared raster, so neighbouring cells
 * agree on every shared vertex. Interior vertices and pinch points stay put.
 */
export function insetAt(r: WallRaster, x: number, y: number): Point {
  let cache = insetCache.get(r);
  if (!cache) insetCache.set(r, (cache = new Map()));
  const id = `${Math.round(x * 16)},${Math.round(y * 16)}`;
  const hit = cache.get(id);
  if (hit) return hit;
  // Edges leave a lattice corner in eight directions and a square's centre in four diagonals.
  const corner = Math.abs((x - ORIGIN) / STEP - Math.round((x - ORIGIN) / STEP)) < 1e-6;
  const reach = corner ? STEP : STEP / 2;
  const normals: Point[] = [];
  for (let k = 0; k < 8; k++) {
    if (!corner && k % 2 === 0) continue;
    const angle = (k * Math.PI) / 4;
    const [dx, dy] = [Math.round(Math.cos(angle)), Math.round(Math.sin(angle))];
    // Sample a quarter of the way along: a diagonal's midpoint is a lattice square's centre,
    // where all four triangles meet.
    const [mx, my] = [x + (dx * reach) / 4, y + (dy * reach) / 4];
    const l = Math.hypot(dx, dy);
    const [px, py] = [(-dy / l) * 0.01, (dx / l) * 0.01];
    const left = filledAtPoint(r, mx + px, my + py);
    const right = filledAtPoint(r, mx - px, my - py);
    if (left === right) continue;
    // Outward: toward the free side.
    normals.push(left ? [dy / l, -dx / l] : [-dy / l, dx / l]);
  }
  let result: Point = [x, y];
  if (normals.length === 2) {
    const [[ax, ay], [bx, by]] = normals;
    const k = CHAMFER / (1 + ax * bx + ay * by);
    result = [x - (ax + bx) * k, y - (ay + by) * k];
  }
  cache.set(id, result);
  return result;
}

/** What one stone cell draws, in board units: walkway triangles, outer faces and merlons. */
export interface WallParts {
  walk: { i: number; j: number; points: [Point, Point, Point]; top: number }[];
  /** Boundary edges of the footprint with their outward unit normal and the wall top there. */
  faces: { from: Point; to: Point; nx: number; ny: number; top: number }[];
  /** Where a turret rises above the wall walk beside it: a face from `low` up to `high`. */
  steps: { from: Point; to: Point; nx: number; ny: number; low: number; high: number }[];
  /** Merlon centre on the outer face line, its direction along the face, outward normal, length. */
  merlons: {
    x: number;
    y: number;
    dx: number;
    dy: number;
    nx: number;
    ny: number;
    length: number;
    top: number;
  }[];
}

export function wallParts(r: WallRaster, cell: Cell): WallParts {
  const k = cellKey(cell);
  const parts: WallParts = { walk: [], faces: [], steps: [], merlons: [] };
  const topOf = (t: number) => (r.occ.get(r.owner[t]) === 'tower' ? TURRET_TOP : WALL_TOP);
  const i0 = Math.max(0, (cell.x - 2) * SUB);
  const j0 = Math.max(0, (cell.y - 2) * SUB);
  for (let j = j0; j < Math.min(N, j0 + SUB * 3); j++)
    for (let i = i0; i < Math.min(N, i0 + SUB * 3); i++)
      for (let q = 0; q < 4; q++) {
        const t = (j * N + i) * 4 + q;
        if (!r.filled[t] || r.owner[t] !== k) continue;
        const { a, b, c } = corners(i, j, q);
        const top = topOf(t);
        parts.walk.push({ i, j, points: [a, b, c], top });
        // The outer edge borders the next lattice square; the two inner edges border this one's
        // neighbouring triangles.
        const across = [
          [i, j - 1, 2],
          [i + 1, j, 3],
          [i, j + 1, 0],
          [i - 1, j, 1],
        ][q];
        const inside = (ii: number, jj: number, qq: number) =>
          ii >= 0 && jj >= 0 && ii < N && jj < N ? (jj * N + ii) * 4 + qq : -1;
        const edges: { from: Point; to: Point; next: number }[] = [
          { from: a, to: b, next: inside(across[0], across[1], across[2]) },
          { from: c, to: b, next: inside(i, j, (q + 1) % 4) },
          { from: c, to: a, next: inside(i, j, (q + 3) % 4) },
        ];
        const [gx, gy] = centroid(i, j, q);
        for (const { from, to, next } of edges) {
          const open = next < 0 || !r.filled[next];
          const lower = !open && topOf(next) < top;
          if (!open && !lower) continue;
          const [mx, my] = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
          // Outward normal: perpendicular to the edge, away from this triangle.
          let [nx, ny] = [to[1] - from[1], from[0] - to[0]];
          const len = Math.hypot(nx, ny);
          [nx, ny] = [nx / len, ny / len];
          if (nx * (mx - gx) + ny * (my - gy) < 0) [nx, ny] = [-nx, -ny];
          if (lower) {
            parts.steps.push({ from, to, nx, ny, low: topOf(next), high: top });
            continue;
          }
          parts.faces.push({ from, to, nx, ny, top });
          const [dx, dy] = [to[0] - from[0], to[1] - from[1]];
          // One merlon per lattice edge, centred on it; a diagonal pair of half-edges shares one,
          // emitted by the half that reaches the lattice square's west corner.
          if (!dx || !dy)
            parts.merlons.push({ x: mx, y: my, dx, dy, nx, ny, length: MERLON.axis, top });
          else if (Math.min(from[0], to[0]) < c[0] - 1e-9)
            parts.merlons.push({
              x: c[0],
              y: c[1],
              dx,
              dy,
              nx,
              ny,
              length: MERLON.diagonal,
              top,
            });
        }
      }
  return parts;
}

/** Wall mesh for one stone cell, in scene units relative to the cell centre; null if it has none. */
export function wallMesh(r: WallRaster, cell: Cell, material: THREE.Material) {
  const parts = wallParts(r, cell);
  if (!parts.walk.length) return null;
  const pos: number[] = [];
  const col: number[] = [];
  // Board (x, y, height) -> scene offset from the cell centre: X east, Y up, Z south.
  const P = (x: number, y: number, h: number) => new THREE.Vector3(x - cell.x, h, -(y - cell.y));
  const UP = new THREE.Vector3(0, 1, 0);
  /** Point every face away from `centre` (or along `up`), so winding never depends on edge order. */
  let centre = new THREE.Vector3();
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, up: THREE.Vector3) => {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const [p, q] = n.dot(up) >= 0 ? [b, c] : [c, b];
    for (const v of [a, p, q]) {
      pos.push(v.x, v.y, v.z);
      col.push(COLOR.r, COLOR.g, COLOR.b);
    }
  };
  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => {
    const out = new THREE.Vector3().addVectors(a, c).multiplyScalar(0.5).sub(centre);
    tri(a, b, c, out);
    tri(a, c, d, out);
  };

  // Walkway: one flagstone tone per lattice square.
  for (const { i, j, points, top } of parts.walk) {
    pick(TONES.walk, hash(i, j, 7));
    const [a, b, c] = points.map(([x, y]) => P(...insetAt(r, x, y), top));
    tri(a, b, c, UP);
  }

  // Outer faces: footing, three brick courses in running bond, coping.
  const brickTone = (s: number, course: number, line: number) =>
    pick(TONES.bricks, hash(Math.floor((s - (course % 2) * 0.125) / 0.25), course, line));
  for (const { from, to, nx, ny, top } of parts.faces) {
    const courses = coursesTo(top);
    const horizontalish = Math.abs(to[0] - from[0]) >= Math.abs(to[1] - from[1]);
    const along = (p: Point) => (horizontalish ? p[0] : p[1]);
    const line = Math.round(
      (horizontalish ? from[1] - ((to[1] - from[1]) / (to[0] - from[0])) * from[0] : from[0]) * 8,
    );
    // Split at the half-lattice point so bricks can break joints between courses.
    const mid: Point = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
    const pieces: Point[][] =
      Math.abs(along(to) - along(from)) > STEP * 0.75
        ? [
            [from, mid],
            [mid, to],
          ]
        : [[from, to]];
    centre = P(mid[0] - nx, mid[1] - ny, top / 2);
    for (const [p, q] of pieces)
      for (let level = 0; level < courses.length - 1; level++) {
        const s = (along(p) + along(q)) / 2;
        if (level === 0) COLOR.set(TONES.footing);
        else if (level === courses.length - 2) COLOR.set(TONES.coping);
        else brickTone(s, level - 1, line);
        const [h0, h1] = [courses[level], courses[level + 1]];
        quad(P(p[0], p[1], h0), P(q[0], q[1], h0), P(q[0], q[1], h1), P(p[0], p[1], h1));
      }
    // Chamfer: from the top of the coping up and in to the walkway's inset edge.
    const [fi, ti] = [insetAt(r, ...from), insetAt(r, ...to)];
    const h = top - CHAMFER;
    COLOR.set(TONES.coping);
    quad(P(from[0], from[1], h), P(to[0], to[1], h), P(ti[0], ti[1], top), P(fi[0], fi[1], top));
  }

  // Turret steps: brick faces from the wall walk up to a turret's top, on the walk's inset line.
  for (const { from, to, nx, ny, low, high } of parts.steps) {
    const [fi, ti] = [insetAt(r, ...from), insetAt(r, ...to)];
    const mid: Point = [(fi[0] + ti[0]) / 2, (fi[1] + ti[1]) / 2];
    centre = P(mid[0] - nx, mid[1] - ny, (low + high) / 2);
    brickTone(Math.abs(nx) > Math.abs(ny) ? mid[1] : mid[0], 3, Math.round(mid[0] * 8));
    const h = high - CHAMFER;
    quad(P(fi[0], fi[1], low), P(ti[0], ti[1], low), P(ti[0], ti[1], h), P(fi[0], fi[1], h));
    COLOR.set(TONES.coping);
    quad(P(fi[0], fi[1], h), P(ti[0], ti[1], h), P(ti[0], ti[1], high), P(fi[0], fi[1], high));
  }

  // Merlons: boxes standing on the walkway just behind the chamfer, their own tops chamfered.
  for (const m of parts.merlons) {
    const l = Math.hypot(m.dx, m.dy);
    const [tx, ty] = [(m.dx / l) * (m.length / 2), (m.dy / l) * (m.length / 2)];
    const [ix, iy] = [-m.nx * MERLON.depth, -m.ny * MERLON.depth];
    const [ox, oy] = [m.x - m.nx * CHAMFER, m.y - m.ny * CHAMFER];
    const ring: Point[] = [
      [ox - tx, oy - ty],
      [ox + tx, oy + ty],
      [ox + tx + ix, oy + ty + iy],
      [ox - tx + ix, oy - ty + iy],
    ];
    const [cx, cy] = [ox + ix / 2, oy + iy / 2];
    // Each top corner steps in by the chamfer along both of the box's own axes.
    const [ux, uy] = [m.dx / l, m.dy / l];
    const [vx, vy] = [-m.nx, -m.ny];
    const c = MERLON_CHAMFER;
    const steps: Point[] = [
      [c, c],
      [-c, c],
      [-c, -c],
      [c, -c],
    ];
    const inner = ring.map(([x, y], n): Point => [
      x + ux * steps[n][0] + vx * steps[n][1],
      y + uy * steps[n][0] + vy * steps[n][1],
    ]);
    const [h0, h1] = [m.top, m.top + MERLON.height];
    const h = h1 - MERLON_CHAMFER;
    pick(TONES.merlon, hash(Math.round(m.x * 8), Math.round(m.y * 8), 3));
    centre = P(cx, cy, (h0 + h1) / 2);
    for (let n = 0; n < 4; n++) {
      const [a, b] = [ring[n], ring[(n + 1) % 4]];
      const [ai, bi] = [inner[n], inner[(n + 1) % 4]];
      quad(P(a[0], a[1], h0), P(b[0], b[1], h0), P(b[0], b[1], h), P(a[0], a[1], h));
      quad(P(a[0], a[1], h), P(b[0], b[1], h), P(bi[0], bi[1], h1), P(ai[0], ai[1], h1));
    }
    const top = inner.map(([x, y]) => P(x, y, h1));
    tri(top[0], top[1], top[2], UP);
    tri(top[0], top[2], top[3], UP);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.sharedMaterial = true;
  return mesh;
}
