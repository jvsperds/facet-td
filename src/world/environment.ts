import * as THREE from 'three';
import type { Cell } from '../sim/board';
import { toScene } from './view';

// The sunken voxel cave around the board (docs/art/environment, style study B/C and the connected
// cave concept D). Presentation only: nothing here is a board cell, waypoint or rule.
// - The board sits on the lower floor of a cave chamber; stepped voxel rock rises around it.
// - A cave mouth embedded in the logical north wall feeds the spawn (S); a fortified crystal vault
//   embedded in the east wall stands behind the castle exit (E). Both face inward, keep their world
//   orientation, and are reached over continuous floor with clear lanes: no bridges or chasms.
// - The vault's heart crystal dims as castle HP falls and flashes when a creep gets through.
// - Foreground rock is cut down to the height where it would start to hide the board, recomputed
//   when the camera turns (the study's cutaway), so the arena stays readable at every angle.

const HALF = 18.5; // board half-size in cells
const FLOOR = HALF + 1.5; // continuous floor ring around the board
const EXTENT = 32; // terrain reaches this far from the centre
const LANE_HALF = 2.2; // half-width of the clear approach lanes
const ROCK = ['#555b61', '#5d646a', '#4e545a', '#666d73', '#495056'];
const FLOOR_TONES = ['#7d858b', '#767e84', '#838a90'];
const CRYSTALS = ['#ce4059', '#386bd6', '#9963d2', '#31b1bf'];

const hash = (a: number, b: number, c = 0) => {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Smooth value noise in [0, 1): bilinear between hashed lattice points. */
function smooth(x: number, z: number) {
  const [x0, z0] = [Math.floor(x), Math.floor(z)];
  const [fx, fz] = [x - x0, z - z0];
  const [sx, sz] = [fx * fx * (3 - 2 * fx), fz * fz * (3 - 2 * fz)];
  const a = hash(x0, z0, 7) + (hash(x0 + 1, z0, 7) - hash(x0, z0, 7)) * sx;
  const b = hash(x0, z0 + 1, 7) + (hash(x0 + 1, z0 + 1, 7) - hash(x0, z0 + 1, 7)) * sx;
  return a + (b - a) * sz;
}

type Lane = { from: [number, number]; to: [number, number] };
const distToSegment = (px: number, pz: number, { from, to }: Lane) => {
  const [ax, az] = from;
  const [dx, dz] = [to[0] - ax, to[1] - az];
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
};

/** An axis-aligned ground rectangle to keep in view: centre and half-sizes. */
export type Keep = { x: number; z: number; hx: number; hz: number };

/**
 * Ground distance from (x, z) back along -dir (away from the camera) until the ray enters the
 * rectangle; Infinity if it never does. A column of height h there hides that rectangle only if
 * h > distance * tan(elevation).
 */
export function distanceTo(r: Keep, x: number, z: number, dx: number, dz: number) {
  // Ray p - t*dir against the rectangle (slab method).
  let lo = 0;
  let hi = Infinity;
  for (const [p, d, c, half] of [
    [x, -dx, r.x, r.hx],
    [z, -dz, r.z, r.hz],
  ]) {
    if (Math.abs(d) < 1e-9) {
      if (Math.abs(p - c) > half) return Infinity;
      continue;
    }
    const t1 = (c - half - p) / d;
    const t2 = (c + half - p) / d;
    lo = Math.max(lo, Math.min(t1, t2));
    hi = Math.min(hi, Math.max(t1, t2));
  }
  return lo <= hi ? lo : Infinity;
}

export function createEnvironment(scene: THREE.Scene, spawn: Cell, exit: Cell) {
  const group = new THREE.Group();
  group.name = 'cave';
  scene.add(group);
  const s = toScene(spawn);
  const e = toScene(exit);
  // The mouth sits in the north wall above S; the vault in the east wall beside E.
  const mouth = { x: s.x, z: -HALF - 6 };
  const vault = { x: HALF + 8.5, z: e.z };
  // The cutaway keeps the board and both structures in view.
  const keeps: Keep[] = [
    { x: 0, z: 0, hx: HALF + 0.5, hz: HALF + 0.5 },
    { x: mouth.x, z: mouth.z + 0.5, hx: 3.5, hz: 1.5 },
    { x: HALF + 8.5, z: e.z, hx: 4.5, hz: 4.5 },
  ];
  const lanes: Lane[] = [
    { from: [s.x, s.z], to: [mouth.x, mouth.z + 1] },
    { from: [e.x, e.z], to: [vault.x - 4, vault.z] },
  ];

  // Rock columns and floor tiles: one instanced box mesh each, coloured per instance.
  /** `ring`: distance beyond the floor ring; crystals and lamps only sit on far terraces. */
  type Column = { x: number; z: number; h: number; ring: number };
  const columns: Column[] = [];
  const tiles: { x: number; z: number }[] = [];
  for (let x = -EXTENT; x <= EXTENT; x++)
    for (let z = -EXTENT; z <= EXTENT; z++) {
      const inBoard = Math.abs(x) <= HALF && Math.abs(z) <= HALF;
      if (inBoard) continue;
      const ring = Math.max(Math.abs(x), Math.abs(z)) - FLOOR;
      const lane = Math.min(...lanes.map((l) => distToSegment(x, z, l)));
      // Floor under and in front of the two structures, so they stand on the cave floor.
      const atMouth = Math.abs(x - mouth.x) <= 4.6 && z >= mouth.z - 1.4 && z <= mouth.z + 2;
      const atVault = Math.abs(x - vault.x) <= 4.8 && Math.abs(z - vault.z) <= 4.8;
      if (ring <= 0 || lane <= LANE_HALF || atMouth || atVault) {
        tiles.push({ x, z });
        continue;
      }
      // Stepped terraces rising away from the chamber floor, in half-cell steps. Beyond the first
      // ledges the rock comes in 2 x 2 blocks with smooth noise, like the voxel style study.
      const [bx, bz] = ring > 2 ? [Math.floor(x / 2) * 2, Math.floor(z / 2) * 2] : [x, z];
      const n = smooth(bx / 5, bz / 5) + hash(bx, bz) * 0.6;
      const h = Math.min(7, Math.round((0.5 + ring * 0.38 + n * 2.2) * 2) / 2);
      columns.push({ x, z, h, ring });
    }
  // Floor: one flat mesh of tinted tiles, level with the board's slab.
  const color = new THREE.Color();
  const floorPos: number[] = [];
  const floorCol: number[] = [];
  for (const { x, z } of tiles) {
    color.set(FLOOR_TONES[Math.floor(hash(x, z, 2) * FLOOR_TONES.length)]);
    const [x0, x1, z0, z1] = [x - 0.5, x + 0.5, z - 0.5, z + 0.5];
    floorPos.push(
      x0,
      -0.02,
      z0,
      x0,
      -0.02,
      z1,
      x1,
      -0.02,
      z1,
      x0,
      -0.02,
      z0,
      x1,
      -0.02,
      z1,
      x1,
      -0.02,
      z0,
    );
    for (let k = 0; k < 6; k++) floorCol.push(color.r, color.g, color.b);
  }
  const floorGeometry = new THREE.BufferGeometry();
  floorGeometry.setAttribute('position', new THREE.Float32BufferAttribute(floorPos, 3));
  floorGeometry.setAttribute('color', new THREE.Float32BufferAttribute(floorCol, 3));
  floorGeometry.computeVertexNormals();
  const floor = new THREE.Mesh(
    floorGeometry,
    new THREE.MeshLambertMaterial({ vertexColors: true }),
  );
  floor.name = 'cave-floor';
  floor.receiveShadow = true;

  // Rock: one merged voxel heightfield with only the visible faces (tops, and sides that step
  // down to a lower neighbour), rebuilt when the cutaway heights change. Full instanced boxes
  // overdrew heavily; this keeps the screen-filling rock cheap.
  // Lambert, no shadow sampling: the rock fills most of the screen, so it must stay cheap.
  const rock = new THREE.Mesh(
    new THREE.BufferGeometry(),
    new THREE.MeshLambertMaterial({ vertexColors: true }),
  );
  rock.name = 'cave-rock';
  const heightAt = new Map<number, number>();
  const cellId = (x: number, z: number) => (x + 64) * 256 + (z + 64);
  function buildRock(heights: number[]) {
    heightAt.clear();
    columns.forEach(({ x, z }, i) => heightAt.set(cellId(x, z), heights[i]));
    const pos: number[] = [];
    const col: number[] = [];
    const quad = (a: number[], b: number[], c: number[], d: number[], shade: number) => {
      pos.push(...a, ...b, ...c, ...a, ...c, ...d);
      for (let k = 0; k < 6; k++) col.push(color.r * shade, color.g * shade, color.b * shade);
    };
    columns.forEach(({ x, z }, i) => {
      const h = heights[i];
      // One tone per 2 x 2 block, so blocks read as single stones.
      color.set(ROCK[Math.floor(hash(Math.floor(x / 2), Math.floor(z / 2), 1) * ROCK.length)]);
      const [x0, x1, z0, z1] = [x - 0.5, x + 0.5, z - 0.5, z + 0.5];
      quad([x0, h, z0], [x0, h, z1], [x1, h, z1], [x1, h, z0], 1);
      // Sides down to each lower neighbour (floor and board count as height 0).
      for (const [nx, nz, a, b] of [
        [x + 1, z, [x1, z1], [x1, z0]],
        [x - 1, z, [x0, z0], [x0, z1]],
        [x, z + 1, [x0, z1], [x1, z1]],
        [x, z - 1, [x1, z0], [x0, z0]],
      ] as [number, number, number[], number[]][]) {
        const low = heightAt.get(cellId(nx, nz)) ?? 0;
        if (low >= h) continue;
        quad([a[0], low, a[1]], [b[0], low, b[1]], [b[0], h, b[1]], [a[0], h, a[1]], 0.78);
      }
    });
    rock.geometry.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    rock.geometry = g;
  }
  const pose = new THREE.Object3D();
  group.add(rock, floor);

  // Crystal clusters and warm lamps on terrace tops, away from the lanes.
  const decor = columns.filter(({ x, z, ring }) => ring >= 8 && hash(x, z, 3) < 0.025);
  const crystals = new THREE.InstancedMesh(
    new THREE.OctahedronGeometry(0.28).scale(0.7, 1.4, 0.7),
    new THREE.MeshLambertMaterial(),
    decor.length * 3,
  );
  crystals.name = 'cave-crystals';
  let n = 0;
  /** Crystal instance matrices by column, hidden while the cutaway lowers that column. */
  const decorMatrices: { column: number; index: number; matrix: THREE.Matrix4 }[] = [];
  for (const c of decor) {
    const tone = CRYSTALS[Math.floor(hash(c.x, c.z, 4) * CRYSTALS.length)];
    for (let k = 0; k < 3; k++) {
      pose.position.set(
        c.x + (hash(c.x, c.z, 10 + k) - 0.5) * 0.6,
        c.h + 0.3,
        c.z + (hash(c.x, c.z, 20 + k) - 0.5) * 0.6,
      );
      pose.scale.setScalar(0.6 + hash(c.x, c.z, 30 + k) * 0.7);
      pose.rotation.set(0, hash(c.x, c.z, 40 + k) * 3, (hash(c.x, c.z, 50 + k) - 0.5) * 0.5);
      pose.updateMatrix();
      crystals.setMatrixAt(n, pose.matrix);
      decorMatrices.push({ column: columns.indexOf(c), index: n, matrix: pose.matrix.clone() });
      crystals.setColorAt(n++, color.set(tone));
    }
  }
  pose.rotation.set(0, 0, 0);
  group.add(crystals);

  const lampMaterial = new THREE.MeshBasicMaterial({ color: '#ffcf7a' });
  const lamp = (x: number, y: number, z: number) => {
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.5, 0.16).translate(0, 0.25, 0),
      new THREE.MeshStandardMaterial({ color: '#3a3d40', roughness: 1 }),
    );
    const flame = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.22), lampMaterial);
    flame.position.y = 0.62;
    const g = new THREE.Group().add(post, flame);
    g.position.set(x, y, z);
    group.add(g);
    return g;
  };
  const terraceLamps = columns
    .filter(({ x, z, ring }) => ring >= 8 && hash(x, z, 5) < 0.02)
    .map((c) => ({ column: columns.indexOf(c), lamp: lamp(c.x, c.h, c.z) }));

  // Cave mouth: a dark tunnel opening framed by heavy voxel stones, lamps either side.
  const stone = (hex: string) => new THREE.MeshStandardMaterial({ color: hex, roughness: 1 });
  const block = (
    parent: THREE.Object3D,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material,
  ) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y + h / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const cave = new THREE.Group();
  cave.name = 'cave-mouth';
  cave.position.set(mouth.x, 0, mouth.z);
  const frame = stone('#4a5056');
  const dark = new THREE.MeshBasicMaterial({ color: '#0b0c0e' });
  block(cave, 1.6, 3.4, 2.4, -2.6, 0, 0, frame);
  block(cave, 1.6, 3.4, 2.4, 2.6, 0, 0, frame);
  block(cave, 6.8, 1.2, 2.4, 0, 3.4, 0, frame);
  block(cave, 1.2, 0.8, 2.2, -1.6, 2.6, 0.1, frame); // stepped arch corners
  block(cave, 1.2, 0.8, 2.2, 1.6, 2.6, 0.1, frame);
  block(cave, 3.6, 3.4, 0.4, 0, 0, -1, dark); // the tunnel's depth
  block(cave, 8, 4.6, 3, 0, 0, -2.6, stone('#41464c')); // the rock it is cut into
  lamp(mouth.x - 3.8, 0, mouth.z + 1.2);
  lamp(mouth.x + 3.8, 0, mouth.z + 1.2);
  group.add(cave);

  // Crystal vault: an open keep set into the east wall, gate toward the board. Four crenellated
  // towers and curtain walls in the board walls' masonry greys; the heart crystal stands on a
  // pedestal in the courtyard, visible over the walls from every side.
  const fort = new THREE.Group();
  fort.name = 'cave-fortress';
  fort.position.set(vault.x, 0, vault.z);
  fort.rotation.y = -Math.PI / 2; // its front (+z) faces west, toward E
  const masonry = stone('#686c6c');
  const cap = stone('#717473');
  const footing = stone('#5f6466');
  const crenels = (x0: number, x1: number, z0: number, z1: number, y: number) => {
    const along = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const length = along ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    for (let t = 0.3; t < length; t += 0.6) {
      const k = t / length;
      block(fort, 0.32, 0.35, 0.32, x0 + (x1 - x0) * k, y, z0 + (z1 - z0) * k, cap);
    }
  };
  block(fort, 8.4, 0.3, 8.4, 0, 0, 0, footing);
  // Curtain walls: back and sides solid, the front split by the gate.
  block(fort, 7, 2.2, 0.7, 0, 0.3, -3.5, masonry);
  block(fort, 0.7, 2.2, 7, -3.5, 0.3, 0, masonry);
  block(fort, 0.7, 2.2, 7, 3.5, 0.3, 0, masonry);
  block(fort, 2.4, 2.2, 0.7, -2.3, 0.3, 3.5, masonry);
  block(fort, 2.4, 2.2, 0.7, 2.3, 0.3, 3.5, masonry);
  block(fort, 2.2, 0.7, 0.7, 0, 1.8, 3.5, masonry); // lintel over the gate
  crenels(-3.2, 3.2, -3.75, -3.75, 2.5);
  crenels(-3.75, -3.75, -3.2, 3.2, 2.5);
  crenels(3.75, 3.75, -3.2, 3.2, 2.5);
  crenels(-3.2, 3.2, 3.75, 3.75, 2.5);
  for (const [tx, tz] of [
    [-3.5, -3.5],
    [3.5, -3.5],
    [-3.5, 3.5],
    [3.5, 3.5],
  ]) {
    block(fort, 1.7, 3.4, 1.7, tx, 0.3, tz, masonry);
    block(fort, 1.9, 0.2, 1.9, tx, 3.7, tz, cap);
    for (const [mx, mz] of [
      [-0.65, -0.65],
      [0.65, -0.65],
      [-0.65, 0.65],
      [0.65, 0.65],
    ])
      block(fort, 0.42, 0.4, 0.42, tx + mx, 3.9, tz + mz, cap);
  }
  // Portcullis across the gate.
  const bars = new THREE.MeshStandardMaterial({ color: '#2a2d30', roughness: 0.8 });
  for (let i = -0.9; i <= 0.91; i += 0.3) block(fort, 0.09, 1.5, 0.09, i, 0.3, 3.75, bars);
  block(fort, 2, 0.09, 0.09, 0, 1.1, 3.75, bars);
  // Heart crystal on its pedestal.
  block(fort, 1.6, 0.6, 1.6, 0, 0.3, 0, footing);
  block(fort, 1.1, 0.4, 1.1, 0, 0.9, 0, cap);
  const heartMaterial = new THREE.MeshStandardMaterial({
    color: '#8fd3f4',
    emissive: '#4aa8e8',
    emissiveIntensity: 1.2,
    roughness: 0.25,
    flatShading: true,
  });
  const heart = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.75).scale(0.75, 1.6, 0.75),
    heartMaterial,
  );
  heart.position.set(0, 2.6, 0);
  heart.castShadow = true;
  fort.add(heart);
  group.add(fort);
  lamp(vault.x - 4.6, 0, vault.z - 2);
  lamp(vault.x - 4.6, 0, vault.z + 2);

  // Cutaway: cap every rock column at the height that keeps the board visible from this view.
  // Recomputed per whole degree of camera change, so free rotation stays smooth.
  let lastView = '';
  function view(elevationDeg: number, azimuthDeg: number) {
    const key = `${Math.round(elevationDeg)}:${Math.round(azimuthDeg)}`;
    if (key === lastView) return;
    lastView = key;
    const a = (Math.round(azimuthDeg) * Math.PI) / 180;
    const [dx, dz] = [Math.sin(a), Math.cos(a)]; // horizontal direction toward the camera
    const slope = Math.tan((elevationDeg * Math.PI) / 180);
    const heights = columns.map(({ x, z, h }) => {
      const t =
        elevationDeg >= 89.5
          ? Infinity
          : Math.min(...keeps.map((k) => distanceTo(k, x, z, dx, dz)));
      // Snap to the half-cell steps so cut rock keeps its voxel terraces.
      return Math.max(0.5, Math.min(h, Math.floor((t - 0.5) * slope * 2) / 2));
    });
    buildRock(heights);
    // Decor on a lowered column would float: hide it until the column is whole again.
    const lowered = (i: number) => heights[i] < columns[i].h;
    const none = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const d of decorMatrices)
      crystals.setMatrixAt(d.index, lowered(d.column) ? none : d.matrix);
    crystals.instanceMatrix.needsUpdate = true;
    for (const t of terraceLamps) t.lamp.visible = !lowered(t.column);
  }
  view(35.264, 45);

  // Castle state: the heart dims with castle HP and flashes red when a creep gets through.
  let hpRatio = 1;
  let flash = 0;
  let clock = 0;
  const calm = new THREE.Color('#4aa8e8');
  const hurt = new THREE.Color('#ff5a4f');
  return {
    view,
    /** After each sim step: castle HP share and how much damage leaked this tick. */
    castle(ratio: number, leaked: number) {
      hpRatio = Math.max(0, Math.min(1, ratio));
      if (leaked > 0) flash = 1;
    },
    frame(dt: number, reducedMotion: boolean) {
      clock += dt;
      flash = Math.max(0, flash - dt * 1.8);
      const pulse = reducedMotion ? 0 : Math.sin(clock * 2) * 0.12;
      heartMaterial.emissive.copy(calm).lerp(hurt, Math.max(flash, (1 - hpRatio) * 0.6));
      heartMaterial.emissiveIntensity = 0.35 + 0.9 * hpRatio + pulse + flash;
      heart.scale.setScalar(0.6 + 0.4 * hpRatio);
      heart.rotation.y = reducedMotion ? 0 : clock * 0.4;
      fort.position.x = vault.x + (reducedMotion ? 0 : Math.sin(clock * 60) * 0.05 * flash);
    },
    /** For tests: rock column count and the lanes' clear floor. */
    debug: { columns, tiles, lanes, mouth, vault },
  };
}
export type Environment = ReturnType<typeof createEnvironment>;
