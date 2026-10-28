import * as THREE from 'three';
import {
  createCreep,
  createGemTower,
  createStone,
  GEM_TYPES,
  SPECIAL_TOWERS,
} from '../../docs/art/model-study/models.js';
import { COMBINED_TOWERS } from '../../docs/art/model-study/combined-towers.js';
import type { Cell } from '../sim/board';
import { isBasicGem, qualityOf, type Game } from '../sim/game';
import { toScene } from './view';

// Everything on the board that the sim owns: stones, gem towers, creeps and combat effects.
// Rebuilt from sim state after each tick; creeps interpolate between the last two ticks.

const TRAVEL_SECONDS = 0.12;
const IMPACT_SECONDS = 0.24;
const MAX_EFFECTS = 128;
// The art study draws thin walls (core half 0.22, wall half-width 0.16, plinth radius 0.31); the board
// stretches them to fill their cell, and filled neighbours touch, so the joining arms are dropped.
const ALONG = 0.5 / 0.22;
const ACROSS = 0.5 / 0.16;
const PLINTH = 0.5 / 0.31;
const CREEP_SCALE = 2;
const BAR = { width: 0.5, height: 0.07, back: '#25282C', fill: '#7ED07A', low: '#FFB3AF' };

type Piece = { sig: string; obj: THREE.Object3D };
type CreepView = {
  obj: THREE.Object3D;
  bar: THREE.Sprite;
  prev: { x: number; y: number };
  cur: { x: number; y: number };
  height: number;
};

const key = (c: Cell) => c.y * 64 + c.x;
const barMaterial = (color: string) => new THREE.SpriteMaterial({ color, depthTest: false });
const BAR_BACK = barMaterial(BAR.back);
const BAR_FILL = barMaterial(BAR.fill);
const BAR_LOW = barMaterial(BAR.low);
const TOWER_SPECS = [...SPECIAL_TOWERS, ...COMBINED_TOWERS];
const EXTRA_COLORS: Record<string, string> = {
  gemtd_heiyaoshi: '#292c36',
  gemtd_manao: '#dfa57b',
  gemtd_xiameishi: '#eee0ab',
  gemtd_ranshaozhishi: '#e78440',
  gemtd_geluanshi: '#75aa95',
  gemtd_zhenjiazhishi: '#e3e7f0',
};
const towerColor = (name: string) =>
  isBasicGem(name)
    ? GEM_TYPES.find((t) => t.id === name[6].toUpperCase())!.color
    : (TOWER_SPECS.find((t) => t.id === name)?.color ?? EXTRA_COLORS[name] ?? '#9f87c8');

/** Named secret stones and tablets not covered by the read-only art-study catalogue. */
function extraTower(name: string, options: Parameters<typeof createStone>[0]) {
  const base = createStone({ ...options, towerBase: true });
  const head = new THREE.Group();
  const tablet = name.includes('shiban');
  if (tablet) base.children[0].scale.y = 0.12;
  const metal = new THREE.MeshStandardMaterial({ color: towerColor(name), roughness: 0.65 });
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, tablet ? 0.08 : 0.16, 0.62),
    new THREE.MeshStandardMaterial({ color: '#60646d', roughness: 1 }),
  );
  body.position.y = tablet ? 0.08 : 0.2;
  head.add(body);
  const core = new THREE.Mesh(
    tablet ? new THREE.TorusGeometry(0.2, 0.035, 4, 8) : new THREE.OctahedronGeometry(0.26),
    metal,
  );
  core.position.y = tablet ? 0.13 : 0.5;
  if (tablet) core.rotation.x = -Math.PI / 2;
  head.add(core);
  if (name.endsWith('_yin') || name.endsWith('_jin')) {
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.29, 0.025, 4, name.endsWith('_jin') ? 12 : 8),
      new THREE.MeshStandardMaterial({ color: name.endsWith('_jin') ? '#e8c86a' : '#d5e3eb' }),
    );
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.14;
    head.add(rim);
  }
  head.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  base.add(head);
  base.userData.aimAt = () => {};
  return base;
}

function dispose(o: THREE.Object3D) {
  o.removeFromParent();
  o.traverse((m) => {
    if (!(m instanceof THREE.Mesh)) return;
    m.geometry.dispose();
    if (!m.userData.sharedMaterial)
      (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose());
  });
}

function fillCell(obj: THREE.Object3D, n: Record<string, boolean>, tower: boolean) {
  const horizontal = !tower && (n.east || n.west) && !n.north && !n.south;
  const vertical = !tower && (n.north || n.south) && !n.east && !n.west;
  obj.scale.set(vertical ? ACROSS : ALONG, ALONG, horizontal ? ACROSS : ALONG);
  // Children: core mesh, one group per joining arm, then the tower itself on gem cells.
  obj.children.slice(1, tower ? -1 : undefined).forEach(dispose);
  if (!tower) return;
  const t = obj.children.at(-1)!;
  // Quality still sets the size, compressed so even a chipped tower fills most of its cell.
  const s = PLINTH * (0.7 + 0.3 * t.scale.y);
  t.scale.setScalar(s / ALONG); // undo the base stretch: the tower grows evenly
  t.position.y = 0.08 * (1 - s / ALONG); // keep the plinth seated on the stone, as the factory does
}

export function createPieces(scene: THREE.Scene, game: Game) {
  const hero = new THREE.Group();
  const heroMaterial = new THREE.MeshStandardMaterial({ color: '#f4e3a4', roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.7, 6), heroMaterial);
  body.position.y = 0.5;
  const crown = new THREE.Mesh(new THREE.OctahedronGeometry(0.17), heroMaterial);
  crown.position.y = 1;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.035, 4, 16), heroMaterial);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  hero.add(body, crown, ring);
  // Light-pillar beacon: a translucent column the ground route bends through.
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 2.4, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: '#fff1a8',
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    }),
  );
  beacon.position.y = 1.2;
  beacon.visible = false;
  scene.add(hero, beacon);
  const cells = new Map<number, Piece>();
  const creeps = new Map<number, CreepView>();
  const effects: {
    start: THREE.Vector3;
    end: THREE.Vector3;
    color: THREE.Color;
    age: number;
    lethal: boolean;
  }[] = [];
  // Two fixed instance buffers keep dense volleys bounded without per-frame GPU allocations.
  const projectiles = new THREE.InstancedMesh(
    new THREE.OctahedronGeometry(0.14),
    new THREE.MeshBasicMaterial(),
    MAX_EFFECTS,
  );
  const impacts = new THREE.InstancedMesh(
    new THREE.RingGeometry(0.7, 1, 16),
    new THREE.MeshBasicMaterial({
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    }),
    MAX_EFFECTS,
  );
  projectiles.name = 'combat-projectiles';
  impacts.name = 'combat-impacts';
  for (const mesh of [projectiles, impacts]) {
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false; // instances move independently of the mesh origin
    scene.add(mesh);
  }
  const pose = new THREE.Object3D();
  let version = 0;

  function syncCells() {
    const occupied = new Map<number, { cell: Cell; name: string | null }>();
    for (const c of game.stones.values()) occupied.set(key(c), { cell: c, name: null });
    for (const g of game.gems) occupied.set(key(g.cell), { cell: g.cell, name: g.name });
    const has = (x: number, y: number) => occupied.has(key({ x, y }));
    for (const [k, p] of cells)
      if (!occupied.has(k)) {
        dispose(p.obj);
        cells.delete(k);
        version++;
      }
    for (const [k, { cell, name }] of occupied) {
      const { x, y } = cell;
      const neighbours = {
        north: has(x, y + 1),
        south: has(x, y - 1),
        east: has(x + 1, y),
        west: has(x - 1, y),
      };
      const sig = `${name}|${Object.values(neighbours).join()}`;
      if (cells.get(k)?.sig === sig) continue;
      if (cells.has(k)) dispose(cells.get(k)!.obj);
      const { x: sx, z: sz } = toScene(cell);
      const options = { x: sx, z: sz, neighbours, seed: 1 };
      const basic = name !== null && isBasicGem(name);
      const known = name !== null && TOWER_SPECS.some((t) => t.id === name);
      const obj = name
        ? basic || known
          ? createGemTower(basic ? name[6].toUpperCase() : name, {
              ...options,
              ...(basic ? { quality: qualityOf(name) } : {}),
            } as typeof options)
          : extraTower(name, options)
        : createStone(options);
      obj.position.set(sx, 0, sz);
      fillCell(obj, neighbours, !!name);
      obj.userData.cell = cell;
      scene.add(obj);
      cells.set(k, { sig, obj });
      version++;
    }
  }

  function syncCreeps() {
    const alive = new Set(game.creeps.map((c) => c.id));
    for (const [id, v] of creeps)
      if (!alive.has(id)) {
        dispose(v.obj);
        (v.bar.userData.holder as THREE.Object3D).removeFromParent();
        creeps.delete(id);
      }
    for (const c of game.creeps) {
      let v = creeps.get(c.id);
      if (!v) {
        const scale = Number(game.unit(c.name)?.ModelScale ?? 1) * (c.elite ? 2 : 1);
        const obj = createCreep({ modelScale: scale, flying: c.fly, boss: c.boss });
        // Grow body and shadow in place; the body's flying altitude stays as the factory set it.
        for (const part of obj.children) part.scale.setScalar(CREEP_SCALE);
        const bar = new THREE.Sprite(BAR_FILL);
        const back = new THREE.Sprite(BAR_BACK);
        back.scale.set(BAR.width, BAR.height, 1);
        back.renderOrder = 12;
        bar.renderOrder = 13;
        const holder = new THREE.Group().add(back, bar);
        scene.add(obj, holder);
        bar.userData.holder = holder;
        v = {
          obj,
          bar,
          prev: { x: c.x, y: c.y },
          cur: { x: c.x, y: c.y },
          height: new THREE.Box3().setFromObject(obj).max.y + 0.15,
        };
        creeps.set(c.id, v);
      }
      v.prev = v.cur;
      v.cur = { x: c.x, y: c.y };
      const ratio = Math.max(0, c.hp / c.maxHp);
      v.bar.visible = ratio > 0;
      v.bar.scale.set(BAR.width * ratio, BAR.height, 1);
      v.bar.center.set(0.5 / Math.max(ratio, 1e-3), 0.5); // left-align with the backing bar in screen space
      v.bar.material = ratio < 0.3 ? BAR_LOW : BAR_FILL;
    }
  }

  return {
    get version() {
      return version;
    },
    /** Stones and towers, for occluder fading. */
    objects: () => [...cells.values()].map((p) => p.obj),
    /** Call after every sim tick. */
    afterStep() {
      hero.visible = !!game.hero.selected;
      const position = toScene(game.heroPosition);
      hero.position.set(position.x, 0, position.z);
      beacon.visible = !!game.beacon;
      if (game.beacon) {
        const b = toScene(game.beacon);
        beacon.position.set(b.x, 1.2, b.z);
      }
      syncCells();
      // Capture endpoints before removing dead creeps, so lethal shots still arrive and burst.
      const killed = new Set(game.events.filter((e) => e.type === 'kill').map((e) => e.id));
      for (const e of game.events)
        if (e.type === 'attack') {
          const gem = game.gems.find((g) => g.id === e.from);
          const previous = creeps.get(e.to);
          if (!gem) continue;
          const start = toScene(gem.cell);
          const end = toScene(e);
          const color = towerColor(gem.name);
          if (effects.length === MAX_EFFECTS) effects.shift();
          effects.push({
            start: new THREE.Vector3(start.x, 1.2, start.z),
            end: new THREE.Vector3(end.x, (previous?.height ?? 0.8) - 0.25, end.z),
            color: new THREE.Color(color),
            age: 0,
            lethal: killed.has(e.to),
          });
        }
      syncCreeps();
    },
    /** Call every frame; `alpha` is the fraction of the current tick that has elapsed. */
    frame(alpha: number, dt: number, reducedMotion = false) {
      for (const v of creeps.values()) {
        const x = v.prev.x + (v.cur.x - v.prev.x) * alpha;
        const y = v.prev.y + (v.cur.y - v.prev.y) * alpha;
        const s = toScene({ x, y });
        // The creep factory already lifts flying bodies; the group stays on the ground with the shadow.
        v.obj.position.set(s.x, 0, s.z);
        const [dx, dy] = [v.cur.x - v.prev.x, v.cur.y - v.prev.y];
        if (dx || dy) v.obj.rotation.y = Math.atan2(dy, dx);
        (v.bar.userData.holder as THREE.Object3D).position.set(s.x, v.height, s.z);
      }
      // Towers face their current target; visual travel never delays sim damage.
      for (const g of game.gems) {
        const obj = cells.get(key(g.cell))?.obj;
        const t = g.target !== null ? creeps.get(g.target) : undefined;
        if (t) obj?.userData.aimAt(t.obj.position.x, t.obj.position.z);
        else obj?.userData.aimAt();
      }
      let shots = 0;
      let rings = 0;
      for (let i = effects.length - 1; i >= 0; i--) {
        const f = effects[i];
        f.age += dt;
        if (f.age >= TRAVEL_SECONDS + IMPACT_SECONDS) {
          effects.splice(i, 1);
          continue;
        }
        if (f.age < TRAVEL_SECONDS && !reducedMotion) {
          pose.position.lerpVectors(f.start, f.end, f.age / TRAVEL_SECONDS);
          pose.rotation.set(0, f.age * 12, 0);
          pose.scale.setScalar(1);
          pose.updateMatrix();
          projectiles.setMatrixAt(shots, pose.matrix);
          projectiles.setColorAt(shots++, f.color);
        } else {
          const t = Math.max(0, (f.age - TRAVEL_SECONDS) / IMPACT_SECONDS);
          pose.position.copy(f.end);
          pose.rotation.set(-Math.PI / 2, 0, 0);
          pose.scale.setScalar(
            reducedMotion ? 0.22 : (0.2 + t * (f.lethal ? 1.2 : 0.65)) * (1 - t),
          );
          pose.updateMatrix();
          impacts.setMatrixAt(rings, pose.matrix);
          impacts.setColorAt(rings++, f.color);
        }
      }
      projectiles.count = shots;
      impacts.count = rings;
      for (const mesh of [projectiles, impacts]) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    },
  };
}
