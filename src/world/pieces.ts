import * as THREE from 'three';
import {
  createCreep,
  createGemTower,
  createStone,
  GEM_TYPES,
} from '../../docs/art/model-study/models.js';
import type { Cell } from '../sim/board';
import { qualityOf, type Game } from '../sim/game';
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
      const obj = name
        ? createGemTower(name[6].toUpperCase(), {
            ...options,
            quality: qualityOf(name),
          } as typeof options)
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
        const scale = Number(game.unit(c.name)?.ModelScale ?? 1);
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
      syncCells();
      // Capture endpoints before removing dead creeps, so lethal shots still arrive and burst.
      const killed = new Set(game.events.filter((e) => e.type === 'kill').map((e) => e.id));
      for (const e of game.events)
        if (e.type === 'attack') {
          const gem = game.gems.find((g) => g.id === e.from);
          const live = game.creeps.find((c) => c.id === e.to);
          const previous = creeps.get(e.to);
          // shortcut: a creep killed on its spawn tick bursts at the entrance; use event positions if exact impacts become necessary.
          const cell = live ?? previous?.cur ?? (killed.has(e.to) ? game.flyRoute[0] : undefined);
          if (!gem || !cell) continue;
          const start = toScene(gem.cell);
          const end = toScene(cell);
          const color = GEM_TYPES.find((t) => t.id === gem.name[6].toUpperCase())!.color;
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
    frame(alpha: number, dt: number) {
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
        if (f.age < TRAVEL_SECONDS) {
          pose.position.lerpVectors(f.start, f.end, f.age / TRAVEL_SECONDS);
          pose.rotation.set(0, f.age * 12, 0);
          pose.scale.setScalar(1);
          pose.updateMatrix();
          projectiles.setMatrixAt(shots, pose.matrix);
          projectiles.setColorAt(shots++, f.color);
        } else {
          const t = (f.age - TRAVEL_SECONDS) / IMPACT_SECONDS;
          pose.position.copy(f.end);
          pose.rotation.set(-Math.PI / 2, 0, 0);
          pose.scale.setScalar((0.15 + t * (f.lethal ? 0.8 : 0.4)) * (1 - t));
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
