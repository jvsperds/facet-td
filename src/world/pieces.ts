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
import { createAimer } from './aim';
import { creepPartScale } from './clearance';
import { createEffects } from './effects';
import { createPedalEffects } from './pedals';
import { TURRET_TOP, neighbourhood, wallMesh, wallRaster, type Occupancy } from './walls';

// Everything on the board that the sim owns: stones, gem towers, creeps and combat effects.
// Rebuilt from sim state after each tick; creeps interpolate between the last two ticks.

// The art study's tower plinth has radius 0.31; the board grows towers to fill their cell. Every
// stone and tower cell is a block of the board wall (walls.ts) and towers stand on top of it.
const PLINTH = 0.5 / 0.31;
const PLINTH_HEIGHT = 0.12;
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
const WALL_MATERIAL = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 1,
  flatShading: true,
});
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
  base.userData.extraTower = true;
  return base;
}

/**
 * The art-study model for a gem, combined, special or named tower, standing on its stone footing
 * at the origin. The tower itself is the last child; the HUD renders it for its icons.
 */
export function towerModel(name: string) {
  const options = { x: 0, z: 0, neighbours: {}, seed: 1 };
  const basic = isBasicGem(name);
  return basic || TOWER_SPECS.some((t) => t.id === name)
    ? createGemTower(basic ? name[6].toUpperCase() : name, {
        ...options,
        ...(basic ? { quality: qualityOf(name) } : {}),
      } as typeof options)
    : extraTower(name, options);
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

/** Stretch a tower's stone base to fill its cell and keep the tower itself evenly scaled. */
/**
 * Build a tower into its cell's turret: drop the art-study footing (the board wall replaces it),
 * scale the tower evenly, and sink its octagonal plinth into the turret so only the shaft rises
 * from the brickwork.
 */
function seatTower(obj: THREE.Object3D) {
  // Children: footing core, one group per joining arm, then the tower itself.
  obj.children.slice(0, -1).forEach(dispose);
  const t = obj.children.at(-1)!;
  // Quality still sets the size, compressed so even a chipped tower fills most of its cell.
  const scale = PLINTH * (0.7 + 0.3 * t.scale.y);
  t.scale.setScalar(scale);
  t.position.y = 0;
  obj.updateMatrixWorld(true);
  const bottom = new THREE.Box3().setFromObject(t).min.y - obj.position.y;
  // The art-study plinth is 0.12 tall at the bottom of the tower; named stones have none.
  const plinth = obj.userData.extraTower ? 0 : PLINTH_HEIGHT * scale;
  t.position.y = TURRET_TOP - bottom - plinth;
}

/** A pedal lies on the floor: its flat slab stretched to fill the cell. */
function layTablet(obj: THREE.Object3D) {
  const stretch = 0.5 / 0.22; // the art-study footing core is 0.44 wide
  obj.scale.setScalar(stretch);
  obj.children.at(-1)!.scale.setScalar(PLINTH / stretch); // the slab's head grows evenly
}

/**
 * Board pieces. `tunnel`, a point inside the cave mouth, is where the creeps still to spawn walk
 * from (presentation only): each leaves it in time to reach S just as the sim spawns it there.
 */
export function createPieces(scene: THREE.Scene, game: Game, tunnel?: { x: number; z: number }) {
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
  /** Tower models by cell key. */
  const cells = new Map<number, Piece>();
  /** Wall blocks by cell key, for every stone and tower cell. */
  const walls = new Map<number, Piece>();
  const creeps = new Map<number, CreepView>();
  const effects = createEffects(scene);
  const pedals = createPedalEffects(scene);
  let version = 0;

  // Walls are rebuilt from one shared footprint whenever any cell's occupant changes.
  let occupancy: Occupancy = new Map();
  let raster = wallRaster(occupancy);
  let lastOccupancy = '';

  function syncCells() {
    const occupied = new Map<number, { cell: Cell; name: string | null }>();
    for (const c of game.stones.values()) occupied.set(key(c), { cell: c, name: null });
    for (const g of game.gems) occupied.set(key(g.cell), { cell: g.cell, name: g.name });
    // Pedals (tablets) are floor tiles creeps walk over: no wall under or around them.
    const floor = new Set(
      [...occupied].filter(([, o]) => o.name?.includes('shiban')).map(([k]) => k),
    );
    const signature = [...occupied].map(([k, o]) => `${k}${o.name ? 't' : 's'}`).join();
    if (signature !== lastOccupancy) {
      lastOccupancy = signature;
      occupancy = new Map(
        [...occupied]
          .filter(([k]) => !floor.has(k))
          .map(([k, o]) => [k, o.name ? 'tower' : 'stone']),
      );
      raster = wallRaster(occupancy);
    }
    for (const map of [cells, walls])
      for (const [k, p] of map)
        if (
          !occupied.has(k) ||
          (map === cells && !occupied.get(k)!.name) ||
          (map === walls && floor.has(k))
        ) {
          dispose(p.obj);
          map.delete(k);
          version++;
        }
    for (const [k, { cell, name }] of occupied) {
      const { x: sx, z: sz } = toScene(cell);
      // Wall block: rebuilt when anything in its 5×5 neighbourhood changes.
      const wallSig = neighbourhood(occupancy, cell);
      if (!floor.has(k) && walls.get(k)?.sig !== wallSig) {
        if (walls.has(k)) dispose(walls.get(k)!.obj);
        const obj = new THREE.Group().add(
          ...[wallMesh(raster, cell, WALL_MATERIAL)].filter((m) => !!m),
        );
        obj.position.set(sx, 0, sz);
        obj.userData.cell = cell;
        scene.add(obj);
        walls.set(k, { sig: wallSig, obj });
        version++;
      }
      // Tower: rebuilt only when the gem changes; the wall handles every join.
      if (!name || cells.get(k)?.sig === name) continue;
      if (cells.has(k)) dispose(cells.get(k)!.obj);
      const obj = towerModel(name);
      obj.position.set(sx, 0, sz);
      if (floor.has(k)) layTablet(obj);
      else seatTower(obj);
      obj.userData.cell = cell;
      scene.add(obj);
      cells.set(k, { sig: name, obj });
      version++;
    }
  }

  /** Creeps of a model: the factory's body grown to its board size. */
  function creepModel(name: string, flying: boolean, boss: boolean, elite = false) {
    const scale = Number(game.unit(name)?.ModelScale ?? 1) * (elite ? 2 : 1);
    const obj = createCreep({ modelScale: scale, flying, boss });
    // Grow body and shadow in place; the body's flying altitude stays as the factory set it.
    const partScale = creepPartScale(scale, flying);
    for (const part of obj.children) part.scale.setScalar(partScale);
    return obj;
  }

  // The approach: creeps still to spawn, walking from the tunnel to S. Their models are reused
  // front to back, so as the leader becomes the sim's creep at S the rest simply walk on.
  const approach: THREE.Object3D[] = [];
  let approachName = '';
  function syncApproach(alpha: number) {
    const next = tunnel && game.spawning;
    if (next && next.name !== approachName) {
      approach.splice(0).forEach(dispose);
      approachName = next.name;
    }
    let shown = 0;
    if (next && tunnel) {
      const s = toScene(game.flyRoute[0]);
      const [gx, gz] = [s.x - tunnel.x, s.z - tunnel.z];
      const length = Math.hypot(gx, gz);
      for (let k = 0; k < next.count; k++) {
        // Ticks until this creep spawns; it walks the lane at the speed it will spawn with.
        const ticks = next.next - alpha + k * next.every;
        const walk = Math.max(0, ticks) * next.speed;
        if (walk > length) break;
        let obj = approach[k];
        if (!obj) {
          obj = creepModel(next.name, next.name.includes('fly'), next.name.includes('boss'));
          scene.add(obj);
          approach.push(obj);
        }
        obj.visible = true;
        obj.position.set(s.x - (gx / length) * walk, 0, s.z - (gz / length) * walk);
        obj.rotation.y = Math.atan2(-gz, gx);
        shown++;
      }
    }
    for (let k = shown; k < approach.length; k++) approach[k].visible = false;
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
        const obj = creepModel(c.name, c.fly, c.boss, c.elite);
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
    objects: () => [...cells.values(), ...walls.values()].map((p) => p.obj),
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
      const tower = (g: (typeof game.gems)[number]) => {
        const { x, z } = toScene(g.cell);
        return { id: g.id, x, z, color: towerColor(g.name), abilities: game.abilities(g.name) };
      };
      effects.setTowers(game.gems.map(tower));
      // Capture endpoints before removing dead creeps, so lethal shots still arrive and burst.
      const killed = new Set(game.events.filter((e) => e.type === 'kill').map((e) => e.id));
      for (const e of game.events)
        if (e.type === 'attack') {
          const gem = game.gems.find((g) => g.id === e.from);
          const previous = creeps.get(e.to);
          if (!gem) continue;
          const start = toScene(gem.cell);
          const end = toScene(e);
          effects.hit(
            e.via,
            tower(gem),
            new THREE.Vector3(start.x, 1.2, start.z),
            new THREE.Vector3(end.x, (previous?.height ?? 0.8) - 0.25, end.z),
            killed.has(e.to),
          );
        } else if (e.type === 'tablet') {
          const gem = game.gems.find((g) => g.id === e.from);
          if (!gem) continue;
          const at = toScene(gem.cell);
          pedals.trigger(
            { x: at.x, z: at.z },
            e.operations,
            (x, y) => toScene({ x, y }),
            game.creeps,
            e.target,
          );
        }
      syncCreeps();
    },
    /** Call every frame; `alpha` is the fraction of the current tick that has elapsed. */
    frame(alpha: number, dt: number, reducedMotion = false) {
      syncApproach(alpha);
      for (const v of creeps.values()) {
        const x = v.prev.x + (v.cur.x - v.prev.x) * alpha;
        const y = v.prev.y + (v.cur.y - v.prev.y) * alpha;
        // Creeps follow the sim's path through cell centres exactly.
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
        if (!obj) continue;
        // Heads ease toward the target and turn smoothly onto the next one (issue #14).
        const aimer = (obj.userData.aimer ??= createAimer(obj)) as ReturnType<typeof createAimer>;
        aimer.update(t?.obj.position.x, t?.obj.position.z, dt, reducedMotion);
      }
      effects.frame(dt, reducedMotion);
      pedals.frame(dt, reducedMotion);
    },
  };
}
