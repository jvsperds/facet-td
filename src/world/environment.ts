import * as THREE from 'three';
import type { Cell } from '../sim/board';
import { toScene } from './view';

// The voxel cavern around the board (docs/art/environment, style studies B/C and the connected
// cave concept D). Presentation only: nothing here is a board cell, waypoint or rule.
// - The board stands on the floor of a cavern that runs on past it in every direction: rock masses,
//   outcrops and stalagmites rise from the floor with passages winding between them, and the whole
//   cave dissolves into darkness at its edges, so it never shows a rim.
// - Half-cell voxels and low near ledges keep the rock in proportion with the one-cell board.
// - A brick-arched cave mouth set into a rock face north of the spawn (S) is where creeps come
//   from; a fortified crystal vault set into rock east of the castle exit (E) is what they attack.
//   Both face inward, keep their world orientation, and are reached over clear floor lanes.
// - Light sets the mood: glowing amber and ice crystal clusters bake light pools
//   into the rock and floor vertex colours and draw additive halos; dust drifts in the air. No real
//   lights are added, so the cave costs the same however many crystals it has.
// - The vault's heart crystal dims as castle HP falls and flashes when a creep gets through.
// - Foreground rock is cut down to the height where it would start to hide the board, recomputed
//   when the camera turns (the study's cutaway), so the arena stays readable at every angle.

const HALF = 18.5; // board half-size in cells
const FLOOR = HALF + 1.5; // clear floor ring around the board
const VOXEL = 0.5; // rock and floor voxel size, in cells
const N = 68; // voxels from the centre to the terrain's edge (34 cells)
const LANE_HALF = 1.8; // half-width of the clear approach lanes
const MOUTH_SCALE = 0.6;
const FORT_SCALE = 0.65;
const ROCK = ['#6e7378', '#757a7f', '#686d72', '#7c8186', '#63686d'];
const FLOOR_TONES = ['#5b6065', '#565b60', '#60656a'];
/** Depth of the cave floor below the board's raised platform, in cells. */
const DROP = 5;
/** Scene backdrop (world.ts) in sRGB: the cave fades into it. */
const BACKDROP = [43 / 255, 47 / 255, 52 / 255];
const AMBER = new THREE.Color('#ffb04a');
const ICE = new THREE.Color('#5aa6ff');

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

/** A light baked into the rock and floor colours: glowing crystals. */
type Pool = {
  x: number;
  y: number;
  z: number;
  color: THREE.Color;
  radius: number;
  strength: number;
  column: number;
};

const smoothstep = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** How far the cave has dissolved into the backdrop at (x, z): 0 near the board, 1 at the edge. */
const fadeAt = (x: number, z: number) => smoothstep(28, 34.5, Math.hypot(x, z));

/**
 * Fog: mix each fragment toward the backdrop by its distance from the board, after lighting, the
 * same for rock, floor and the structures in it. It thins round `clear` (the vault's heart
 * crystal), so the heart's light carries through; glowing crystals and halos are left unfogged.
 */
function fogged<T extends THREE.Material>(material: T, clear: { x: number; z: number }) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.fogClear = { value: new THREE.Vector2(clear.x, clear.z) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFogXZ;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
  vec4 fogWorld = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    fogWorld = instanceMatrix * fogWorld;
  #endif
  vFogXZ = (modelMatrix * fogWorld).xz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec2 vFogXZ;\nuniform vec2 fogClear;',
      )
      .replace(
        '#include <dithering_fragment>',
        `float fogAmount = smoothstep(28.0, 34.5, length(vFogXZ));
  fogAmount *= 1.0 - 0.8 * max(0.0, 1.0 - distance(vFogXZ, fogClear) / 7.0);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(${BACKDROP.map((c) => c.toFixed(4))}), fogAmount);
  #include <dithering_fragment>`,
      );
  };
  return material;
}

/** Height of the rock at a voxel, 0 for open floor; before any structure is set into it. */
function rockHeight(x: number, z: number, i: number, j: number, ring: number) {
  // Rock masses where two octaves of smooth noise rise over a threshold that falls with distance,
  // so the floor near the board is open and passages still wind out between the far masses.
  const mass = 0.62 * smooth(x / 7.5, z / 7.5) + 0.38 * smooth(x / 3 + 17, z / 3 + 5);
  const threshold = Math.max(0.28, 0.56 - 0.032 * ring);
  let h = 0;
  if (mass > threshold)
    h = 0.4 + (mass - threshold) * 12 + ring * 0.2 + hash(i >> 1, j >> 1, 1) * 0.4;
  // Stalagmites: a tall one-cell core with a stepped skirt, on a two-cell grid.
  const [pi, pj] = [i >> 2, j >> 2];
  if (ring > 2.5 && hash(pi, pj, 8) < 0.1) {
    const tall = 2.2 + hash(pi, pj, 11) * 4 + ring * 0.08;
    const [ci, cj] = [i & 3, j & 3];
    const core = ci >= 1 && ci <= 2 && cj >= 1 && cj <= 2;
    h = Math.max(h, core ? tall : hash(i, j, 12) < 0.6 ? tall * 0.35 : 0);
  }
  // Near the board the rock stays low: ledges, not walls.
  return Math.min(h, 0.5 + ring * 0.6, 8);
}

export function createEnvironment(scene: THREE.Scene, spawn: Cell, exit: Cell) {
  const group = new THREE.Group();
  group.name = 'cave';
  scene.add(group);
  const s = toScene(spawn);
  const e = toScene(exit);
  // The mouth sits in rock north of S; the vault in rock east of E, each just past the floor ring.
  const mouth = { x: s.x, z: -FLOOR - 1.6 };
  const vault = { x: FLOOR + 1 + 4.2 * FORT_SCALE, z: e.z };
  /** Inside the tunnel, hidden by its darkness: where creeps start their walk to S. */
  const tunnel = { x: mouth.x, z: mouth.z - 0.6 };
  // The cutaway keeps the board and both structures in view.
  const keeps: Keep[] = [
    { x: 0, z: 0, hx: HALF + 0.5, hz: HALF + 0.5 },
    { x: mouth.x, z: mouth.z + 0.3, hx: 2.2, hz: 1 },
    { x: vault.x, z: vault.z, hx: 3, hz: 3 },
  ];
  const lanes: Lane[] = [
    { from: [s.x, s.z], to: [mouth.x, mouth.z + 0.6] },
    { from: [e.x, e.z], to: [vault.x - 4 * FORT_SCALE, vault.z] },
  ];
  const stone = stoneTexture();
  const glow = glowTexture();

  // Voxel grid: rock columns and floor tiles, half a cell each.
  type Voxel = { x: number; z: number; i: number; j: number; ring: number; fade: number };
  // Heights are measured from the cave floor, DROP below the board. The board, its rim, the two
  // approach lanes and the ledges the structures stand on are a raised platform level with the
  // board (height DROP), so the arena floats over the dark cave floor among the rock.
  /** A rock column; `pools`: the light pools that can reach it. */
  type Column = Voxel & { h: number; tone: THREE.Color; pools: Pool[] };
  const columns: Column[] = [];
  /** Floor tiles; `raised` ones are the platform, level with the board. */
  const tiles: (Voxel & { raised: boolean; pools: Pool[] })[] = [];
  const W = 2 * N + 1;
  const grid = new Float32Array(W * W); // current column heights; 0 for the cave floor
  /** The platform (board, rim, lanes, ledges) at DROP; everything else 0 until rock is filled in. */
  const ground = new Float32Array(W * W);
  const index = (i: number, j: number) => (i + N) * W + j + N;
  /** Height at a voxel; beyond the terrain counts as solid so its outer faces are never drawn. */
  const at = (i: number, j: number) =>
    Math.abs(i) > N || Math.abs(j) > N ? Infinity : grid[index(i, j)];
  for (let i = -N; i <= N; i++)
    for (let j = -N; j <= N; j++) {
      const [x, z] = [i * VOXEL, j * VOXEL];
      if (Math.abs(x) <= HALF && Math.abs(z) <= HALF) {
        ground[index(i, j)] = DROP;
        continue;
      }
      const fade = fadeAt(x, z);
      if (fade >= 0.985) continue; // lost in the dark: nothing to draw
      const ring = Math.max(Math.abs(x), Math.abs(z)) - FLOOR;
      const lane = Math.min(...lanes.map((l) => distToSegment(x, z, l)));
      // Floor under and in front of the two structures, so they stand on the cave floor.
      const atMouth = Math.abs(x - mouth.x) <= 3.2 && z >= mouth.z - 0.9 && z <= mouth.z + 1.5;
      const atVault = Math.abs(x - vault.x) <= 3 && Math.abs(z - vault.z) <= 3;
      const voxel = { x, z, i, j, ring, fade };
      if (ring <= 0 || lane <= LANE_HALF || atMouth || atVault) {
        tiles.push({ ...voxel, raised: true, pools: [] });
        ground[index(i, j)] = DROP;
        continue;
      }
      let h = rockHeight(x, z, i, j, ring);
      // Both structures are set into a rock face, not left standing in the open.
      if (h || ring > 0) {
        const behindMouth = Math.abs(x - mouth.x) < 5.5 && z < mouth.z + 0.3 && z > mouth.z - 6;
        const besideVault = x > vault.x - 3.6 && x < vault.x + 7 && Math.abs(z - vault.z) < 6.5;
        if ((behindMouth || besideVault) && !atMouth && !atVault && lane > LANE_HALF)
          h = Math.max(h, 3 + hash(i, j, 21) * 0.8);
      }
      h = Math.round(h * 4) / 4;
      if (h < 0.25) tiles.push({ ...voxel, raised: false, pools: [] });
      else {
        // One tone per one-cell block of four voxels, so blocks read as single stones. Rock rises
        // from the cave floor, so it stands DROP taller than its height above the board.
        const tone = new THREE.Color(ROCK[Math.floor(hash(i >> 1, j >> 1, 1) * ROCK.length)]);
        columns.push({ ...voxel, h: h + DROP, tone, pools: [] });
      }
    }
  const fill = (heights: number[]) => {
    grid.set(ground);
    columns.forEach(({ i, j }, k) => (grid[index(i, j)] = heights[k]));
  };
  fill(columns.map((c) => c.h));

  // Baked light pools. Lamps and crystals register theirs as they are placed below.
  const pools: Pool[] = [];
  const color = new THREE.Color();
  const light = (
    x: number,
    y: number,
    z: number,
    out: THREE.Color,
    near: Pool[],
    off: Set<number>,
  ) => {
    for (const p of near) {
      if (off.has(p.column)) continue;
      const d = Math.hypot(x - p.x, (y - p.y) * 1.3, z - p.z);
      if (d >= p.radius) continue;
      const k = (1 - d / p.radius) ** 2 * p.strength;
      out.r += p.color.r * k;
      out.g += p.color.g * k;
      out.b += p.color.b * k;
    }
  };
  // Darker away from the board, before the fade takes the rest.
  // Darker toward the cave floor too, so the drop below the platform reads as depth.
  const depth = (x: number, y: number, z: number) =>
    Math.max(0.55, Math.min(1, 1 - (Math.hypot(x, z) - 24) / 16)) *
    (y >= 0 ? 1 : 0.4 + 0.6 * Math.max(0, 1 + y / DROP));

  /** Mesh data: positions, UVs and baked colours, two triangles per quad. */
  const meshData = () => {
    const pos: number[] = [];
    const uv: number[] = [];
    const col: number[] = [];
    const vertex = (
      [x, y, z, u, v, shade]: number[],
      base: THREE.Color,
      near: Pool[],
      off: Set<number>,
    ) => {
      pos.push(x, y, z);
      uv.push(u, v);
      color.copy(base).multiplyScalar(shade * depth(x, y, z));
      light(x, y, z, color, near, off);
      col.push(color.r, color.g, color.b);
    };
    return {
      quad(corners: number[][], base: THREE.Color, near: Pool[], off: Set<number>) {
        for (const k of [0, 1, 2, 0, 2, 3]) vertex(corners[k], base, near, off);
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
  // sampling: the rock fills much of the screen, so it must stay cheap.
  const rock = new THREE.Mesh(
    new THREE.BufferGeometry(),
    fogged(new THREE.MeshLambertMaterial({ vertexColors: true, map: stone }), vault),
  );
  rock.name = 'cave-rock';
  const base = new THREE.Color();
  const platformStone = new THREE.Color('#5f646a');
  const r = VOXEL / 2;
  function buildRock(heights: number[], off: Set<number>) {
    fill(heights);
    const mesh = meshData();
    columns.forEach(({ x, z, i, j, tone, pools: near }, k) => {
      const h = heights[k];
      // Higher rock catches more light.
      base.copy(tone).multiplyScalar(0.7 + 0.35 * Math.min(1, h / 5));
      const [x0, x1, z0, z1] = [x - r, x + r, z - r, z + r];
      // Top: each corner darkens for every taller neighbour around it (voxel ambient occlusion).
      const corner = (cx: number, cz: number) => {
        const [si, sj] = [cx > x ? 1 : -1, cz > z ? 1 : -1];
        const taller = +(at(i + si, j) > h) + +(at(i, j + sj) > h) + +(at(i + si, j + sj) > h);
        return [cx, h - DROP, cz, cx / VOXEL, cz / VOXEL, 1 - 0.17 * taller];
      };
      mesh.quad([corner(x0, z0), corner(x0, z1), corner(x1, z1), corner(x1, z0)], base, near, off);
      // Sides down to each lower neighbour, dark at the foot like a crevice.
      for (const [ni, nj, a, b] of [
        [i + 1, j, [x1, z1], [x1, z0]],
        [i - 1, j, [x0, z0], [x0, z1]],
        [i, j + 1, [x0, z1], [x1, z1]],
        [i, j - 1, [x1, z0], [x0, z0]],
      ] as [number, number, number[], number[]][]) {
        const low = at(ni, nj);
        if (low >= h) continue;
        const along = ni === i ? 0 : 1; // UV runs along x for z-facing sides, z for x-facing
        const foot = low === 0 ? 0.4 : 0.58;
        mesh.quad(
          [
            [a[0], low - DROP, a[1], a[along] / VOXEL, low / VOXEL, foot],
            [b[0], low - DROP, b[1], b[along] / VOXEL, low / VOXEL, foot],
            [b[0], h - DROP, b[1], b[along] / VOXEL, h / VOXEL, 0.9],
            [a[0], h - DROP, a[1], a[along] / VOXEL, h / VOXEL, 0.9],
          ],
          base,
          near,
          off,
        );
      }
    });
    // The platform's own sides: sheer stone from the board's level down into the dark.
    for (const { x, z, i, j, raised, pools: near } of tiles) {
      if (!raised) continue;
      const [x0, x1, z0, z1] = [x - r, x + r, z - r, z + r];
      for (const [ni, nj, a, b] of [
        [i + 1, j, [x1, z1], [x1, z0]],
        [i - 1, j, [x0, z0], [x0, z1]],
        [i, j + 1, [x0, z1], [x1, z1]],
        [i, j - 1, [x1, z0], [x0, z0]],
      ] as [number, number, number[], number[]][]) {
        const low = at(ni, nj);
        if (low >= DROP) continue;
        const along = ni === i ? 0 : 1;
        mesh.quad(
          [
            [a[0], low - DROP, a[1], a[along] / VOXEL, low / VOXEL, 0.4],
            [b[0], low - DROP, b[1], b[along] / VOXEL, low / VOXEL, 0.4],
            [b[0], -0.02, b[1], b[along] / VOXEL, DROP / VOXEL, 0.95],
            [a[0], -0.02, a[1], a[along] / VOXEL, DROP / VOXEL, 0.95],
          ],
          platformStone,
          near,
          off,
        );
      }
    }
    rock.geometry.dispose();
    rock.geometry = mesh.geometry();
  }
  group.add(rock);

  // Decor: instanced crystals and rubble. Items on rock remember their column, so the
  // cutaway can hide them while it lowers that column.
  const pose = new THREE.Object3D();
  const axis = new THREE.Vector3();
  type Item = { column: number; matrix: THREE.Matrix4 };
  const instancer = (geometry: THREE.BufferGeometry, material: THREE.Material, name: string) => {
    const items: Item[] = [];
    let mesh: THREE.InstancedMesh | undefined;
    return {
      add(column: number) {
        pose.updateMatrix();
        items.push({ column, matrix: pose.matrix.clone() });
      },
      build() {
        mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, items.length));
        mesh.name = name;
        mesh.count = items.length;
        items.forEach((it, k) => mesh!.setMatrixAt(k, it.matrix));
        group.add(mesh);
      },
      hide(lowered: (column: number) => boolean) {
        const none = new THREE.Matrix4().makeScale(0, 0, 0);
        items.forEach((it, k) => mesh!.setMatrixAt(k, lowered(it.column) ? none : it.matrix));
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
  const rubble = instancer(
    new THREE.BoxGeometry(1, 1, 1),
    fogged(new THREE.MeshLambertMaterial({ color: '#6a6f74', map: stone }), vault),
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
      const angle = (k / count) * Math.PI * 2 + hash(x * 4, z * 4, 60 + k);
      const [c, sn] = [Math.cos(angle), Math.sin(angle)];
      const reach = k === 0 ? 0 : (0.22 + hash(x * 4, z * 4, 70 + k) * 0.22) * size;
      const tall = (k === 0 ? 1.6 : 0.6 + hash(x * 4, z * 4, 80 + k) * 0.7) * size;
      const tilt = k === 0 ? 0.05 : 0.3 + hash(x * 4, z * 4, 90 + k) * 0.35;
      pose.position.set(x + c * reach, y, z + sn * reach);
      pose.quaternion.setFromAxisAngle(axis.set(sn, 0, -c), tilt);
      pose.scale.set(size, tall, size);
      shards[tone].add(column);
    }
    pose.quaternion.identity();
    pose.scale.setScalar(1);
    pools.push({ x, y: y + 0.6 * size, z, color: tint, radius: 5 * size, strength: 0.8, column });
    halos.push({ column, at: new THREE.Vector3(x, y + 0.8 * size, z), size: 3 * size, tint });
  }

  // Scattered crystals, kept apart so clusters read individually. They glow on ledges and the open
  // floor, and glint far off in the dark.
  const placed: { x: number; z: number }[] = [];
  const clear = (x: number, z: number, gap: number) =>
    placed.every((p) => Math.hypot(p.x - x, p.z - z) >= gap);
  const crystalTone = (x: number, z: number) =>
    hash(x * 4, z * 4, 6) < (x > 0 ? 0.65 : 0.3) ? 'ice' : 'amber';
  // Sites: rock tops and the cave floor (not the platform), with their height above the board.
  const sites = [
    ...columns.map((c, k) => ({ ...c, top: c.h - DROP, column: k })),
    ...tiles.filter((t) => !t.raised).map((t) => ({ ...t, top: -DROP, column: -1 })),
  ].sort((a, b) => hash(a.i, a.j, 3) - hash(b.i, b.j, 3));
  for (const c of sites) {
    if (c.ring < 1.5 || c.fade > 0.85 || hash(c.i, c.j, 4) > 0.04) continue;
    const far = c.fade > 0.35;
    if (!clear(c.x, c.z, far ? 6 : 8)) continue;
    if (c.top > 4) continue; // not on stalagmite tips
    placed.push(c);
    const size = far ? 0.45 + hash(c.i, c.j, 12) * 0.3 : 0.6 + hash(c.i, c.j, 12) * 0.45;
    cluster(c.x, c.top, c.z, crystalTone(c.x, c.z), size, c.column);
  }
  // Small warm clusters close to the arena light its rim in place of torches.
  for (const c of sites) {
    if (c.ring < 1 || c.ring > 7 || c.top > 2 || hash(c.i, c.j, 5) > 0.03) continue;
    if (!clear(c.x, c.z, 5)) continue;
    placed.push(c);
    cluster(c.x, c.top, c.z, 'amber', 0.35 + hash(c.i, c.j, 17) * 0.2, c.column);
  }
  // Rubble at the foot of the rock.
  for (const { x, z, i, j, ring, raised } of tiles) {
    const v = hash(i, j, 13);
    if (v > 0.14 || ring < 0) continue;
    const level = raised ? DROP : 0;
    if (Math.max(at(i + 1, j), at(i - 1, j), at(i, j + 1), at(i, j - 1)) <= level) continue;
    if (Math.min(...lanes.map((l) => distToSegment(x, z, l))) < LANE_HALF + 0.3) continue;
    const size = 0.12 + v * 1.7;
    pose.position.set(
      x + (hash(i, j, 14) - 0.5) * 0.2,
      size / 2 - 0.02 + level - DROP,
      z + (hash(i, j, 15) - 0.5) * 0.2,
    );
    pose.rotation.set(0, hash(i, j, 16) * 1.5, 0);
    pose.scale.setScalar(size);
    rubble.add(-1);
  }
  pose.rotation.set(0, 0, 0);
  pose.scale.setScalar(1);

  // Shared masonry for both structures: stone-textured blocks, half-cell bricks.
  const masonry = (hex: string) =>
    fogged(new THREE.MeshLambertMaterial({ color: hex, map: stone }), vault);
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

  // Cave mouth: a stepped brick arch set into a rock face, the tunnel dark beyond it. Modelled in
  // study units, then scaled down.
  const cave = new THREE.Group();
  cave.name = 'cave-mouth';
  cave.position.set(mouth.x, 0, mouth.z);
  cave.scale.setScalar(MOUTH_SCALE);
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

  // Crystal vault: an open keep set into the rock, gate toward the board. Four crenellated towers
  // with blue banners and curtain walls in the board walls' masonry greys; ice crystals fill the
  // courtyard round the heart crystal on its pedestal, visible over the walls.
  const fort = new THREE.Group();
  fort.name = 'cave-fortress';
  fort.position.set(vault.x, 0, vault.z);
  fort.rotation.y = -Math.PI / 2; // its front (+z) faces west, toward E
  fort.scale.setScalar(FORT_SCALE);
  /** Fort-local (x, z) to world, for decor that lives in the shared instanced meshes. */
  const fortWorld = (lx: number, lz: number) =>
    [vault.x - lz * FORT_SCALE, vault.z + lx * FORT_SCALE] as const;
  const wall = masonry('#73787a');
  const cap = masonry('#808486');
  const footing = masonry('#62676a');
  // The castle crumbles as its HP falls: every part above the footing and the lower courses has
  // an HP share below which it breaks off and tumbles to the ground. Crenels, merlons and banners
  // go first, then tower caps, upper courses and tower tops, and last the lintel and the
  // portcullis, the gate broken in. Healing puts the parts back.
  type Part = {
    mesh: THREE.Mesh;
    below: number;
    home: { position: THREE.Vector3; rotation: THREE.Euler };
    material: THREE.Material | THREE.Material[];
    state: 'whole' | 'falling' | 'fallen';
    velocity: THREE.Vector3;
    spin: THREE.Vector3;
  };
  const parts: Part[] = [];
  let partSeed = 0;
  /** Register `mesh` to break off once castle HP drops below a share in [lo, hi). */
  const breaks = (mesh: THREE.Mesh, lo: number, hi: number) => {
    const below = lo + hash(partSeed++, 7, 41) * (hi - lo);
    parts.push({
      mesh,
      below,
      home: { position: mesh.position.clone(), rotation: mesh.rotation.clone() },
      material: mesh.material,
      state: 'whole',
      velocity: new THREE.Vector3(),
      spin: new THREE.Vector3(),
    });
    return mesh;
  };
  const crenels = (x0: number, x1: number, z0: number, z1: number, y: number) => {
    const along = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const length = along ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    for (let t = 0.3; t < length; t += 0.6) {
      const k = t / length;
      breaks(
        block(fort, 0.32, 0.35, 0.32, x0 + (x1 - x0) * k, y, z0 + (z1 - z0) * k, cap),
        0.55,
        0.97,
      );
    }
  };
  /** A curtain wall: a solid lower course and an upper course in chunks that can fall. */
  const curtain = (w: number, d: number, x: number, z: number) => {
    block(fort, w, 1.4, d, x, 0.3, z, wall);
    const along = w > d;
    const length = along ? w : d;
    const pieces = Math.max(1, Math.round(length / 1.2));
    for (let k = 0; k < pieces; k++) {
      const offset = -length / 2 + (length / pieces) * (k + 0.5);
      const size = length / pieces;
      breaks(
        block(
          fort,
          along ? size : w,
          0.8,
          along ? d : size,
          along ? x + offset : x,
          1.7,
          along ? z : z + offset,
          wall,
        ),
        0.1,
        0.45,
      );
    }
  };
  block(fort, 8.4, 0.3, 8.4, 0, 0, 0, footing);
  // Curtain walls: back and sides solid, the front split by the gate.
  curtain(7, 0.7, 0, -3.5);
  curtain(0.7, 7, -3.5, 0);
  curtain(0.7, 7, 3.5, 0);
  curtain(2.4, 0.7, -2.3, 3.5);
  curtain(2.4, 0.7, 2.3, 3.5);
  breaks(block(fort, 2.2, 0.7, 0.7, 0, 1.8, 3.5, wall), 0.08, 0.12); // lintel over the gate
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
    block(fort, 1.7, 2.2, 1.7, tx, 0.3, tz, wall);
    breaks(block(fort, 1.7, 1.2, 1.7, tx, 2.5, tz, wall), 0.15, 0.3);
    breaks(block(fort, 1.9, 0.2, 1.9, tx, 3.7, tz, cap), 0.32, 0.5);
    for (const [mx, mz] of [
      [-0.65, -0.65],
      [0.65, -0.65],
      [-0.65, 0.65],
      [0.65, 0.65],
    ])
      breaks(block(fort, 0.42, 0.4, 0.42, tx + mx, 3.9, tz + mz, cap), 0.55, 0.97);
  }
  // Banners on the front towers and beside the gate: blue cloth, gold trim and a gem emblem.
  const cloth = fogged(
    new THREE.MeshLambertMaterial({ color: '#2a4d8c', side: THREE.DoubleSide }),
    vault,
  );
  const gold = fogged(
    new THREE.MeshLambertMaterial({ color: '#c9a24a', emissive: '#3a2a08' }),
    vault,
  );
  for (const [bx, bz, w, top] of [
    [-3.5, 4.36, 0.9, 3.3],
    [3.5, 4.36, 0.9, 3.3],
    [-1.45, 3.86, 0.6, 2.2],
    [1.45, 3.86, 0.6, 2.2],
  ]) {
    const length = top * 0.55;
    // One banner: cloth with its emblem, hung from a rod; it falls as one piece.
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(w, length), cloth);
    banner.position.set(bx, top - length / 2, bz);
    const rod = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, 0.07, 0.07), gold);
    rod.position.set(0, length / 2, 0.02);
    const emblem = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 0.4, w * 0.4).rotateZ(Math.PI / 4),
      gold,
    );
    emblem.position.set(0, length * 0.05, 0.01);
    banner.add(rod, emblem);
    fort.add(banner);
    breaks(banner, 0.4, 0.8);
  }
  // Portcullis across the gate: the last thing to go.
  const bars = fogged(new THREE.MeshLambertMaterial({ color: '#26292c' }), vault);
  for (let i = -0.9; i <= 0.91; i += 0.3)
    breaks(block(fort, 0.09, 1.5, 0.09, i, 0.3, 3.75, bars), 0.02, 0.07);
  breaks(block(fort, 2, 0.09, 0.09, 0, 1.1, 3.75, bars), 0.02, 0.07);
  // Debris bursting from the gate when a creep breaks in, and smoke once the castle is burning.
  const DEBRIS = 14;
  const debris = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), wall, DEBRIS);
  debris.name = 'cave-debris';
  const flying: { at: THREE.Vector3; velocity: THREE.Vector3; life: number }[] = [];
  for (let k = 0; k < DEBRIS; k++) {
    flying.push({ at: new THREE.Vector3(), velocity: new THREE.Vector3(), life: 0 });
    debris.setMatrixAt(k, new THREE.Matrix4().makeScale(0, 0, 0));
  }
  fort.add(debris);
  const smokeMaterial = new THREE.SpriteMaterial({
    map: glow,
    color: '#7a7d80',
    transparent: true,
    depthWrite: false,
    opacity: 0,
  });
  const smoke = [-3.5, 3.5].flatMap((tx) =>
    [0, 1, 2].map((k) => {
      const puff = new THREE.Sprite(smokeMaterial.clone());
      puff.userData = { x: tx, z: 3.5 - k * 0.4, phase: k / 3 };
      fort.add(puff);
      return puff;
    }),
  );
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
    cluster(wx, 0.3 * FORT_SCALE, wz, 'ice', 1.15 * FORT_SCALE, -1);
  }
  pools.push({
    x: vault.x,
    y: 2.6 * FORT_SCALE,
    z: vault.z,
    color: ICE,
    radius: 5.5,
    strength: 0.7,
    column: -1,
  });

  const meshes = [shards.amber, shards.ice, rubble];
  for (const mesh of meshes) mesh.build();
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
  halos.forEach((h, k) => haloMesh.setColorAt(k, h.tint.clone().multiplyScalar(0.55)));
  group.add(haloMesh);

  // Each voxel keeps the pools that can reach it, so baking stays cheap on rebuild.
  const reach = (x: number, z: number) =>
    pools.filter((p) => Math.abs(p.x - x) < p.radius + r && Math.abs(p.z - z) < p.radius + r);
  for (const v of [...columns, ...tiles]) v.pools = reach(v.x, v.z);

  // Floor: one flat mesh of stone tiles level with the board's slab, darkened where it meets the
  // rock and lit by every pool. Built once, against the full-height rock; one stone per cell.
  const floorData = meshData();
  const none = new Set<number>();
  for (const { x, z, i, j, raised, pools: near } of tiles) {
    const [cx, cz] = [Math.floor(x + 0.5), Math.floor(z + 0.5)];
    const tone = new THREE.Color(FLOOR_TONES[Math.floor(hash(cx, cz, 2) * FLOOR_TONES.length)]);
    const level = raised ? DROP : 0;
    const corner = (px: number, pz: number) => {
      const [si, sj] = [px > x ? 1 : -1, pz > z ? 1 : -1];
      const taller =
        +(at(i + si, j) > level) + +(at(i, j + sj) > level) + +(at(i + si, j + sj) > level);
      return [px, raised ? -0.02 : -DROP, pz, px, pz, 1 - 0.2 * taller];
    };
    const [x0, x1, z0, z1] = [x - r, x + r, z - r, z + r];
    floorData.quad(
      [corner(x0, z0), corner(x0, z1), corner(x1, z1), corner(x1, z0)],
      tone,
      near,
      none,
    );
  }
  const floor = new THREE.Mesh(
    floorData.geometry(),
    fogged(new THREE.MeshLambertMaterial({ vertexColors: true, map: stone }), vault),
  );
  floor.name = 'cave-floor';
  floor.receiveShadow = true;
  group.add(floor);

  // Dust drifting through the crystal light.
  const MOTES = 180;
  const motePositions = new Float32Array(MOTES * 3);
  for (let k = 0; k < MOTES; k++) {
    // Round the arena, not over it: specks on the board would read as noise.
    const angle = hash(k, 1, 31) * Math.PI * 2;
    const radius = 22 + hash(k, 3, 31) * 9;
    motePositions[k * 3] = Math.cos(angle) * radius;
    motePositions[k * 3 + 1] = 0.3 - DROP + hash(k, 2, 31) * (4 + DROP);
    motePositions[k * 3 + 2] = Math.sin(angle) * radius;
  }
  const moteGeometry = new THREE.BufferGeometry();
  moteGeometry.setAttribute('position', new THREE.BufferAttribute(motePositions, 3));
  const motes = new THREE.Points(
    moteGeometry,
    new THREE.PointsMaterial({
      color: '#ffd9a0',
      size: 2.5,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  motes.name = 'cave-dust';
  group.add(motes);

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
      // Snap to quarter-cell steps so cut rock keeps its voxel terraces.
      // Measured from the cave floor, DROP below the board the cut protects.
      return Math.max(0.25, Math.min(h, Math.floor((t - 0.25) * slope * 4) / 4 + DROP));
    });
    // Decor on a lowered column would float: hide it, and its light, until the column is whole.
    const off = new Set<number>();
    heights.forEach((h, k) => h < columns[k].h && off.add(k));
    buildRock(heights, off);
    const lowered = (column: number) => off.has(column);
    for (const mesh of meshes) mesh.hide(lowered);
    // Halos face the camera, nudged toward it so the rock they stand on does not clip them.
    const elevation = (elevationDeg * Math.PI) / 180;
    toCamera.set(dx * Math.cos(elevation), Math.sin(elevation), dz * Math.cos(elevation));
    billboard.lookAt(toCamera, new THREE.Vector3(), new THREE.Vector3(-dx, 1, -dz));
    pose.quaternion.setFromRotationMatrix(billboard);
    halos.forEach((h, k) => {
      pose.position.copy(h.at).addScaledVector(toCamera, 0.8);
      pose.scale.setScalar(lowered(h.column) ? 0 : h.size);
      pose.updateMatrix();
      haloMesh.setMatrixAt(k, pose.matrix);
    });
    haloMesh.instanceMatrix.needsUpdate = true;
    pose.quaternion.identity();
    pose.scale.setScalar(1);
  }
  view(35.264, 45);

  // Castle state: the heart dims with castle HP and flashes red when a creep gets through.
  let hpRatio = 1;
  let flash = 0;
  let burst = 0;
  const box = new THREE.Box3();
  const settle = new THREE.Matrix4();
  // Soot: the masonry darkens as the castle burns.
  const clean = [wall, cap, footing].map((m) => (m as THREE.MeshLambertMaterial).color.clone());
  const soot = new THREE.Color('#2e3134');
  const matrix = new THREE.Matrix4();
  let clock = 0;
  const calm = new THREE.Color('#4aa8e8');
  const hurt = new THREE.Color('#ff5a4f');
  return {
    view,
    /** Inside the cave mouth's tunnel: where creeps start their walk to S. */
    tunnel,
    /** After each sim step: castle HP share and how much damage leaked this tick. */
    castle(ratio: number, leaked: number) {
      hpRatio = Math.max(0, Math.min(1, ratio));
      if (leaked > 0) {
        flash = 1;
        // Rubble flies out of the gate as the creep breaks in.
        flying.forEach((d, k) => {
          d.at.set((hash(k, burst, 51) - 0.5) * 1.6, 1 + hash(k, burst, 52), 3.6);
          d.velocity.set(
            (hash(k, burst, 53) - 0.5) * 4,
            2.5 + hash(k, burst, 54) * 3,
            2 + hash(k, burst, 55) * 3,
          );
          d.life = 1.2;
        });
        burst++;
      }
      for (const p of parts) {
        if (p.state === 'whole' && hpRatio < p.below) {
          // Break off: outward from the keep's centre, up, and tumbling.
          p.state = 'falling';
          const out = new THREE.Vector3(p.mesh.position.x, 0, p.mesh.position.z).normalize();
          p.velocity.copy(out).multiplyScalar(1.2 + hash(p.mesh.id, 3, 61) * 1.8);
          p.velocity.y = 1.5 + hash(p.mesh.id, 4, 61) * 2;
          p.spin.set(
            (hash(p.mesh.id, 5, 61) - 0.5) * 8,
            (hash(p.mesh.id, 6, 61) - 0.5) * 4,
            (hash(p.mesh.id, 7, 61) - 0.5) * 8,
          );
        } else if (p.state !== 'whole' && hpRatio >= p.below) {
          // Healed: the part is rebuilt where it stood.
          p.state = 'whole';
          p.mesh.position.copy(p.home.position);
          p.mesh.rotation.copy(p.home.rotation);
          p.mesh.material = p.material;
        }
      }
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
      [wall, cap, footing].forEach((m, k) =>
        (m as THREE.MeshLambertMaterial).color.copy(clean[k]).lerp(soot, (1 - hpRatio) * 0.55),
      );
      // Falling parts tumble down to the footing and come to rest as darker rubble.
      for (const p of parts) {
        if (p.state !== 'falling') continue;
        const m = p.mesh;
        if (!reducedMotion) {
          p.velocity.y -= 14 * dt;
          m.position.addScaledVector(p.velocity, dt);
          m.rotation.x += p.spin.x * dt;
          m.rotation.y += p.spin.y * dt;
          m.rotation.z += p.spin.z * dt;
        }
        m.geometry.computeBoundingBox();
        settle.makeRotationFromEuler(m.rotation);
        const bottom = box.copy(m.geometry.boundingBox!).applyMatrix4(settle).min.y;
        if (reducedMotion || m.position.y + bottom <= 0.3) {
          m.position.y = 0.3 - bottom;
          p.state = 'fallen';
          const source = Array.isArray(p.material) ? p.material[0] : p.material;
          const dark = source.clone();
          dark.onBeforeCompile = source.onBeforeCompile; // keep the fog

          if ('color' in dark) (dark.color as THREE.Color).multiplyScalar(0.62);
          m.material = dark;
        }
      }
      // Gate debris arcs out and shrinks away.
      flying.forEach((d, k) => {
        if (d.life <= 0) return;
        d.life = reducedMotion ? 0 : d.life - dt;
        d.velocity.y -= 14 * dt;
        d.at.addScaledVector(d.velocity, dt);
        if (d.at.y < 0.4) [d.at.y, d.velocity.y] = [0.4, -d.velocity.y * 0.3];
        const size = Math.max(0, Math.min(1, d.life / 0.4));
        matrix.makeRotationY(k + clock * 3).setPosition(d.at);
        matrix.scale(new THREE.Vector3(size, size, size));
        debris.setMatrixAt(k, matrix);
      });
      debris.instanceMatrix.needsUpdate = true;
      // Smoke from the front towers below half HP, thicker as it falls.
      const burning = Math.max(0, 0.5 - hpRatio) * 2;
      for (const puff of smoke) {
        const { x, z, phase } = puff.userData as { x: number; z: number; phase: number };
        const t = reducedMotion ? 0.5 : (clock * 0.35 + phase) % 1;
        puff.position.set(x + Math.sin(t * 6 + phase * 9) * 0.3, 3.4 + t * 3.5, z);
        puff.scale.setScalar(1 + t * 2.5);
        (puff.material as THREE.SpriteMaterial).opacity = burning * 0.85 * Math.sin(t * Math.PI);
      }
      if (!reducedMotion) {
        // Dust rises slowly and sways, wrapping back to the floor.
        for (let k = 0; k < MOTES; k++) {
          const y = motePositions[k * 3 + 1] + dt * (0.08 + hash(k, 4, 31) * 0.1);
          motePositions[k * 3 + 1] = y > 4.3 ? 0.3 - DROP : y;
          motePositions[k * 3] += Math.sin(clock * 0.6 + k) * dt * 0.08;
        }
        moteGeometry.getAttribute('position').needsUpdate = true;
      }
    },
    /** For tests: rock columns, floor tiles, the lanes' clear floor and both structures. */
    debug: { columns, tiles, lanes, mouth, vault, parts },
  };
}
export type Environment = ReturnType<typeof createEnvironment>;
