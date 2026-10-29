import * as THREE from 'three';
import type { Cell } from '../sim/board';
import { toScene } from './view';

// The sunken voxel cave around the board (docs/art/environment, style study B/C and the connected
// cave concept D). Presentation only: nothing here is a board cell, waypoint or rule.
// - The board sits on the lower floor of a cave chamber; tall voxel cliffs and pillars rise around it.
// - A brick-arched cave mouth embedded in the logical north wall feeds the spawn (S); a fortified
//   crystal vault embedded in the east wall stands behind the castle exit (E). Both face inward,
//   keep their world orientation, and are reached over continuous floor with clear lanes.
// - The study's mood comes from light, not geometry: warm lanterns and glowing amber and ice
//   crystal clusters bake light pools into the rock and floor vertex colours, and draw additive
//   halos. No real lights are added, so the cave costs the same however many lamps it has.
// - The vault's heart crystal dims as castle HP falls and flashes when a creep gets through.
// - Foreground rock is cut down to the height where it would start to hide the board, recomputed
//   when the camera turns (the study's cutaway), so the arena stays readable at every angle.

const HALF = 18.5; // board half-size in cells
const FLOOR = HALF + 1.5; // continuous floor ring around the board
const EXTENT = 32; // terrain reaches this far from the centre
const LANE_HALF = 2.2; // half-width of the clear approach lanes
const MAX_ROCK = 12;
const ROCK = ['#6e7378', '#757a7f', '#686d72', '#7c8186', '#63686d'];
const FLOOR_TONES = ['#8d9499', '#868d93', '#939a9f'];
const AMBER = new THREE.Color('#ffb04a');
const ICE = new THREE.Color('#5aa6ff');
const LAMP_LIGHT = new THREE.Color('#ff9440');

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

/**
 * Voxel stone face, one stone per UV unit: a pale bevel on the top and left, a dark seam on the
 * bottom and right, faint speckle. A DataTexture, so it builds without a DOM (unit tests).
 */
function stoneTexture() {
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let v = 212 + (hash(x, y, 9) - 0.5) * 26;
      if (x >= size - 2 || y < 2) v = 132;
      else if (x < 2 || y >= size - 2) v = 242;
      data.set([v, v, v, 255], (y * size + x) * 4);
    }
  const t = new THREE.DataTexture(data, size, size);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapNearestFilter; // trilinear costs software renderers a frame
  t.generateMipmaps = true;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Soft round halo for additive glows. */
function glowTexture() {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x - 31.5, y - 31.5) / 32;
      const a = Math.max(0, 1 - r) ** 2;
      data.set([255, 255, 255, Math.round(a * 255)], (y * size + x) * 4);
    }
  const t = new THREE.DataTexture(data, size, size);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** BoxGeometry with UVs in world units × `density`, so stone keeps one size on every face. */
function stoneBox(w: number, h: number, d: number, density: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute('uv');
  // BoxGeometry faces in order: +x, -x, +y, -y, +z, -z; four vertices each.
  const spans = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let i = 0; i < uv.count; i++) {
    const [su, sv] = spans[Math.floor(i / 4)];
    uv.setXY(i, uv.getX(i) * su * density, uv.getY(i) * sv * density);
  }
  return g;
}

/** Shards of a crystal: a hexagonal prism with a pointed tip, 1 tall, base at y = 0. */
const shardGeometry = () =>
  new THREE.LatheGeometry(
    [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.2, 0.02),
      new THREE.Vector2(0.18, 0.7),
      new THREE.Vector2(0, 1),
    ],
    6,
  );

/** A light baked into the rock and floor colours: warm lamps and glowing crystals. */
type Pool = {
  x: number;
  y: number;
  z: number;
  color: THREE.Color;
  radius: number;
  strength: number;
};

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
  const stone = stoneTexture();
  const glow = glowTexture();

  // Rock columns and floor tiles.
  /** `ring`: distance beyond the floor ring; decor only sits on terraces. */
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
      // Cliffs rising steeply from the chamber floor in half-cell steps; beyond the first ledges
      // the rock comes in 2 x 2 blocks with smooth noise, and a few blocks stand up as pillars.
      const [bx, bz] = ring > 2 ? [Math.floor(x / 2) * 2, Math.floor(z / 2) * 2] : [x, z];
      const n = smooth(bx / 5, bz / 5) + hash(bx, bz) * 0.6;
      let h = 0.8 + ring * 0.55 + n * 2.8;
      if (ring > 3 && hash(bx, bz, 8) < 0.07) h += 2.5 + hash(bx, bz, 11) * 2.5;
      // Both structures are set into a tall face, not a low ledge.
      if (Math.hypot(x - mouth.x, z - mouth.z) < 8 || Math.hypot(x - vault.x, z - vault.z) < 9)
        h = Math.max(h, 6);
      columns.push({ x, z, h: Math.min(MAX_ROCK, Math.round(h * 2) / 2), ring });
    }

  // Height grid for neighbour lookups; floor and board are 0, beyond the terrain is solid.
  const W = 2 * EXTENT + 1;
  const grid = new Float32Array(W * W);
  const at = (x: number, z: number) =>
    Math.abs(x) > EXTENT || Math.abs(z) > EXTENT ? Infinity : grid[(x + EXTENT) * W + z + EXTENT];
  const fill = (heights: number[]) => {
    grid.fill(0);
    columns.forEach(({ x, z }, i) => (grid[(x + EXTENT) * W + z + EXTENT] = heights[i]));
  };

  // Baked light pools. Lamps and crystals register theirs as they are placed below.
  const pools: (Pool & { column: number })[] = [];
  const color = new THREE.Color();
  const light = (x: number, y: number, z: number, out: THREE.Color, off: Set<number>) => {
    for (const p of pools) {
      const [dx, dz] = [x - p.x, z - p.z];
      if (Math.abs(dx) >= p.radius || Math.abs(dz) >= p.radius || off.has(p.column)) continue;
      const d = Math.hypot(dx, (y - p.y) * 1.3, dz);
      if (d >= p.radius) continue;
      const k = (1 - d / p.radius) ** 2 * p.strength;
      out.r += p.color.r * k;
      out.g += p.color.g * k;
      out.b += p.color.b * k;
    }
  };
  // The chamber darkens away from the board, like the study's vignette.
  const depth = (x: number, z: number) =>
    Math.max(0.42, Math.min(1, 1 - (Math.max(Math.abs(x), Math.abs(z)) - 22) / 17));

  /** Mesh data: positions, UVs and baked colours, two triangles per quad. */
  const meshData = () => {
    const pos: number[] = [];
    const uv: number[] = [];
    const col: number[] = [];
    const vertex = ([x, y, z, u, v, shade]: number[], base: THREE.Color, off: Set<number>) => {
      pos.push(x, y, z);
      uv.push(u, v);
      color.copy(base).multiplyScalar(shade * depth(x, z));
      light(x, y, z, color, off);
      col.push(color.r, color.g, color.b);
    };
    return {
      quad(corners: number[][], base: THREE.Color, off: Set<number>) {
        for (const k of [0, 1, 2, 0, 2, 3]) vertex(corners[k], base, off);
      },
      geometry() {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        g.computeVertexNormals();
        return g;
      },
    };
  };

  // Rock: one merged voxel heightfield with only the visible faces (tops, and sides that step
  // down to a lower neighbour), rebuilt when the cutaway heights change. Lambert, no shadow
  // sampling: the rock fills most of the screen, so it must stay cheap.
  const rock = new THREE.Mesh(
    new THREE.BufferGeometry(),
    new THREE.MeshLambertMaterial({ vertexColors: true, map: stone }),
  );
  rock.name = 'cave-rock';
  const base = new THREE.Color();
  function buildRock(heights: number[], off: Set<number>) {
    fill(heights);
    const mesh = meshData();
    columns.forEach(({ x, z }, i) => {
      const h = heights[i];
      // One tone per 2 x 2 block, so blocks read as single stones; higher rock catches more light.
      base.set(ROCK[Math.floor(hash(Math.floor(x / 2), Math.floor(z / 2), 1) * ROCK.length)]);
      base.multiplyScalar(0.7 + 0.35 * Math.min(1, h / 9));
      const [x0, x1, z0, z1] = [x - 0.5, x + 0.5, z - 0.5, z + 0.5];
      // Top: each corner darkens for every taller neighbour around it (voxel ambient occlusion).
      const corner = (cx: number, cz: number) => {
        const [sx, sz] = [cx > x ? 1 : -1, cz > z ? 1 : -1];
        const taller = +(at(x + sx, z) > h) + +(at(x, z + sz) > h) + +(at(x + sx, z + sz) > h);
        return [cx, h, cz, cx, cz, 1 - 0.17 * taller];
      };
      mesh.quad([corner(x0, z0), corner(x0, z1), corner(x1, z1), corner(x1, z0)], base, off);
      // Sides down to each lower neighbour, dark at the foot like a crevice.
      for (const [nx, nz, a, b] of [
        [x + 1, z, [x1, z1], [x1, z0]],
        [x - 1, z, [x0, z0], [x0, z1]],
        [x, z + 1, [x0, z1], [x1, z1]],
        [x, z - 1, [x1, z0], [x0, z0]],
      ] as [number, number, number[], number[]][]) {
        const low = at(nx, nz);
        if (low >= h) continue;
        const along = nx === x ? 0 : 1; // UV runs along x for z-facing sides, z for x-facing
        const foot = low === 0 ? 0.36 : 0.55;
        mesh.quad(
          [
            [a[0], low, a[1], a[along], low, foot],
            [b[0], low, b[1], b[along], low, foot],
            [b[0], h, b[1], b[along], h, 0.9],
            [a[0], h, a[1], a[along], h, 0.9],
          ],
          base,
          off,
        );
      }
    });
    rock.geometry.dispose();
    rock.geometry = mesh.geometry();
  }
  group.add(rock);

  // Decor: instanced crystals, lanterns and rubble. Items on a terrace remember their column, so
  // the cutaway can hide them while it lowers that column.
  const pose = new THREE.Object3D();
  const axis = new THREE.Vector3();
  type Item = { column: number; matrix: THREE.Matrix4; tint?: THREE.Color };
  const instancer = (geometry: THREE.BufferGeometry, material: THREE.Material, name: string) => {
    const items: Item[] = [];
    let mesh: THREE.InstancedMesh | undefined;
    return {
      items,
      add(column: number, tint?: THREE.Color) {
        pose.updateMatrix();
        items.push({ column, matrix: pose.matrix.clone(), tint });
      },
      build() {
        mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, items.length));
        mesh.name = name;
        mesh.count = items.length;
        items.forEach((it, i) => {
          mesh!.setMatrixAt(i, it.matrix);
          if (it.tint) mesh!.setColorAt(i, it.tint);
        });
        group.add(mesh);
        return mesh;
      },
      hide(lowered: (column: number) => boolean) {
        const none = new THREE.Matrix4().makeScale(0, 0, 0);
        items.forEach((it, i) => mesh!.setMatrixAt(i, lowered(it.column) ? none : it.matrix));
        mesh!.instanceMatrix.needsUpdate = true;
      },
    };
  };
  const crystalMaterial = (tone: THREE.Color) =>
    new THREE.MeshLambertMaterial({
      color: tone.clone().lerp(new THREE.Color('#ffffff'), 0.25),
      emissive: tone,
      emissiveIntensity: 0.75,
      flatShading: true,
    });
  const shards = {
    amber: instancer(shardGeometry(), crystalMaterial(AMBER), 'cave-crystals-amber'),
    ice: instancer(shardGeometry(), crystalMaterial(ICE), 'cave-crystals-ice'),
  };
  const iron = new THREE.MeshLambertMaterial({ color: '#2f2c29' });
  const lantern = {
    post: instancer(
      new THREE.BoxGeometry(0.1, 1, 0.1).translate(0, 0.5, 0),
      iron,
      'cave-lamp-posts',
    ),
    frame: instancer(new THREE.BoxGeometry(0.3, 0.06, 0.3), iron, 'cave-lamp-frames'),
    flame: instancer(
      new THREE.BoxGeometry(0.2, 0.24, 0.2),
      new THREE.MeshBasicMaterial({ color: '#ffd284' }),
      'cave-lamp-flames',
    ),
  };
  const rubble = instancer(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial({ color: '#6a6f74', map: stone }),
    'cave-rubble',
  );
  // Halos: camera-facing quads in one additive instanced mesh, turned with the view.
  type Halo = { column: number; at: THREE.Vector3; size: number; tint: THREE.Color };
  const halos: Halo[] = [];

  /** Glowing crystal cluster: a tall centre shard ringed by shorter ones leaning outward. */
  function cluster(
    x: number,
    y: number,
    z: number,
    tone: 'amber' | 'ice',
    size: number,
    column: number,
  ) {
    const tint = tone === 'amber' ? AMBER : ICE;
    const count = 5 + Math.floor(hash(x * 7, z * 7, 1) * 3);
    for (let k = 0; k < count; k++) {
      const angle = (k / count) * Math.PI * 2 + hash(x, z, 60 + k);
      const [c, sn] = [Math.cos(angle), Math.sin(angle)];
      const reach = k === 0 ? 0 : (0.22 + hash(x, z, 70 + k) * 0.22) * size;
      const tall = (k === 0 ? 1.6 : 0.6 + hash(x, z, 80 + k) * 0.7) * size;
      const tilt = k === 0 ? 0.05 : 0.3 + hash(x, z, 90 + k) * 0.35;
      pose.position.set(x + c * reach, y, z + sn * reach);
      pose.quaternion.setFromAxisAngle(axis.set(sn, 0, -c), tilt);
      pose.scale.set(size, tall, size);
      shards[tone].add(column);
    }
    pose.quaternion.identity();
    pools.push({
      x,
      y: y + 0.6 * size,
      z,
      color: tint,
      radius: 5.5 * size,
      strength: 0.75,
      column,
    });
    halos.push({ column, at: new THREE.Vector3(x, y + 0.8 * size, z), size: 3.2 * size, tint });
  }

  /** Lantern on a post (`post` 0 hangs it on a wall). */
  function lamp(x: number, y: number, z: number, column = -1, post = 0.55) {
    pose.scale.set(1, post, 1);
    pose.position.set(x, y, z);
    if (post > 0) lantern.post.add(column);
    pose.scale.set(1, 1, 1);
    for (const dy of [0.03, 0.33]) {
      pose.position.set(x, y + post + dy, z);
      lantern.frame.add(column);
    }
    pose.position.set(x, y + post + 0.18, z);
    lantern.flame.add(column);
    pools.push({ x, y: y + post, z, color: LAMP_LIGHT, radius: 3.8, strength: 0.65, column });
    halos.push({
      column,
      at: new THREE.Vector3(x, y + post + 0.18, z),
      size: 1.9,
      tint: LAMP_LIGHT,
    });
  }

  // Terrace decor, kept apart so the clusters and lamps read individually.
  const placed: { x: number; z: number }[] = [];
  const clear = (x: number, z: number, gap: number) =>
    placed.every((p) => Math.hypot(p.x - x, p.z - z) >= gap);
  columns.forEach((c, i) => {
    if (c.ring < 2 || c.ring > 9 || hash(c.x, c.z, 3) > 0.06 || !clear(c.x, c.z, 9)) return;
    placed.push(c);
    const tone = hash(c.x, c.z, 6) < (c.x > 0 ? 0.65 : 0.3) ? 'ice' : 'amber';
    cluster(c.x, c.h, c.z, tone, 0.9 + hash(c.x, c.z, 12) * 0.5, i);
  });
  columns.forEach((c, i) => {
    if (c.ring < 1 || c.ring > 8 || hash(c.x, c.z, 5) > 0.05 || !clear(c.x, c.z, 6)) return;
    placed.push(c);
    lamp(c.x, c.h, c.z, i);
  });
  // Lanterns along the chamber rim, clear of the lanes and both structures.
  for (const t of [-15, -7.5, 0, 7.5, 15])
    for (const [x, z] of [
      [t, -FLOOR],
      [t, FLOOR],
      [-FLOOR, t],
      [FLOOR, t],
    ]) {
      const nearLane = lanes.some((l) => distToSegment(x, z, l) < LANE_HALF + 1.5);
      if (!nearLane) lamp(x, 0, z);
    }
  // Rubble at the foot of the cliffs.
  for (const { x, z } of tiles) {
    const r = hash(x, z, 13);
    if (r > 0.3 || at(x, z) !== 0) continue;
    const ring = Math.max(Math.abs(x), Math.abs(z)) - FLOOR;
    const lane = Math.min(...lanes.map((l) => distToSegment(x, z, l)));
    if (ring < 0 || lane < LANE_HALF + 0.5) continue;
    const size = 0.22 + r * 0.8;
    pose.position.set(
      x + (hash(x, z, 14) - 0.5) * 0.5,
      size / 2 - 0.02,
      z + (hash(x, z, 15) - 0.5) * 0.5,
    );
    pose.rotation.set(0, hash(x, z, 16) * 1.5, 0);
    pose.scale.setScalar(size);
    rubble.add(-1);
  }
  pose.rotation.set(0, 0, 0);
  pose.scale.setScalar(1);

  // Shared masonry for both structures: stone-textured blocks, half-cell bricks.
  const masonry = (hex: string) => new THREE.MeshLambertMaterial({ color: hex, map: stone });
  const block = (
    parent: THREE.Object3D,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material,
    density = 2,
  ) => {
    const m = new THREE.Mesh(stoneBox(w, h, d, density), material);
    m.position.set(x, y + h / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  // Cave mouth: a stepped brick arch set into a tall rock face, the tunnel dark beyond it, lanterns
  // hung on the jambs and standing either side.
  const cave = new THREE.Group();
  cave.name = 'cave-mouth';
  cave.position.set(mouth.x, 0, mouth.z);
  const brick = masonry('#7c8085');
  const face = masonry('#5e6368');
  const dark = new THREE.MeshBasicMaterial({ color: '#08090b' });
  block(cave, 10, 6.5, 3.4, 0, 0, -2.4, face, 1);
  block(cave, 3.8, 4.1, 0.8, 0, 0, -0.9, dark); // the tunnel's depth
  block(cave, 1.3, 3, 1.6, -2.55, 0, 0.2, brick);
  block(cave, 1.3, 3, 1.6, 2.55, 0, 0.2, brick);
  block(cave, 1.3, 0.5, 1.6, -2.05, 3, 0.2, brick); // stepped voussoirs
  block(cave, 1.3, 0.5, 1.6, 2.05, 3, 0.2, brick);
  block(cave, 1.6, 0.5, 1.6, -1.6, 3.5, 0.2, brick);
  block(cave, 1.6, 0.5, 1.6, 1.6, 3.5, 0.2, brick);
  block(cave, 5.4, 0.6, 1.6, 0, 4, 0.2, brick);
  const shade = new THREE.Mesh(
    new THREE.PlaneGeometry(3.8, 1.6).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: '#000',
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }),
  );
  shade.position.set(0, 0.005, -0.1); // the floor fades into the tunnel
  cave.add(shade);
  group.add(cave);
  lamp(mouth.x - 2.55, 2, mouth.z + 1.15, -1, 0);
  lamp(mouth.x + 2.55, 2, mouth.z + 1.15, -1, 0);
  lamp(mouth.x - 4, 0, mouth.z + 1.8);
  lamp(mouth.x + 4, 0, mouth.z + 1.8);

  // Crystal vault: an open keep set into the east wall, gate toward the board. Four crenellated
  // towers with blue banners and curtain walls in the board walls' masonry greys; ice crystals
  // fill the courtyard round the heart crystal on its pedestal, visible over the walls.
  const fort = new THREE.Group();
  fort.name = 'cave-fortress';
  fort.position.set(vault.x, 0, vault.z);
  fort.rotation.y = -Math.PI / 2; // its front (+z) faces west, toward E
  /** Fort-local (x, z) to world, for decor that lives in the shared instanced meshes. */
  const fortWorld = (lx: number, lz: number) => [vault.x - lz, vault.z + lx] as const;
  const wall = masonry('#73787a');
  const cap = masonry('#808486');
  const footing = masonry('#62676a');
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
  block(fort, 7, 2.2, 0.7, 0, 0.3, -3.5, wall);
  block(fort, 0.7, 2.2, 7, -3.5, 0.3, 0, wall);
  block(fort, 0.7, 2.2, 7, 3.5, 0.3, 0, wall);
  block(fort, 2.4, 2.2, 0.7, -2.3, 0.3, 3.5, wall);
  block(fort, 2.4, 2.2, 0.7, 2.3, 0.3, 3.5, wall);
  block(fort, 2.2, 0.7, 0.7, 0, 1.8, 3.5, wall); // lintel over the gate
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
    block(fort, 1.7, 3.4, 1.7, tx, 0.3, tz, wall);
    block(fort, 1.9, 0.2, 1.9, tx, 3.7, tz, cap);
    for (const [mx, mz] of [
      [-0.65, -0.65],
      [0.65, -0.65],
      [-0.65, 0.65],
      [0.65, 0.65],
    ])
      block(fort, 0.42, 0.4, 0.42, tx + mx, 3.9, tz + mz, cap);
    const [wx, wz] = fortWorld(tx, tz);
    lamp(wx, 3.9, wz, -1, 0.3);
  }
  // Banners on the front towers and beside the gate: blue cloth, gold trim and a gem emblem.
  const cloth = new THREE.MeshLambertMaterial({ color: '#2a4d8c', side: THREE.DoubleSide });
  const gold = new THREE.MeshLambertMaterial({ color: '#c9a24a', emissive: '#3a2a08' });
  for (const [bx, bz, w, top] of [
    [-3.5, 4.36, 0.9, 3.3],
    [3.5, 4.36, 0.9, 3.3],
    [-1.45, 3.86, 0.6, 2.2],
    [1.45, 3.86, 0.6, 2.2],
  ]) {
    const length = top * 0.55;
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(w, length), cloth);
    banner.position.set(bx, top - length / 2, bz);
    const rod = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, 0.07, 0.07), gold);
    rod.position.set(bx, top, bz + 0.02);
    const emblem = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 0.4, w * 0.4).rotateZ(Math.PI / 4),
      gold,
    );
    emblem.position.set(bx, top - length * 0.45, bz + 0.01);
    fort.add(banner, rod, emblem);
  }
  // Portcullis across the gate.
  const bars = new THREE.MeshLambertMaterial({ color: '#26292c' });
  for (let i = -0.9; i <= 0.91; i += 0.3) block(fort, 0.09, 1.5, 0.09, i, 0.3, 3.75, bars);
  block(fort, 2, 0.09, 0.09, 0, 1.1, 3.75, bars);
  // Heart crystal on its pedestal, a glow round it, ice crystals in the courtyard corners.
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
  heart.name = 'cave-heart';
  heart.position.set(0, 2.6, 0);
  heart.castShadow = true;
  const aura = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glow,
      color: ICE,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    }),
  );
  aura.position.copy(heart.position);
  aura.scale.setScalar(5);
  fort.add(heart, aura);
  group.add(fort);
  for (const [lx, lz] of [
    [-2.2, -2.2],
    [2.2, -2.2],
    [-2.3, 2.1],
    [2.3, 2.1],
  ]) {
    const [wx, wz] = fortWorld(lx, lz);
    cluster(wx, 0.3, wz, 'ice', 1.15, -1);
  }
  pools.push({ x: vault.x, y: 2.6, z: vault.z, color: ICE, radius: 8, strength: 0.7, column: -1 });
  for (const lx of [-1.6, 1.6]) {
    const [wx, wz] = fortWorld(lx, 4.7);
    lamp(wx, 0, wz);
  }

  const meshes = [shards.amber, shards.ice, lantern.post, lantern.frame, lantern.flame, rubble];
  for (const m of meshes) m.build();
  const haloMesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: glow,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    }),
    halos.length,
  );
  haloMesh.name = 'cave-halos';
  haloMesh.renderOrder = 2;
  halos.forEach((h, i) => haloMesh.setColorAt(i, h.tint.clone().multiplyScalar(0.55)));
  group.add(haloMesh);

  // Floor: one flat mesh of stone tiles level with the board's slab, darkened where it meets the
  // cliffs and lit by every pool. Built once, against the full-height rock.
  fill(columns.map((c) => c.h));
  const floorData = meshData();
  const none = new Set<number>();
  for (const { x, z } of tiles) {
    const tone = color.set(FLOOR_TONES[Math.floor(hash(x, z, 2) * FLOOR_TONES.length)]).clone();
    const corner = (cx: number, cz: number) => {
      const [sx, sz] = [cx > x ? 1 : -1, cz > z ? 1 : -1];
      const rock = +(at(x + sx, z) > 0) + +(at(x, z + sz) > 0) + +(at(x + sx, z + sz) > 0);
      return [cx, -0.02, cz, cx, cz, 1 - 0.2 * rock];
    };
    const [x0, x1, z0, z1] = [x - 0.5, x + 0.5, z - 0.5, z + 0.5];
    floorData.quad([corner(x0, z0), corner(x0, z1), corner(x1, z1), corner(x1, z0)], tone, none);
  }
  const floor = new THREE.Mesh(
    floorData.geometry(),
    new THREE.MeshLambertMaterial({ vertexColors: true, map: stone }),
  );
  floor.name = 'cave-floor';
  floor.receiveShadow = true;
  group.add(floor);

  // Cutaway: cap every rock column at the height that keeps the board visible from this view.
  // Recomputed per whole degree of camera change, so free rotation stays smooth.
  let lastView = '';
  const toCamera = new THREE.Vector3();
  const billboard = new THREE.Matrix4();
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
    // Decor on a lowered column would float: hide it, and its light, until the column is whole.
    const off = new Set<number>();
    heights.forEach((h, i) => h < columns[i].h && off.add(i));
    buildRock(heights, off);
    const lowered = (column: number) => off.has(column);
    for (const m of meshes) m.hide(lowered);
    // Halos face the camera, nudged toward it so the rock they stand on does not clip them.
    const elevation = (elevationDeg * Math.PI) / 180;
    toCamera.set(dx * Math.cos(elevation), Math.sin(elevation), dz * Math.cos(elevation));
    billboard.lookAt(toCamera, new THREE.Vector3(), new THREE.Vector3(-dx, 0, -dz).add(pose.up));
    pose.quaternion.setFromRotationMatrix(billboard);
    halos.forEach((h, i) => {
      pose.position.copy(h.at).addScaledVector(toCamera, 0.8);
      pose.scale.setScalar(lowered(h.column) ? 0 : h.size);
      pose.updateMatrix();
      haloMesh.setMatrixAt(i, pose.matrix);
    });
    haloMesh.instanceMatrix.needsUpdate = true;
    pose.quaternion.identity();
    pose.scale.setScalar(1);
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
      aura.material.color.copy(heartMaterial.emissive);
      aura.material.opacity = 0.25 + 0.6 * hpRatio + flash * 0.5;
      fort.position.x = vault.x + (reducedMotion ? 0 : Math.sin(clock * 60) * 0.05 * flash);
    },
    /** For tests: rock column count and the lanes' clear floor. */
    debug: { columns, tiles, lanes, mouth, vault },
  };
}
export type Environment = ReturnType<typeof createEnvironment>;
