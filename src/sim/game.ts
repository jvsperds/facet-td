import type { GameData } from '../data';
import { Board, CELL_UNITS, type Cell } from './board';
import { findPath } from './path';
import type { Rng } from './rng';

// Gem TD's single-player loop, ported from addon_game_mode.lua (line numbers cite the VPK script):
// build five random gems, keep one (the rest become stones), then a wave walks the maze to the castle.
// Not yet ported (phase 5): tower and creep abilities, recipes/combines, downgrades, hero skills and
// prayers, elites, enrage, levels past 50.

export const TICK_HZ = 30;
export const DRAFT_SIZE = 5;
export const LAST_LEVEL = 50;
/** Total hero XP to reach levels 1..5 (SetCustomXPRequiredToReachNextLevel, line 774). */
const XP_FOR_LEVEL = [0, 250, 650, 1200, 1900];
/** One spawn per OnThink, which runs once a second (line 3279, returns 1). */
const SPAWN_TICKS = TICK_HZ;
/** Arrival radius around path7, checked once per OnThink (line 3762). */
const CASTLE_RADIUS = 400 / CELL_UNITS;
/** Extra castle damage range per ten levels (line 3504): damage = 1 + RandomInt(0, n). */
const CASTLE_DAMAGE_SPREAD = [2, 6, 10, 14, 18, 26, 34, 42, 50, 58];

export type Phase = 'build' | 'wave' | 'lost' | 'won';
export interface Gem {
  id: number;
  name: string;
  cell: Cell;
  /** Ticks until the next attack, and the creep it is attacking. */
  cooldown: number;
  target: number | null;
}
export interface Creep {
  id: number;
  name: string;
  hp: number;
  maxHp: number;
  armor: number;
  /** Cells per tick. */
  speed: number;
  x: number;
  y: number;
  /** Index of the next point on its route. */
  step: number;
  fly: boolean;
  boss: boolean;
  /** Castle HP lost if it arrives. */
  damage: number;
}
export type GameEvent =
  | { type: 'attack'; from: number; to: number; damage: number }
  | { type: 'kill'; id: number; gold: number }
  | { type: 'leak'; id: number; damage: number };
export type Refusal = { ok: false; reason: string };
export type Check = { ok: true } | Refusal;

type Unit = Record<string, string>;
const num = (u: Unit, k: string) => Number(u[k] ?? 0);
/** Gem quality is the number of trailing 1s in its unit name (gemtd_b1 .. gemtd_b111111). */
export const qualityOf = (name: string) => name.length - name.replace(/1+$/, '').length;
export const isBasicGem = (name: string) => /^gemtd_[bdqegyrp]1{1,6}$/.test(name);

export class Game {
  phase: Phase = 'build';
  level = 1;
  castleHp: number;
  gold = 0;
  xp = 0;
  /** Gems kept in earlier rounds plus this round's draft. */
  gems: Gem[] = [];
  stones = new Map<number, Cell>();
  /** Ids of this round's placed gems, in placement order. */
  draft: number[] = [];
  creeps: Creep[] = [];
  route: Cell[] = [];
  flyRoute: Cell[] = [];
  /** Events of the last tick, for the view; not part of the game state. */
  events: GameEvent[] = [];
  private toSpawn = 0;
  private spawnName = '';
  private nextSpawn = 0;
  private nextId = 1;
  private readonly units: Record<string, Unit>;
  private readonly lua: Record<string, { value: unknown }>;

  constructor(
    data: GameData,
    readonly board: Board,
    private readonly rng: Rng,
  ) {
    this.units = (data.files['npc/units.json'] as { DOTAUnits: Record<string, Unit> }).DOTAUnits;
    this.lua = data.files['lua/addon_game_mode.json'] as Record<string, { value: unknown }>;
    this.castleHp = this.luaValue<number>('gem_castle_hp');
    for (const s of board.stones) this.stones.set(key(s), s);
    this.flyRoute = board.waypoints.map((w) => w.cell);
    this.route = this.findRoute() ?? [];
  }

  private luaValue<T>(name: string) {
    return this.lua[name].value as T;
  }
  unit(name: string): Unit {
    return this.units[name];
  }

  get heroLevel() {
    return XP_FOR_LEVEL.filter((xp) => this.xp >= xp).length;
  }
  gemAt(c: Cell) {
    return this.gems.find((g) => g.cell.x === c.x && g.cell.y === c.y);
  }
  stoneAt(c: Cell) {
    return this.stones.has(key(c));
  }
  private blocked = (x: number, y: number) =>
    this.stones.has(key({ x, y })) || !!this.gemAt({ x, y });

  /** Ground route through every waypoint (find_all_path, line 6873), or null when any leg is cut. */
  private findRoute(extra?: Cell): Cell[] | null {
    const blocked = extra
      ? (x: number, y: number) => (x === extra.x && y === extra.y) || this.blocked(x, y)
      : this.blocked;
    const route: Cell[] = [];
    const w = this.flyRoute;
    for (let i = 0; i + 1 < w.length; i++) {
      const leg = findPath(w[i], w[i + 1], blocked);
      if (!leg) return null;
      route.push(...(i ? leg.slice(1) : leg));
    }
    return route;
  }

  // ---- Build phase (gemtd_build_stone, line 4884) ----

  canBuild(c: Cell): Check {
    const no = (reason: string): Refusal => ({ ok: false, reason });
    if (this.phase !== 'build') return no('You can only build between waves.');
    if (this.draft.length >= DRAFT_SIZE)
      return no('All five gems are placed. Keep one to start the wave.');
    const kind = this.board.kind(c);
    if (kind === 'outside' || kind === 'waypoint' || kind === 'no-build')
      return no('Unable to build here');
    if (this.gemAt(c)) return no('Unable to build here');
    if (!this.findRoute(c)) return no('Blocked if build here');
    return { ok: true };
  }

  build(c: Cell): Check {
    const check = this.canBuild(c);
    if (!check.ok) return check;
    this.stones.delete(key(c)); // building on a stone replaces it (line 4960)
    // Quality from the hero level's odds table (gem_gailv), then a uniform type (gem_tower_basic).
    const roll = this.rng.int(1, 100);
    let quality = '1';
    let best = 0;
    for (const [per, lv] of Object.entries(
      this.luaValue<Record<string, Record<string, string>>>('gem_gailv')[this.heroLevel] ?? {},
    ))
      if (roll > Number(per) && best <= Number(per)) [best, quality] = [Number(per), lv];
    const types = Object.values(this.luaValue<Record<string, string>>('gem_tower_basic'));
    const name = types[this.rng.int(1, types.length) - 1] + quality;
    const gem: Gem = { id: this.nextId++, name, cell: { ...c }, cooldown: 0, target: null };
    this.gems.push(gem);
    this.draft.push(gem.id);
    this.route = this.findRoute() ?? this.route;
    return { ok: true };
  }

  canRemove(c: Cell): Check {
    if (this.phase !== 'build' || this.draft.length >= DRAFT_SIZE)
      return { ok: false, reason: 'Stones can only be removed while placing gems.' };
    if (!this.stoneAt(c)) return { ok: false, reason: 'Only stones can be removed.' };
    return { ok: true };
  }

  /** gemtd_remove (line 5570): clears a stone during the build phase. */
  remove(c: Cell): Check {
    const check = this.canRemove(c);
    if (!check.ok) return check;
    this.stones.delete(key(c));
    this.route = this.findRoute() ?? this.route;
    return { ok: true };
  }

  /**
   * Name the kept gem becomes with `upgrade` extra quality steps, or a refusal. Two identical draft
   * gems allow +1 and four allow +2 (line 5190).
   */
  keepResult(id: number, upgrade: 0 | 1 | 2): { ok: true; name: string } | Refusal {
    const gem = this.gems.find((g) => g.id === id);
    if (this.phase !== 'build' || !gem || !this.draft.includes(id))
      return { ok: false, reason: 'Only a gem placed this round can be kept.' };
    if (this.draft.length < DRAFT_SIZE) return { ok: false, reason: 'Place all five gems first.' };
    if (upgrade === 0) return { ok: true, name: gem.name };
    const same = this.draft.filter(
      (d) => this.gems.find((g) => g.id === d)!.name === gem.name,
    ).length;
    if (same < (upgrade === 1 ? 2 : 4))
      return {
        ok: false,
        reason: `Needs ${upgrade === 1 ? 'two' : 'four'} identical gems this round.`,
      };
    const name = gem.name + '1'.repeat(upgrade);
    // Two steps from perfect makes a special tower (gemtd_zhenjiazhishi, line 5816).
    if (!this.units[name] || qualityOf(name) > 6)
      return {
        ok: false,
        reason: 'This upgrade makes a special tower, which comes in a later phase.',
      };
    return { ok: true, name };
  }

  /** choose_stone (line 5601): keep one draft gem, turn the others into stones, start the wave. */
  keep(id: number, upgrade: 0 | 1 | 2): Check {
    const result = this.keepResult(id, upgrade);
    if (!result.ok) return result;
    for (const d of this.draft) {
      if (d === id) continue;
      const g = this.gems.find((g) => g.id === d)!;
      this.stones.set(key(g.cell), g.cell);
    }
    this.gems = this.gems.filter((g) => g.id === id || !this.draft.includes(g.id));
    this.gems.find((g) => g.id === id)!.name = result.name;
    this.draft = [];
    this.route = this.findRoute() ?? this.route;
    this.startWave();
    return { ok: true };
  }

  // ---- Wave (start_shuaguai, line 6261; spawning in OnThink, line 3346) ----

  private startWave() {
    this.phase = 'wave';
    const guai = this.luaValue<Record<string, string>>('guai');
    let name = guai[this.level];
    if (guai[this.level + 100] && this.rng.int(1, 2) === 1) name = guai[this.level + 100];
    this.spawnName = name;
    this.toSpawn = name.includes('boss') ? 1 : this.luaValue<number>('wave_enemy_count');
    this.nextSpawn = 0;
  }

  private spawn() {
    let name = this.spawnName;
    if ([35, 36, 38].includes(this.level) && this.rng.int(1, 100) > 50) name += '1';
    const u = this.units[name] ?? this.units[this.spawnName];
    const difficulty = this.luaValue<Record<string, number>>('gem_difficulty')[1];
    const speedFactor = this.luaValue<Record<string, number>>('gem_difficulty_speed')[1];
    const hp = Math.max(1, Math.floor(num(u, 'StatusHealth') * difficulty));
    const damage =
      this.level % 10 === 0
        ? 100
        : 1 + this.rng.int(0, CASTLE_DAMAGE_SPREAD[Math.floor(this.level / 10)]);
    const start = this.flyRoute[0];
    this.creeps.push({
      id: this.nextId++,
      name,
      hp,
      maxHp: hp,
      armor: num(u, 'ArmorPhysical'),
      speed: (num(u, 'MovementSpeed') * speedFactor) / CELL_UNITS / TICK_HZ,
      x: start.x,
      y: start.y,
      step: 1,
      fly: name.includes('fly'),
      boss: name.includes('boss'),
      damage,
    });
    this.toSpawn--;
  }

  private move(c: Creep) {
    const route = c.fly ? this.flyRoute : this.route;
    let left = c.speed;
    while (left > 0 && c.step < route.length) {
      const t = route[c.step];
      const dx = t.x - c.x;
      const dy = t.y - c.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= left) {
        c.x = t.x;
        c.y = t.y;
        c.step++;
        left -= d;
      } else {
        c.x += (dx / d) * left;
        c.y += (dy / d) * left;
        left = 0;
      }
    }
  }

  private attack(g: Gem) {
    if (g.cooldown > 0) g.cooldown--;
    const u = this.units[g.name];
    const range = num(u, 'AttackRange') / CELL_UNITS;
    const dist2 = (c: Creep) => sq(c.x - g.cell.x) + sq(c.y - g.cell.y);
    let target = this.creeps.find((c) => c.id === g.target && dist2(c) <= range * range);
    if (!target) {
      let best = Infinity;
      for (const c of this.creeps) {
        const d = dist2(c);
        if (d <= range * range && d < best) [best, target] = [d, c];
      }
    }
    g.target = target?.id ?? null;
    if (!target || g.cooldown > 0) return;
    // Pre-7.20 Dota armour: damage x (1 - 0.06a / (1 + 0.06|a|)).
    const a = target.armor;
    const raw = this.rng.int(num(u, 'AttackDamageMin'), num(u, 'AttackDamageMax'));
    const damage = raw * (1 - (0.06 * a) / (1 + 0.06 * Math.abs(a)));
    target.hp -= damage;
    g.cooldown = Math.max(1, Math.round(num(u, 'AttackRate') * TICK_HZ));
    this.events.push({ type: 'attack', from: g.id, to: target.id, damage });
    if (target.hp <= 0) this.kill(target);
  }

  /** OnEntityKilled (line 6480): XP and gold by level band. */
  private kill(c: Creep) {
    const l = this.level;
    let reward =
      l % 10 === 0 && l <= 50 ? 300 : l > 10 && l < 50 ? 5 * (Math.floor(l / 10) + 1) : 5;
    this.xp += reward;
    if (reward >= 100) reward /= 2;
    this.gold += Math.floor(reward);
    this.creeps = this.creeps.filter((x) => x !== c);
    this.events.push({ type: 'kill', id: c.id, gold: Math.floor(reward) });
  }

  step(tick: number) {
    this.events = [];
    if (this.phase !== 'wave') return;
    if (this.toSpawn > 0 && tick >= this.nextSpawn) {
      this.spawn();
      this.nextSpawn = tick + SPAWN_TICKS;
    }
    for (const c of this.creeps) this.move(c);
    for (const g of this.gems) this.attack(g);
    if (tick % SPAWN_TICKS === 0) {
      const castle = this.flyRoute[this.flyRoute.length - 1];
      for (const c of [...this.creeps]) {
        if (sq(c.x - castle.x) + sq(c.y - castle.y) > sq(CASTLE_RADIUS)) continue;
        this.castleHp -= c.damage;
        this.creeps = this.creeps.filter((x) => x !== c);
        this.events.push({ type: 'leak', id: c.id, damage: c.damage });
      }
    }
    if (this.castleHp <= 0) {
      this.castleHp = 0;
      this.phase = 'lost';
    } else if (this.toSpawn <= 0 && this.creeps.length === 0) {
      // EndRoundIfNoEnemyAlive (line 13441)
      for (const g of this.gems) [g.cooldown, g.target] = [0, null];
      if (this.level >= LAST_LEVEL) this.phase = 'won';
      else {
        this.level++;
        this.phase = 'build';
      }
    }
  }

  /** Everything that defines the game, for the determinism hash. */
  snapshot() {
    const { phase, level, castleHp, gold, xp, gems, draft, creeps, toSpawn, nextSpawn, nextId } =
      this;
    return {
      phase,
      level,
      castleHp,
      gold,
      xp,
      gems,
      stones: [...this.stones.keys()].sort((a, b) => a - b),
      draft,
      creeps,
      toSpawn,
      nextSpawn,
      nextId,
    };
  }
}

const key = (c: Cell) => c.y * 64 + c.x;
const sq = (v: number) => v * v;
