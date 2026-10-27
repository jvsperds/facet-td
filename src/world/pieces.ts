import * as THREE from 'three';
import {
  createCreep,
  createGemTower,
  createStone,
  FLY_ALTITUDE,
} from '../../docs/art/model-study/models.js';
import type { Cell } from '../sim/board';
import { qualityOf, type Game } from '../sim/game';
import { toScene } from './view';

// Everything on the board that the sim owns: stones, gem towers, creeps and attack flashes.
// Rebuilt from sim state after each tick; creeps interpolate between the last two ticks.

const FLASH_SECONDS = 0.12;
const MAX_FLASHES = 128;
const BAR = { width: 0.5, height: 0.07, back: '#25282C', fill: '#7ED07A', low: '#FFB3AF' };

type Piece = { sig: string; obj: THREE.Object3D };
type CreepView = {
  obj: THREE.Object3D;
  bar: THREE.Sprite;
  prev: { x: number; y: number };
  cur: { x: number; y: number };
  height: number;
  fly: boolean;
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

export function createPieces(scene: THREE.Scene, game: Game) {
  const cells = new Map<number, Piece>();
  const creeps = new Map<number, CreepView>();
  const flashes: { from: number; to: number; age: number }[] = [];
  // One preallocated buffer; a new attribute per frame would leak a GPU buffer each frame.
  const flashPositions = new THREE.BufferAttribute(new Float32Array(MAX_FLASHES * 6), 3);
  flashPositions.setUsage(THREE.DynamicDrawUsage);
  const flashGeometry = new THREE.BufferGeometry().setAttribute('position', flashPositions);
  flashGeometry.setDrawRange(0, 0);
  const flashLines = new THREE.LineSegments(
    flashGeometry,
    new THREE.LineBasicMaterial({ color: '#FFF6C8', depthTest: false }),
  );
  flashLines.renderOrder = 9;
  scene.add(flashLines);
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
          height: obj.userData.healthBarY ?? 0.5,
          fly: c.fly,
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
      syncCreeps();
      for (const e of game.events)
        if (e.type === 'attack') flashes.push({ from: e.from, to: e.to, age: 0 });
    },
    /** Call every frame; `alpha` is the fraction of the current tick that has elapsed. */
    frame(alpha: number, dt: number) {
      for (const v of creeps.values()) {
        const x = v.prev.x + (v.cur.x - v.prev.x) * alpha;
        const y = v.prev.y + (v.cur.y - v.prev.y) * alpha;
        const s = toScene({ x, y });
        const lift = v.fly ? FLY_ALTITUDE : 0;
        v.obj.position.set(s.x, lift, s.z);
        const [dx, dy] = [v.cur.x - v.prev.x, v.cur.y - v.prev.y];
        if (dx || dy) v.obj.rotation.y = Math.atan2(dy, dx);
        (v.bar.userData.holder as THREE.Object3D).position.set(s.x, lift + v.height + 0.12, s.z);
      }
      // Towers face their current target; flashes connect tower heads to creeps briefly.
      for (const g of game.gems) {
        const obj = cells.get(key(g.cell))?.obj;
        const t = g.target !== null ? creeps.get(g.target) : undefined;
        if (t) obj?.userData.aimAt(t.obj.position.x, t.obj.position.z);
        else obj?.userData.aimAt();
      }
      let n = 0;
      for (let i = flashes.length - 1; i >= 0; i--) {
        const f = flashes[i];
        f.age += dt;
        const gem = game.gems.find((g) => g.id === f.from);
        const target = creeps.get(f.to);
        if (f.age > FLASH_SECONDS || !gem || !target) {
          flashes.splice(i, 1);
          continue;
        }
        if (n >= MAX_FLASHES) continue;
        const s = toScene(gem.cell);
        const p = target.obj.position;
        flashPositions.array.set([s.x, 1, s.z, p.x, p.y + target.height * 0.6, p.z], n * 6);
        n++;
      }
      if (n || flashGeometry.drawRange.count) {
        flashGeometry.setDrawRange(0, n * 2);
        flashPositions.needsUpdate = true;
      }
    },
  };
}
