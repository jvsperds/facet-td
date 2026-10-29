import type { GameData } from '../data';
import { readTowerAbilities, type TowerAbility } from './abilities';
import { Board, CELL_UNITS, type Cell } from './board';
import { findPath } from './path';
import {
  combineOptions,
  planCombine,
  planDowngrade,
  resolveKeepUpgrade,
  type Plan,
  type RecipeKind,
} from './progression';
import type { Rng } from './rng';
import type { EffectBody } from './effects';
import { planTabletCast, type TabletOperation } from './tablets';
import { procCoefficient } from './probability';
import {
  readHeroCatalog,
  listHeroActions,
  planHeroAction,
  adjustDraftOdds,
  type HeroState,
  type HeroPlan,
} from './hero';

// Gem TD's single-player loop, ported from addon_game_mode.lua (line numbers cite the VPK script):
// build five random gems, keep one (the rest become stones), then a wave walks the maze to the castle.
// After wave 50 the game goes endless: waves 51+ replay the list without a build phase until the castle
// falls, which then counts as a win.

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
  disabledUntil?: number;
  procReady?: Record<string, number>;
  level?: number;
  prd?: Record<string, number>;
  buffs?: Record<string, { expires: number; values: Record<string, number> }>;
  /** Natural Emerald copies up to three resolved VPK tower abilities from nearby ranged towers. */
  stolenAbilities?: TowerAbility[];
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
  skills?: string[];
  shield?: { charges: number; expires: number; ready: number };
  blinkReady?: number;
  hasteUntil?: number;
  cleanse?: { damage: number; last: number };
  elite?: boolean;
  prd?: Record<string, number>;
  /** Named VPK modifiers: repeated hits refresh a tier; different tiers stack. */
  modifiers?: Record<
    string,
    {
      expires: number;
      slow: number;
      armor: number;
      properties?: Record<string, number>;
      states?: string[];
      poison?: { damage: number; next: number; interval: number; source: number };
    }
  >;
}
/** `attack` is a tower's own landed attack; `split` an extra target of the same volley; `splash`
 * area damage around it; `dot` periodic damage (poison, fields); `effect` everything else. */
export type HitVia = 'attack' | 'split' | 'splash' | 'dot' | 'effect';
export type GameEvent =
  | {
      type: 'attack';
      from: number;
      to: number;
      damage: number;
      x: number;
      y: number;
      /** How the damage arrived; presentation only (projectiles, splash, ticks). */
      via: HitVia;
    }
  | { type: 'kill'; id: number; gold: number }
  /** A tablet (pedal) fired; its planned operations, for presentation. */
  | { type: 'tablet'; from: number; target: number; operations: readonly TabletOperation[] }
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
  hero: HeroState = { selected: '', abilities: {}, cooldowns: {} };
  heroPosition: Cell = { x: 19, y: 19 };
  // shortcut: the hero's spawn facing is not in the VPK data; south is assumed until checked in the original.
  heroFacing = { x: 0, y: -1 };
  /** Light-pillar beacon (guangzhudaobiao, line 9232): ground creeps detour through it until the round ends. */
  beacon: Cell | null = null;
  private stoneLine: {
    left: number;
    next: number;
    at: Cell;
    dir: { x: number; y: number };
  } | null = null;
  private heroRoute: Cell[] = [];
  private pendingHero: { due: number; plan: Extract<HeroPlan, { ok: true }> } | null = null;
  private prayers: {
    color?: { color: number; chance: number };
    quality?: { quality: string; chance: number };
  } = {};
  private perfected = false;
  private swapTarget: number | null = null;
  private castleBuffs: Record<string, { amount: number; expires: number }> = {};
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
  private tabletUpgradeIn = 0;
  private time = 0;
  private waveTicks = 0;
  private waveDamage: Record<number, number> = {};
  private delayed: {
    due: number;
    source: number;
    sourceName: string;
    target: number;
    damage: number;
    remaining: number;
    radius: number;
    visited: number[];
    chainFrost?: boolean;
  }[] = [];
  private tabletCasts: {
    due: number;
    source: number;
    sourceName: string;
    operation: TabletOperation;
  }[] = [];
  private tabletFields: {
    expires: number;
    source: number;
    sourceName: string;
    operation: TabletOperation;
    next: Record<number, number>;
  }[] = [];
  private tabletReady: Record<number, number> = {};
  private readonly units: Record<string, Unit>;
  private readonly lua: Record<string, { value: unknown }>;
  private readonly abilitiesByUnit: Record<string, TowerAbility[]>;

  constructor(
    readonly data: GameData,
    readonly board: Board,
    private readonly rng: Rng,
  ) {
    this.units = (data.files['npc/units.json'] as { DOTAUnits: Record<string, Unit> }).DOTAUnits;
    this.lua = data.files['lua/addon_game_mode.json'] as Record<string, { value: unknown }>;
    this.abilitiesByUnit = readTowerAbilities(data);
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

  abilities(name: string): readonly TowerAbility[] {
    return this.abilitiesByUnit[name] ?? [];
  }
  private gemAbilities(gem: Gem): readonly TowerAbility[] {
    return [...this.abilities(gem.name), ...(gem.stolenAbilities ?? [])];
  }

  private skills(name: string) {
    return Object.entries(this.units[name] ?? {})
      .filter(([k, v]) => /^Ability\d+$/.test(k) && v)
      .map(([, v]) => v);
  }
  private enemySkills(c: Creep) {
    return c.skills ?? this.skills(c.name);
  }
  private immune(c: Creep) {
    return this.enemySkills(c).includes('enemy_momian') || this.enraged;
  }
  private near(a: Cell, b: Cell, radius: number) {
    return sq(a.x - b.x) + sq(a.y - b.y) <= sq(radius);
  }
  private allyFields(g: Gem) {
    const seen = new Set<string>();
    return this.gems.flatMap((source) =>
      this.gemAbilities(source).flatMap((a) => {
        if (a.kind !== 'field' || !a.ally || !this.near(source.cell, g.cell, a.radius)) return [];
        const key = a.multiple ? `${a.modifier}:${source.id}` : a.modifier;
        if (seen.has(key)) return [];
        seen.add(key);
        return [a];
      }),
    );
  }
  private towerProperty(g: Gem, property: string) {
    let bonus = this.allyFields(g).reduce((sum, a) => sum + (a.properties[property] ?? 0), 0);
    for (const [name, b] of Object.entries(g.buffs ?? {}))
      if (
        b.expires > this.time &&
        name === 'gemtd_hero_kuaisusheji' &&
        property === 'MODIFIER_PROPERTY_ATTACKSPEED_BONUS_CONSTANT'
      )
        bonus += b.values.attack_speed ?? 0;
    const howl = g.buffs?.modifier_howl_unit_datadriven;
    if (
      property === 'MODIFIER_PROPERTY_DAMAGEOUTGOING_PERCENTAGE' &&
      howl &&
      howl.expires > this.time
    )
      bonus += howl.values.damage;
    const range = g.buffs?.gemtd_hero_miaozhun;
    if (range && range.expires > this.time && property === 'MODIFIER_PROPERTY_ATTACK_RANGE_BONUS')
      bonus += range.values.juli;
    return bonus;
  }
  private towerState(g: Gem, state: string) {
    return this.allyFields(g).some((a) => a.states.includes(state));
  }
  private visible(c: Creep) {
    return (
      !this.enemySkills(c).includes('riki_permanent_invisibility') ||
      this.gems.some(
        (g) =>
          this.gemAbilities(g).some((a) => a.kind === 'trait' && a.name === 'tower_true_sight') &&
          this.near(g.cell, c, this.attackRange(g)),
      )
    );
  }
  attackRange(g: Gem) {
    return (
      (num(this.units[g.name], 'AttackRange') +
        this.towerProperty(g, 'MODIFIER_PROPERTY_ATTACK_RANGE_BONUS')) /
      CELL_UNITS
    );
  }

  /** Opal tiers stack; two emitters of the same modifier grant only one buff (VPK tooltips). */
  attackInterval(gem: Gem) {
    let bonus = 0;
    for (const a of this.gemAbilities(gem)) if (a.kind === 'speed') bonus += a.amount;
    const auras = new Set<string>();
    for (const source of this.gems)
      for (const a of this.gemAbilities(source)) {
        if (a.kind !== 'aura' || auras.has(a.modifier)) continue;
        if (sq(source.cell.x - gem.cell.x) + sq(source.cell.y - gem.cell.y) > sq(a.radius))
          continue;
        auras.add(a.modifier);
        bonus += a.amount;
      }
    // Dota's 100 base attack speed, capped at 700 since 7.20 (dota2.com/720).
    return (
      (num(this.units[gem.name], 'AttackRate') * 100) /
      Math.min(
        700,
        Math.max(
          20,
          100 + bonus + this.towerProperty(gem, 'MODIFIER_PROPERTY_ATTACKSPEED_BONUS_CONSTANT'),
        ),
      )
    );
  }

  creepStats(c: Creep) {
    let slow = 0;
    let armor = c.armor;
    let percent = 0,
      magicResist = num(this.units[c.name] ?? {}, 'MagicalResistance');
    let stopped = false,
      noHeal = false;
    for (const m of Object.values(c.modifiers ?? {})) {
      slow += m.slow;
      armor += m.armor;
      percent += m.properties?.MODIFIER_PROPERTY_MOVESPEED_BONUS_PERCENTAGE ?? 0;
      magicResist +=
        m.properties?.MODIFIER_PROPERTY_MAGICAL_RESISTANCE_BONUS ??
        m.properties?.MODIFIER_PROPERTY_MAGICAL_RESISTANCE_DECREPIFY_UNIQUE ??
        0;
      stopped ||= (m.states ?? []).some(
        (s) => s === 'MODIFIER_STATE_STUNNED' || s === 'MODIFIER_STATE_ROOTED',
      );
      noHeal ||= m.properties?.MODIFIER_PROPERTY_DISABLE_HEALING === 1;
    }
    for (const source of this.creeps)
      if (
        this.enemySkills(source).includes('enemy_high_armor') &&
        this.near(source, c, 500 / CELL_UNITS)
      )
        armor += 4;
    for (const source of this.creeps)
      if (this.enemySkills(source).includes('guai_xietong')) slow -= 150;
    if ((c.hasteUntil ?? 0) > this.time) percent += 50;
    if (this.enraged) percent += 100;
    // shortcut: assumes Dota's 100 movement-speed floor; verify against the original runtime before Classic certification.
    const speed = stopped
      ? 0
      : slow || percent
        ? Math.max(
            100 / CELL_UNITS / TICK_HZ,
            (c.speed + slow / CELL_UNITS / TICK_HZ) * (1 + percent / 100),
          )
        : c.speed;
    return { speed, armor, magicResist, noHeal, stopped };
  }

  private applyEffect(c: Creep, source: Gem, effect: EffectBody, tick: number, aura = false) {
    if (this.immune(c) && !effect.pierces) return;
    c.modifiers ??= {};
    const name = effect.multiple
      ? `${effect.modifier}:${source.id}:${aura ? 'field' : tick}`
      : effect.modifier;
    const old = c.modifiers[name];
    const interval = Math.max(1, Math.round(effect.interval * TICK_HZ));
    c.modifiers[name] = {
      expires:
        tick + Math.round((aura ? Math.max(0.1, effect.duration) : effect.duration) * TICK_HZ),
      slow: effect.properties.MODIFIER_PROPERTY_MOVESPEED_BONUS_CONSTANT ?? 0,
      armor: effect.properties.MODIFIER_PROPERTY_PHYSICAL_ARMOR_BONUS ?? 0,
      properties: effect.properties,
      states: effect.states,
      ...(effect.damage
        ? {
            poison: old?.poison ?? {
              damage: effect.damage,
              next: tick + interval,
              interval,
              source: source.id,
            },
          }
        : {}),
    };
  }

  private refreshFields(tick: number) {
    for (const g of this.gems)
      for (const a of this.gemAbilities(g))
        if (a.kind === 'field' && !a.ally)
          for (const c of this.creeps)
            if (
              this.near(g.cell, c, a.radius) &&
              !(a.excludeAncients && this.units[c.name]?.IsAncient === '1')
            )
              this.applyEffect(c, g, a, tick, true);
  }

  get heroLevel() {
    return XP_FOR_LEVEL.filter((xp) => this.xp >= xp).length;
  }

  heroActions() {
    return listHeroActions(this.data, this.hero);
  }
  configureHero(selected: string, abilities: Record<string, number>): Check {
    if (this.phase !== 'build' || this.draft.length > 0 || this.pendingHero)
      return { ok: false, reason: 'Choose a hero between drafts.' };
    const catalog = readHeroCatalog(this.data);
    if (
      !catalog.heroes[selected] ||
      !abilities ||
      typeof abilities !== 'object' ||
      Array.isArray(abilities)
    )
      return { ok: false, reason: 'Invalid hero profile.' };
    const defs = (
      this.data.files['npc/abilities.json'] as {
        DOTAAbilities: Record<string, { MaxLevel?: string }>;
      }
    ).DOTAAbilities;
    const normalized: Record<string, number> = {};
    for (const [key, level] of Object.entries(abilities)) {
      const name = catalog.abilities[key] ?? key;
      if (
        !Object.values(catalog.abilities).includes(name) ||
        !Number.isInteger(level) ||
        level < 1 ||
        level > Number(defs[name]?.MaxLevel ?? 1)
      )
        return { ok: false, reason: 'Invalid hero skill or level.' };
      normalized[name] = level;
    }
    this.hero = { selected, abilities: normalized, cooldowns: { ...this.hero.cooldowns } };
    return { ok: true };
  }
  moveHero(cell: Cell): Check {
    if (
      !this.board.inside(cell) ||
      !Number.isInteger(cell.x) ||
      !Number.isInteger(cell.y) ||
      this.phase === 'lost' ||
      this.phase === 'won'
    )
      return { ok: false, reason: 'Invalid destination.' };
    if (this.pendingHero) return { ok: false, reason: 'The hero is casting.' };
    const path = findPath(
      { x: Math.round(this.heroPosition.x), y: Math.round(this.heroPosition.y) },
      cell,
      this.blocked,
    );
    if (!path) return { ok: false, reason: 'No route for the hero.' };
    this.heroRoute = path.slice(1);
    return { ok: true };
  }
  private heroContext(target?: number) {
    const gem = this.gems.find((g) => g.id === target);
    const stone = target !== undefined && target < 0 ? this.stones.get(-target) : undefined;
    return {
      gold: this.gold,
      phase: this.phase,
      buildReady: this.draft.length >= 5,
      castleHp: this.castleHp,
      castleMaxHp: this.luaValue<number>('gem_castle_hp_max'),
      ...(gem
        ? {
            target: {
              id: gem.id,
              attackDamage: num(this.units[gem.name], 'AttackDamageMin'),
              friendly: true,
              slab: gem.name.includes('shiban'),
              owned: true,
            },
          }
        : stone
          ? { target: { id: target!, attackDamage: 0, friendly: true, owned: true } }
          : {}),
    };
  }
  canHeroAction(action: string, target?: number, point?: Cell, tick = this.time): Check {
    if (this.phase === 'lost' || this.phase === 'won' || this.pendingHero)
      return { ok: false, reason: 'Hero action unavailable.' };
    const plan = planHeroAction(
      this.data,
      this.hero,
      action,
      { ...this.heroContext(target), point },
      tick,
      1,
    );
    if (!plan.ok) return plan;
    if (
      point &&
      (!this.board.inside(point) || !Number.isInteger(point.x) || !Number.isInteger(point.y))
    )
      return { ok: false, reason: 'Invalid target cell.' };
    if (plan.effect.kind === 'stoneLine' && this.stoneLine)
      return { ok: false, reason: 'The stone line is still being built.' };
    if (plan.effect.kind === 'beacon') {
      const refusal = this.beaconRefusal(plan.effect.point);
      if (refusal) return { ok: false, reason: refusal };
    }
    const gem = this.gems.find((g) => g.id === target);
    const position =
      plan.effect.kind === 'stoneLine'
        ? undefined
        : (gem?.cell ?? (target !== undefined && target < 0 ? this.stones.get(-target) : point));
    if (position && !this.near(position, this.heroPosition, 500 / CELL_UNITS))
      return { ok: false, reason: 'Move the hero closer to this tower.' };
    if (
      plan.effect.kind === 'swapNearbyStone' &&
      gem &&
      !Array.from(this.stones.values()).some((s) => this.near(s, gem.cell, 192 / CELL_UNITS))
    )
      return { ok: false, reason: 'No normal stone is close to this tower.' };
    return { ok: true };
  }
  /** guangzhudaobiao's placement checks, in the original's order. */
  private beaconRefusal(p: Cell) {
    const kind = this.board.kind(p);
    if (kind === 'no-build' || kind === 'outside') return 'Unable to build here';
    if (this.creeps.some((c) => this.near(c, p, 192 / CELL_UNITS))) return 'Unable to build here';
    if (this.friendlyAt(p)) return 'Unable to build here';
    if (kind === 'waypoint') return 'Unable to build here';
    if (!this.findRoute(undefined, p)) return 'Blocked if build here';
    return null;
  }
  /** A friendly unit within 58 units of a cell centre: stone, tower, hero or beacon. */
  private friendlyAt(c: Cell) {
    return (
      this.stoneAt(c) ||
      !!this.gemAt(c) ||
      this.near(this.heroPosition, c, 58 / CELL_UNITS) ||
      (this.beacon?.x === c.x && this.beacon?.y === c.y)
    );
  }
  castHero(action: string, target: number | undefined, tick: number, point?: Cell): Check {
    const check = this.canHeroAction(action, target, point, tick);
    if (!check.ok) return check;
    let roll = 1;
    if (action === 'gemtd_hero_huichun') {
      const level = this.hero.abilities[action];
      roll = this.rng.int(1, [10, 13, 15, 16][level - 1]);
    }
    const plan = planHeroAction(
      this.data,
      this.hero,
      action,
      { ...this.heroContext(target), point },
      tick,
      roll,
    );
    if (!plan.ok) return plan;
    this.gold -= plan.cost;
    this.hero.cooldowns[action] = plan.cooldownUntil;
    this.pendingHero = { due: tick + 6, plan };
    this.heroRoute = [];
    return { ok: true };
  }
  private heroStep(tick: number) {
    if (this.pendingHero && this.pendingHero.due <= tick) {
      const { effect } = this.pendingHero.plan;
      this.pendingHero = null;
      if (effect.kind === 'heal')
        this.castleHp = Math.min(
          this.luaValue<number>('gem_castle_hp_max'),
          this.castleHp + effect.amount,
        );
      else if (effect.kind === 'castleBuff')
        this.castleBuffs[effect.buff] = { amount: effect.amount, expires: tick + effect.duration };
      else if (effect.kind === 'prayer') {
        if (effect.color !== undefined)
          this.prayers.color = { color: effect.color, chance: effect.chance };
        if (effect.quality !== undefined)
          this.prayers.quality = { quality: effect.quality, chance: effect.chance };
      } else if (effect.kind === 'rewindDraft') {
        this.gems = this.gems.filter((g) => !this.draft.includes(g.id));
        this.draft = [];
        this.route = this.findRoute() ?? this.route;
      } else if (effect.kind === 'beacon') {
        // The new beacon replaces the old one; the original re-checks the route when it lands.
        const p = { x: effect.point.x, y: effect.point.y };
        const previous = this.beacon;
        this.beacon = null;
        this.beacon = this.beaconRefusal(p) ? previous : p;
        this.route = this.findRoute() ?? this.route;
      } else if (effect.kind === 'stoneLine') {
        // gemtd_hero_shitou (line 8818): from the hero's cell, one stone per 0.2 s along its facing.
        this.stoneLine = {
          left: effect.count,
          next: tick,
          at: {
            x: Math.floor(this.heroPosition.x + 0.5),
            y: Math.floor(this.heroPosition.y + 0.5),
          },
          dir: { ...this.heroFacing },
        };
      } else if (effect.kind === 'towerBuff') {
        const target = this.gems.find((g) => g.id === effect.target);
        if (target) {
          target.buffs ??= {};
          target.buffs[effect.ability] = { expires: tick + effect.duration, values: effect.values };
        }
      } else if (effect.kind === 'swap') {
        if (
          this.swapTarget !== null &&
          this.heroTargetCell(this.swapTarget) &&
          this.heroTargetCell(effect.target)
        ) {
          const a = { ...this.heroTargetCell(this.swapTarget)! },
            b = { ...this.heroTargetCell(effect.target)! };
          if (this.swapTarget >= 0 || effect.target >= 0) {
            this.moveHeroTarget(this.swapTarget, b);
            this.moveHeroTarget(effect.target, a);
          }
          this.swapTarget = null;
        } else this.swapTarget = effect.target;
      } else if (effect.kind === 'swapNearbyStone') {
        const target = this.gems.find((g) => g.id === effect.target);
        const stone =
          target &&
          Array.from(this.stones.values()).find((s) =>
            this.near(s, target.cell, effect.radius / CELL_UNITS),
          );
        if (target && stone) {
          const previous = { ...target.cell };
          this.stones.delete(key(stone));
          target.cell = { ...stone };
          this.stones.set(key(previous), previous);
        }
      } else if (effect.kind === 'whirlwind') {
        const ring = [
          [-1, 1],
          [-1, 0],
          [-1, -1],
          [0, -1],
          [1, -1],
          [1, 0],
          [1, 1],
          [0, 1],
        ];
        const targets = ring
          .map(([x, y]) => ({
            x: Math.round(effect.point.x) + x,
            y: Math.round(effect.point.y) + y,
          }))
          .flatMap((cell) => {
            const gem = this.gemAt(cell);
            return gem && !gem.name.includes('shiban')
              ? [{ id: gem.id, cell }]
              : this.stoneAt(cell)
                ? [{ id: -key(cell), cell }]
                : [];
          });
        for (const t of targets) if (t.id < 0) this.stones.delete(-t.id);
        targets.forEach((t, i) => {
          const cell = targets[(i + 1) % targets.length].cell;
          if (t.id < 0) this.stones.set(key(cell), { ...cell });
          else this.gems.find((g) => g.id === t.id)!.cell = { ...cell };
        });
      } else if (effect.kind === 'lastStand') {
        const target = this.gems.find((g) => g.id === effect.target);
        if (target) {
          const defs = (
            this.data.files['npc/abilities.json'] as {
              DOTAAbilities: Record<string, { AbilityValues: { attack_plus: string } }>;
            }
          ).DOTAAbilities;
          const values = defs[
            `gemtd_hero_beishuiyizhan_unit${effect.level}`
          ].AbilityValues.attack_plus
            .split(/\s+/)
            .map(Number);
          const index = Math.min(
            4,
            Math.floor((this.luaValue<number>('gem_castle_hp_max') - this.castleHp) / 20),
          );
          target.buffs ??= {};
          target.buffs.gemtd_hero_beishuiyizhan = {
            expires: tick + 60 * TICK_HZ,
            values: { damage: values[index] },
          };
        }
      }
    }
    let distance = 500 / CELL_UNITS / TICK_HZ;
    while (distance > 0 && this.heroRoute.length) {
      const point = this.heroRoute[0],
        dx = point.x - this.heroPosition.x,
        dy = point.y - this.heroPosition.y,
        d = Math.sqrt(dx * dx + dy * dy);
      if (d > 0) this.heroFacing = { x: dx / d, y: dy / d };
      if (d <= distance) {
        this.heroPosition = { ...point };
        this.heroRoute.shift();
        distance -= d;
      } else {
        this.heroPosition = {
          x: this.heroPosition.x + (dx / d) * distance,
          y: this.heroPosition.y + (dy / d) * distance,
        };
        distance = 0;
      }
    }
  }
  private stoneLineStep(tick: number) {
    const line = this.stoneLine;
    if (!line || tick < line.next) return;
    line.at = {
      x: Math.floor(line.at.x + line.dir.x + 0.5),
      y: Math.floor(line.at.y + line.dir.y + 0.5),
    };
    line.left--;
    const c = line.at;
    const kind = this.board.kind(c);
    // build_1_stone (line 8906) with can_remove_stone = false: any refusal ends the line.
    const ok =
      kind !== 'no-build' &&
      kind !== 'outside' &&
      !this.creeps.some((e) => this.near(e, c, 96 / CELL_UNITS)) &&
      !this.friendlyAt(c) &&
      kind !== 'waypoint' &&
      !!this.findRoute(c);
    if (ok) {
      this.stones.set(key(c), { ...c });
      this.route = this.findRoute() ?? this.route;
    } else if (this.stoneAt(c)) {
      // Running into a normal stone turns it into a random basic gem that stays on the board.
      const quality = this.rollQuality();
      const types = this.luaValue<Record<string, string>>('gem_tower_basic');
      const name = types[this.rng.int(1, Object.keys(types).length)] + quality;
      this.stones.delete(key(c));
      this.gems.push({ id: this.nextId++, name, cell: { ...c }, cooldown: 0, target: null });
    }
    if (ok && line.left > 0) line.next = tick + Math.round(0.2 * TICK_HZ);
    else this.stoneLine = null;
  }
  private heroTargetCell(id: number) {
    return id < 0 ? this.stones.get(-id) : this.gems.find((g) => g.id === id)?.cell;
  }
  private moveHeroTarget(id: number, cell: Cell) {
    if (id < 0) {
      this.stones.delete(-id);
      this.stones.set(key(cell), { ...cell });
    } else {
      const gem = this.gems.find((g) => g.id === id);
      if (gem) gem.cell = { ...cell };
    }
  }
  gemAt(c: Cell) {
    return this.gems.find((g) => g.cell.x === c.x && g.cell.y === c.y);
  }
  stoneAt(c: Cell) {
    return this.stones.has(key(c));
  }
  private blocked = (x: number, y: number) =>
    this.stones.has(key({ x, y })) ||
    this.gems.some((g) => !g.name.includes('shiban') && g.cell.x === x && g.cell.y === y);

  /** Ground route through every waypoint (find_all_path, line 6873), or null when any leg is cut. */
  private findRoute(extra?: Cell, beacon = this.beacon): Cell[] | null {
    const blocked = extra
      ? (x: number, y: number) => (x === extra.x && y === extra.y) || this.blocked(x, y)
      : this.blocked;
    const route: Cell[] = [];
    // With a beacon the first leg runs path1 -> beacon -> path2 (find_all_path, line 6908).
    const w = beacon ? [this.flyRoute[0], beacon, ...this.flyRoute.slice(1)] : this.flyRoute;
    for (let i = 0; i + 1 < w.length; i++) {
      const leg = findPath(w[i], w[i + 1], blocked);
      if (!leg) return null;
      route.push(...(i ? leg.slice(1) : leg));
    }
    return route;
  }

  // ---- Build phase (gemtd_build_stone, line 4884) ----

  canBuild(c: Cell): Check {
    if (this.pendingHero) return { ok: false, reason: 'The hero is casting.' };
    const no = (reason: string): Refusal => ({ ok: false, reason });
    if (this.phase !== 'build') return no('You can only build between waves.');
    if (this.draft.length >= DRAFT_SIZE)
      return no('All five gems are placed. Keep one to start the wave.');
    const kind = this.board.kind(c);
    if (kind === 'outside' || kind === 'waypoint' || kind === 'no-build')
      return no('Unable to build here');
    if (this.gemAt(c) || (this.beacon?.x === c.x && this.beacon?.y === c.y))
      return no('Unable to build here');
    if (!this.findRoute(c)) return no('Blocked if build here');
    return { ok: true };
  }

  build(c: Cell): Check {
    const check = this.canBuild(c);
    if (!check.ok) return check;
    this.stones.delete(key(c)); // building on a stone replaces it (line 4960)
    // Quality from the hero level's odds table (gem_gailv), then a uniform type (gem_tower_basic).
    let quality = this.rollQuality();
    if (this.prayers.quality) {
      if (!this.perfected) {
        const prayerRoll = this.rng.int(1, 100);
        quality = adjustDraftOdds({ color: 1, quality }, this.prayers.quality, prayerRoll).quality;
        if (prayerRoll < this.prayers.quality.chance) this.perfected = true;
      }
    }
    const types = this.luaValue<Record<string, string>>('gem_tower_basic');
    let color = this.rng.int(1, Object.keys(types).length);
    if (this.prayers.color)
      color = adjustDraftOdds({ color, quality }, this.prayers.color, this.rng.int(1, 100)).color;
    this.prayers = {};
    const name = types[color] + quality;
    const gem: Gem = { id: this.nextId++, name, cell: { ...c }, cooldown: 0, target: null };
    this.gems.push(gem);
    this.draft.push(gem.id);
    this.route = this.findRoute() ?? this.route;
    return { ok: true };
  }

  private rollQuality() {
    const roll = this.rng.int(1, 100);
    let quality = '1';
    let best = 0;
    for (const [per, lv] of Object.entries(
      this.luaValue<Record<string, Record<string, string>>>('gem_gailv')[this.heroLevel] ?? {},
    ))
      if (roll > Number(per) && best <= Number(per)) [best, quality] = [Number(per), lv];
    return quality;
  }

  canRemove(c: Cell): Check {
    if (this.pendingHero) return { ok: false, reason: 'The hero is casting.' };
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
    if (this.pendingHero) return { ok: false, reason: 'The hero is casting.' };
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
    const plan = resolveKeepUpgrade(this.data, this, id, upgrade);
    return plan.ok ? { ok: true, name: plan.result } : plan;
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

  combineOptions(id: number) {
    return combineOptions(this.data, this, id);
  }

  canCombine(id: number, kind: RecipeKind, result: string, cell?: Cell): Check {
    if (this.pendingHero) return { ok: false, reason: 'The hero is casting.' };
    const plan = planCombine(this.data, this, id, kind, result);
    if (!plan.ok) return plan;
    if (plan.placement === 'separate') {
      if (!cell) return { ok: false, reason: 'Select an empty cell for the tablet.' };
      const type = this.board.kind(cell);
      if (
        (type !== 'open' && type !== 'stone') ||
        this.gemAt(cell) ||
        this.stoneAt(cell) ||
        !Number.isInteger(cell.x) ||
        !Number.isInteger(cell.y)
      )
        return { ok: false, reason: 'Tablets need an empty buildable cell.' };
      if (this.creeps.some((c) => sq(c.x - cell.x) + sq(c.y - cell.y) <= sq(192 / CELL_UNITS)))
        return { ok: false, reason: 'An enemy is too close to the tablet placement.' };
    }
    return { ok: true };
  }

  combine(id: number, kind: RecipeKind, result: string, cell?: Cell): Check {
    const check = this.canCombine(id, kind, result, cell);
    if (!check.ok) return check;
    const plan = planCombine(this.data, this, id, kind, result);
    if (!plan.ok) return plan;
    this.applyProgression(plan, id, cell);
    return { ok: true };
  }

  canDowngrade(id: number): Check {
    if (this.pendingHero) return { ok: false, reason: 'The hero is casting.' };
    const p = planDowngrade(this.data, this, id, 1);
    return p.ok ? { ok: true } : p;
  }
  canHammer(id: number): Check {
    if (!this.hero.abilities.gemtd_hero_fengbaozhichui)
      return { ok: false, reason: 'Needs the Fixed Hammer hero skill.' };
    if (this.pendingHero) return { ok: false, reason: 'The hero is casting.' };
    const p = planDowngrade(this.data, this, id, 1, true);
    return p.ok ? { ok: true } : p;
  }
  /**
   * Fixed Hammer: downgrade one level and keep. The hero skill lists 250/150/100/75 gold, but the
   * downgrade ability that charges it has no cost value, so the original's CostGold never charges.
   */
  hammer(id: number): Check {
    const check = this.canHammer(id);
    if (!check.ok) return check;
    const plan = planDowngrade(this.data, this, id, 1, true);
    if (!plan.ok) return plan;
    this.applyProgression(plan, id);
    return { ok: true };
  }
  downgrade(id: number): Check {
    const check = this.canDowngrade(id);
    if (!check.ok) return check;
    const plan = planDowngrade(this.data, this, id, this.rng.int(1, 100));
    if (!plan.ok) return plan;
    this.applyProgression(plan, id);
    return { ok: true };
  }

  private applyProgression(plan: Extract<Plan, { ok: true }>, id: number, cell?: Cell) {
    const anchor = this.gems.find((g) => g.id === id)!;
    const position = plan.placement === 'separate' ? cell! : anchor.cell;
    const stolenAbilities =
      plan.result === 'gemtd_tianranzumulv'
        ? this.naturalEmeraldAbilities(plan.consume, position)
        : [];
    const level = Math.min(
      10,
      this.gems
        .filter((g) => plan.consume.includes(g.id))
        .reduce((sum, g) => sum + (g.level ?? 0), 0),
    );
    for (const g of this.gems)
      if (
        plan.kind !== 'tablet-upgrade' &&
        plan.consume.includes(g.id) &&
        (g.id !== id || plan.placement === 'separate')
      )
        this.stones.set(key(g.cell), g.cell);
    this.gems = this.gems.filter((g) => !plan.consume.includes(g.id));
    this.gems.push({
      id: plan.placement === 'separate' ? this.nextId++ : id,
      name: plan.result,
      cell: { ...position },
      cooldown: 0,
      target: null,
      level,
      ...(stolenAbilities.length ? { stolenAbilities } : {}),
    });
    if (plan.endDraft) this.draft = [];
    this.route = this.findRoute() ?? this.route;
    if (plan.endDraft) this.startWave();
    if (plan.kind === 'tablet' || plan.kind === 'tablet-upgrade') this.tabletUpgradeIn = TICK_HZ;
  }

  /** Natural Emerald (combine lines 9566-9611): copy three distinct pool abilities nearby. */
  private naturalEmeraldAbilities(consumed: number[], position: Cell): TowerAbility[] {
    const pool = this.luaValue<string[]>('stealable_ability_pool');
    const candidates = this.gems.filter(
      (g) =>
        !consumed.includes(g.id) &&
        g.name !== 'gemtd_tianranzumulv' &&
        this.units[g.name]?.AttackCapabilities === 'DOTA_UNIT_CAP_RANGED_ATTACK' &&
        this.near(g.cell, position, 220 / CELL_UNITS),
    );
    const options = candidates.flatMap((g) =>
      pool
        .filter((name) => this.skills(g.name).includes(name))
        .flatMap((name) => this.gemAbilities(g).filter((ability) => ability.name === name)),
    );
    const picked: TowerAbility[] = [];
    for (let attempts = 0; options.length && attempts < 100 && picked.length < 3; attempts++) {
      const ability = options[this.rng.int(1, options.length) - 1];
      if (!picked.some((a) => a.name === ability.name)) picked.push(ability);
    }
    return picked;
  }

  // ---- Wave (start_shuaguai, line 6261; spawning in OnThink, line 3346) ----

  /** UpdateGuaiLevel (line 13692): endless waves replay the wave list from the start. */
  get guaiLevel() {
    return this.level > LAST_LEVEL ? this.level - LAST_LEVEL : this.level;
  }
  /** Rage aura from the castle (enemy_crazy, line 3304): +100% speed and magic immunity. */
  get enraged() {
    return this.phase === 'wave' && this.waveTicks > 181 * TICK_HZ;
  }

  private startWave() {
    this.phase = 'wave';
    this.perfected = false;
    this.waveTicks = 0;
    this.waveDamage = {};
    this.delayed = [];
    const guai = this.luaValue<Record<string, string>>('guai');
    let name = guai[this.guaiLevel];
    if (guai[this.guaiLevel + 100] && this.rng.int(1, 2) === 1) name = guai[this.guaiLevel + 100];
    this.spawnName = name;
    this.toSpawn = name.includes('boss') ? 1 : this.luaValue<number>('wave_enemy_count');
    this.nextSpawn = 0;
  }

  private spawn() {
    let name = this.spawnName;
    if ([35, 36, 38].includes(this.guaiLevel) && this.rng.int(1, 100) > 50) name += '1';
    const u = this.units[name] ?? this.units[this.spawnName];
    const difficulty = this.luaValue<Record<string, number>>('gem_difficulty')[1];
    const speedFactor = this.luaValue<Record<string, number>>('gem_difficulty_speed')[1];
    const elite = !name.includes('boss') && !name.includes('tester') && this.rng.int(1, 400) === 1;
    let hp =
      num(u, 'StatusHealth') *
      difficulty *
      (elite ? ((51 - Math.min(this.level, 50)) / 50) * 6 + 2 : 1);
    let speed = (num(u, 'MovementSpeed') * speedFactor) / CELL_UNITS / TICK_HZ;
    const skills = new Set([
      ...this.skills(name),
      ...(this.luaValue<Record<string, string[]>>('guai_ability')[this.guaiLevel] ?? []),
    ]);
    if (this.level > LAST_LEVEL) {
      // Endless creeps (line 3415): two random guai_50_ability skills, then near-unkillable HP.
      // Offline there is no weekly word_object theme, so the original's no-theme branch applies.
      if (name.includes('fly')) hp /= 3;
      const pool = this.luaValue<string[]>('guai_50_ability');
      for (let i = 0; i < 2; i++) {
        const skill = pool[this.rng.int(1, pool.length) - 1];
        if (skill === 'enemy_momian') hp /= 5;
        if (skill === 'enemy_wumian') hp /= 3;
        skills.add(skill);
      }
      hp = hp > 10000 ? 999999999 : hp * 100000;
      speed *= 1.8;
    }
    hp = Math.max(1, Math.floor(hp));
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
      speed,
      x: start.x,
      y: start.y,
      step: 1,
      fly: name.includes('fly'),
      boss: name.includes('boss'),
      damage,
      elite,
      skills: [...skills],
    });
    this.toSpawn--;
  }

  private move(c: Creep) {
    const route = c.fly ? this.flyRoute : this.route;
    let left = this.creepStats(c).speed;
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
        this.waypointEffects(c, t);
      } else {
        c.x += (dx / d) * left;
        c.y += (dy / d) * left;
        left = 0;
      }
    }
  }

  /** Lua enemy_go: path-point vitality and theft resolve after each checkpoint is reached. */
  private waypointEffects(c: Creep, point: Cell) {
    if (!this.board.waypoints.slice(1).some((w) => w.cell.x === point.x && w.cell.y === point.y))
      return;
    const skills = this.enemySkills(c);
    if (skills.includes('enemy_jili') && !c.modifiers?.modifier_tower_jihan_buff) {
      const recovered = Math.floor(c.maxHp * 0.2) * (c.fly ? 0.5 : 1);
      c.hp = Math.min(c.maxHp, c.hp + recovered);
    }
    if (skills.includes('enemy_thief')) this.gold = Math.floor(this.gold * 0.99);
  }

  private enemyThink(c: Creep, tick: number) {
    if (c.step <= 1 || this.creepStats(c).stopped) return;
    const skills = this.enemySkills(c);
    if (
      skills.includes('enemy_zheguang') &&
      (!c.shield || c.shield.charges === 0 || c.shield.expires <= tick) &&
      (!c.shield || c.shield.ready <= tick) &&
      this.rng.int(1, 100) <= 20
    )
      c.shield = { charges: 7, expires: tick + 60 * TICK_HZ, ready: tick + 5 * TICK_HZ };
    else if (
      skills.includes('enemy_shanshuo') &&
      (c.blinkReady ?? 0) <= tick &&
      this.rng.int(1, 100) <= 10
    ) {
      const route = c.fly ? this.flyRoute : this.route;
      const index = Math.min(route.length - 1, c.step + Math.ceil(route.length / 35));
      c.x = route[index].x;
      c.y = route[index].y;
      c.step = index + 1;
      c.blinkReady = tick + 12 * TICK_HZ;
    } else if (
      skills.includes('runrunrun') &&
      (c.hasteUntil ?? 0) <= tick &&
      this.rng.int(1, 100) <= 20
    )
      c.hasteUntil = tick + 20 * TICK_HZ;
  }

  private roll(
    chance: number,
    entity: { prd?: Record<string, number> },
    key: string,
    pseudo = false,
  ) {
    if (chance >= 100) return true;
    if (chance <= 0) return false;
    if (!pseudo) return this.rng.int(1, 100) <= chance;
    entity.prd ??= {};
    const failures = entity.prd[key] ?? 0;
    const hit = this.rng.u32() / 4294967296 < Math.min(1, procCoefficient(chance) * (failures + 1));
    entity.prd[key] = hit ? 0 : failures + 1;
    return hit;
  }

  private scriptEffect(
    g: Gem,
    target: Creep,
    raw: number,
    fn: string,
    args: Record<string, string>,
    tick: number,
  ) {
    if (fn === 'jn_D3_00') {
      if (!this.creeps.includes(target)) return;
      this.delayed.push({
        due: tick,
        source: g.id,
        sourceName: g.name,
        target: target.id,
        damage: Number(args.Damage),
        remaining: Number(args.Count),
        radius: Number(args.Radius) / CELL_UNITS,
        visited: [],
      });
    } else if (fn === 'Shock') {
      const targets = [
        target,
        ...this.creeps
          .filter(
            (c) =>
              c !== target &&
              !this.immune(c) &&
              this.visible(c) &&
              this.near(target, c, 1000 / CELL_UNITS),
          )
          .sort(
            (a, b) =>
              sq(b.x - target.x) + sq(b.y - target.y) - (sq(a.x - target.x) + sq(a.y - target.y)) ||
              a.id - b.id,
          ),
      ].slice(0, 5);
      for (const c of targets) this.hurt(c, 4000, 'magical', g.id);
    } else if (fn === 'ranjin') {
      if (this.rng.int(1, 100) < 15)
        for (const c of [...this.creeps])
          if (this.near(target, c, 400 / CELL_UNITS)) this.hurt(c, raw * 20, 'magical', g.id);
    } else if (fn === 'gazeNew' || fn === 'shihua') {
      g.procReady ??= {};
      if ((g.procReady[fn] ?? 0) > tick) return;
      g.procReady[fn] = tick + 5 * TICK_HZ;
      const targets = [...this.creeps]
        .sort(
          (a, b) =>
            sq(a.x - g.cell.x) + sq(a.y - g.cell.y) - (sq(b.x - g.cell.x) + sq(b.y - g.cell.y)) ||
            a.id - b.id,
        )
        .slice(0, 5 + Math.floor((g.level ?? 0) / 2));
      for (const c of targets)
        this.applyEffect(
          c,
          g,
          {
            modifier: 'modifier_medusa_stone_gaze_stone',
            duration: 2.5,
            properties: {},
            states: ['MODIFIER_STATE_STUNNED'],
            damage: 0,
            interval: 0,
            multiple: false,
            pierces: true,
          },
          tick,
        );
    }
  }

  private delayedEffects(tick: number) {
    const due = this.delayed.filter((e) => e.due <= tick);
    this.delayed = this.delayed.filter((e) => e.due > tick);
    for (const e of due) {
      const source = this.gems.find((g) => g.id === e.source && g.name === e.sourceName);
      const c = this.creeps.find((c) => c.id === e.target);
      if (!source || !c) continue;
      this.hurt(c, e.damage, 'magical', source.id);
      if (e.chainFrost)
        this.applyEffect(
          c,
          source,
          {
            modifier: 'modifier_chain_frost_slow',
            duration: 5,
            properties: { MODIFIER_PROPERTY_MOVESPEED_BONUS_PERCENTAGE: -60 },
            states: [],
            damage: 0,
            interval: 0,
            multiple: false,
            pierces: true,
          },
          tick,
        );
      const visited = [...e.visited, c.id];
      if (e.remaining <= 1) continue;
      const next = this.creeps
        .filter(
          (n) =>
            !visited.includes(n.id) &&
            !this.immune(n) &&
            this.visible(n) &&
            this.near(c, n, e.radius),
        )
        .sort(
          (a, b) => sq(a.x - c.x) + sq(a.y - c.y) - (sq(b.x - c.x) + sq(b.y - c.y)) || a.id - b.id,
        )[0];
      if (next)
        this.delayed.push({
          ...e,
          due: tick + Math.round(0.2 * TICK_HZ),
          target: next.id,
          remaining: e.remaining - 1,
          visited,
        });
    }
  }

  private tabletStep(tick: number) {
    if (tick % 3 === 0)
      for (const g of this.gems) {
        const plan = planTabletCast(
          this.data,
          g.name,
          { ...g.cell, cooldownUntil: this.tabletReady[g.id] },
          this.creeps,
          tick,
        );
        if (!plan.ok) continue;
        this.tabletReady[g.id] = plan.cooldownUntil;
        this.events.push({
          type: 'tablet',
          from: g.id,
          target: plan.target,
          operations: plan.plans,
        });
        for (const operation of plan.plans) {
          if (operation.modifier === 'modifier_howl_unit_datadriven') {
            for (const ally of this.gems)
              if (
                this.near(g.cell, ally.cell, operation.radius!) &&
                this.units[ally.name]?.AttackCapabilities === 'DOTA_UNIT_CAP_RANGED_ATTACK'
              ) {
                ally.buffs ??= {};
                ally.buffs[operation.modifier] = {
                  expires: tick + operation.duration!,
                  values: { damage: operation.damagePct! },
                };
              }
          } else if (operation.modifier?.startsWith('modifier_acid_spray')) {
            this.tabletFields.push({
              expires: tick + operation.duration!,
              source: g.id,
              sourceName: g.name,
              operation,
              next: {},
            });
          } else if (operation.modifier === 'modifier_torrent_slow_debuff_datadriven') {
            this.tabletCasts.push({
              due: tick + operation.delay!,
              source: g.id,
              sourceName: g.name,
              operation,
            });
          } else if (operation.kind === 'targets' || operation.kind === 'bounce') {
            this.tabletStun(g, { ...operation, target: operation.target ?? plan.target }, tick);
          } else if (operation.kind === 'line') {
            this.tabletFields.push({
              expires: tick + operation.duration!,
              source: g.id,
              sourceName: g.name,
              operation,
              next: {},
            });
          } else if (operation.kind === 'area') {
            for (const c of this.creeps)
              if (
                this.near({ x: operation.x!, y: operation.y! }, c, operation.radius!) &&
                (!this.immune(c) || operation.magicImmune)
              )
                this.tabletModifier(c, g, operation, tick);
          }
        }
        this.triggerChainFrost(g, plan.target, plan.triggerChainFrost, tick);
      }
    const casts = this.tabletCasts.filter((cast) => cast.due <= tick);
    this.tabletCasts = this.tabletCasts.filter((cast) => cast.due > tick);
    for (const cast of casts) {
      const source = this.gems.find((g) => g.id === cast.source && g.name === cast.sourceName);
      if (!source) continue;
      const op = cast.operation;
      for (const c of [...this.creeps])
        if (this.near({ x: op.x!, y: op.y! }, c, op.radius!) && !this.immune(c)) {
          this.hurt(c, op.damage!, 'magical', source.id);
          this.applyEffect(
            c,
            source,
            {
              modifier: op.modifier!,
              duration: op.duration! / TICK_HZ,
              properties: { MODIFIER_PROPERTY_MOVESPEED_BONUS_PERCENTAGE: op.slowPct! },
              states: [],
              damage: 0,
              interval: 0,
              multiple: false,
              pierces: false,
            },
            tick,
          );
          this.applyEffect(
            c,
            source,
            {
              modifier: 'modifier_torrent_stun',
              duration: op.stun! / TICK_HZ,
              properties: {},
              states: ['MODIFIER_STATE_STUNNED'],
              damage: 0,
              interval: 0,
              multiple: false,
              pierces: false,
            },
            tick,
          );
        }
    }
    this.tabletFields = this.tabletFields.filter(
      (field) =>
        field.expires > tick &&
        this.gems.some((g) => g.id === field.source && g.name === field.sourceName),
    );
    for (const field of this.tabletFields) {
      const source = this.gems.find((g) => g.id === field.source)!;
      const op = field.operation;
      for (const c of this.creeps) {
        const key = `${op.modifier}:${source.id}`;
        const inField =
          op.kind === 'line'
            ? this.inTabletLine(source.cell, op, c)
            : this.near({ x: op.x!, y: op.y! }, c, op.radius!);
        if (inField) {
          if (op.kind === 'line') this.tabletModifier(c, source, op, tick);
          if (op.kind === 'line') continue;
          c.modifiers ??= {};
          c.modifiers[key] = { expires: tick + 1, slow: 0, armor: op.armor! };
          field.next[c.id] ??= tick + TICK_HZ;
          if (field.next[c.id] <= tick) {
            this.hurt(c, op.damage!, 'physical', source.id, 'dot');
            field.next[c.id] += TICK_HZ;
          }
        } else {
          delete c.modifiers?.[key];
          delete field.next[c.id];
        }
      }
    }
  }

  private inTabletLine(origin: Cell, op: TabletOperation, c: Creep) {
    const dx = op.x! - origin.x,
      dy = op.y! - origin.y;
    const length = Math.sqrt(dx * dx + dy * dy) || 1;
    const along = ((c.x - origin.x) * dx + (c.y - origin.y) * dy) / length;
    return (
      along >= 0 &&
      along <= op.distance! &&
      Math.abs((c.x - origin.x) * dy - (c.y - origin.y) * dx) / length <= op.radius!
    );
  }

  private tabletModifier(c: Creep, source: Gem, op: TabletOperation, tick: number) {
    this.applyEffect(
      c,
      source,
      {
        modifier: op.modifier!,
        duration: op.duration! / TICK_HZ,
        properties: {
          ...(op.slowPct === undefined
            ? {}
            : { MODIFIER_PROPERTY_MOVESPEED_BONUS_PERCENTAGE: op.slowPct }),
          ...(op.mr === undefined
            ? {}
            : { MODIFIER_PROPERTY_MAGICAL_RESISTANCE_DECREPIFY_UNIQUE: op.mr }),
          ...(op.incomingDamagePct === undefined
            ? {}
            : { MODIFIER_PROPERTY_INCOMING_DAMAGE_PERCENTAGE: op.incomingDamagePct }),
        },
        states: [],
        damage: 0,
        interval: 0,
        multiple: false,
        pierces: !!op.magicImmune,
      },
      tick,
    );
  }

  private tabletStun(source: Gem, op: TabletOperation, tick: number) {
    const start = this.creeps.find((c) => c.id === op.target);
    if (!start) return;
    const targets: Creep[] = [];
    let current = start;
    while (current && targets.length < (op.kind === 'targets' ? op.limit! : op.bounces! + 1)) {
      targets.push(current);
      const candidates = this.creeps
        .filter(
          (c) =>
            !targets.includes(c) &&
            (op.kind === 'targets'
              ? this.near({ x: op.x!, y: op.y! }, c, op.radius!)
              : this.near(current, c, op.distance!)),
        )
        .sort(
          (a, b) =>
            sq(a.x - current.x) + sq(a.y - current.y) - sq(b.x - current.x) - sq(b.y - current.y) ||
            a.id - b.id,
        );
      current = candidates[0]!;
    }
    for (const c of targets)
      this.applyEffect(
        c,
        source,
        {
          modifier: op.modifier ?? 'modifier_new_cask',
          duration: op.stun! / TICK_HZ,
          properties: {},
          states: ['MODIFIER_STATE_STUNNED'],
          damage: 0,
          interval: 0,
          multiple: false,
          pierces: !!op.magicImmune,
        },
        tick,
      );
  }

  /** TriggerShiban and chain_frost.lua: one nearby chain-frost tower wins the level roll. */
  private triggerChainFrost(
    tablet: Gem,
    target: number,
    trigger: { radius: number; chance: number },
    tick: number,
  ) {
    let count = 1;
    for (const tower of this.gems
      .filter(
        (g) =>
          this.near(g.cell, tablet.cell, trigger.radius) &&
          this.gemAbilities(g).some((a) => a.kind === 'trait' && a.name === 'tower_chain_frost'),
      )
      .sort((a, b) => a.id - b.id)) {
      if (this.rng.int(1, 100 * count) <= trigger.chance) {
        this.delayed.push({
          due: tick,
          source: tower.id,
          sourceName: tower.name,
          target,
          damage: 12000,
          remaining: 11,
          radius: 1000 / CELL_UNITS,
          visited: [],
          chainFrost: true,
        });
        return;
      }
      count++;
    }
  }

  private attack(g: Gem, tick: number) {
    if (g.cooldown > 0) g.cooldown--;
    const u = this.units[g.name];
    if (u.AttackCapabilities === 'DOTA_UNIT_CAP_NO_ATTACK' || num(u, 'AttackRate') <= 0) return;
    if ((g.disabledUntil ?? 0) > tick) return;
    const protectedTower = this.towerState(g, 'MODIFIER_STATE_MAGIC_IMMUNE');
    if (
      !protectedTower &&
      this.creeps.some(
        (c) =>
          this.enemySkills(c).includes('guai_jiaoxieguanghuan') &&
          this.near(g.cell, c, 150 / CELL_UNITS),
      )
    ) {
      g.disabledUntil = tick + TICK_HZ;
      return;
    }
    const range = this.attackRange(g);
    const dist2 = (c: Creep) => sq(c.x - g.cell.x) + sq(c.y - g.cell.y);
    let target = this.creeps.find(
      (c) => c.id === g.target && dist2(c) <= range * range && this.visible(c),
    );
    if (!target) {
      let best = Infinity;
      for (const c of this.creeps) {
        const d = dist2(c);
        if (d <= range * range && d < best && this.visible(c)) [best, target] = [d, c];
      }
    }
    g.target = target?.id ?? null;
    if (!target) {
      g.cooldown = Math.max(0, g.cooldown);
      return;
    }
    if (g.cooldown > 0) return;
    const bonus = this.gemAbilities(g).reduce(
      (n, a) => n + (a.kind === 'damage' ? a.amount : 0),
      0,
    );
    const lastStand = g.buffs?.gemtd_hero_beishuiyizhan;
    let raw =
      this.rng.int(num(u, 'AttackDamageMin'), num(u, 'AttackDamageMax')) * (1 + bonus / 100) +
      (lastStand && lastStand.expires > tick ? lastStand.values.damage : 0);
    raw *=
      1 +
      (this.towerProperty(g, 'MODIFIER_PROPERTY_DAMAGEOUTGOING_PERCENTAGE') +
        Math.min(100, (g.level ?? 0) * 10)) /
        100;
    for (const a of this.gemAbilities(g))
      if (a.kind === 'critical' && this.roll(a.chance, g, a.name, a.pseudo)) raw *= a.multiplier;
    const crit = g.buffs?.gemtd_hero_baoji;
    if (crit && crit.expires > tick && this.roll(10, g, 'hero_crit', true))
      raw *= crit.values.baoji / 100;
    if (
      !protectedTower &&
      this.enemySkills(target).includes('enemy_bukeqinfan') &&
      this.roll(50, target, 'untouchable', true)
    )
      g.disabledUntil = tick + TICK_HZ;
    const additional = this.gemAbilities(g).find((a) => a.kind === 'split');
    const splitTargets =
      additional?.kind === 'split'
        ? this.creeps
            .filter((c) => c !== target && dist2(c) <= range * range && this.visible(c))
            .sort((a, b) => dist2(a) - dist2(b) || a.id - b.id)
            .slice(0, additional.count)
        : [];
    const landed = this.hurt(target, raw, 'physical', g.id, 'attack');
    const link = g.buffs?.gemtd_hero_lianjie;
    if (landed && link && link.expires > tick) {
      const farthest = this.creeps
        .filter((c) => c !== target && !this.immune(c))
        .sort(
          (a, b) =>
            sq(b.x - target.x) + sq(b.y - target.y) - sq(a.x - target.x) - sq(a.y - target.y) ||
            a.id - b.id,
        )[0];
      if (farthest) {
        const distance =
          Math.sqrt(sq(farthest.x - g.cell.x) + sq(farthest.y - g.cell.y)) * CELL_UNITS;
        this.hurt(
          farthest,
          ((raw * link.values.damage_per) / 100) * (1 + Math.floor(distance / 400) * 0.1),
          'pure',
          g.id,
        );
      }
    }
    // Carry fractional tick debt so fast towers keep their average rate at 30 Hz.
    g.cooldown += Math.max(1, this.attackInterval(g) * TICK_HZ);
    for (const c of splitTargets)
      this.hurt(
        c,
        ((num(u, 'AttackDamageMin') + num(u, 'AttackDamageMax')) / 2) * (1 + bonus / 100),
        'physical',
        g.id,
        'split',
      );
    for (const a of this.gemAbilities(g))
      if (a.kind === 'splash') {
        if (!landed) continue;
        for (const c of [...this.creeps])
          if (sq(c.x - target.x) + sq(c.y - target.y) <= sq(a.radius))
            this.hurt(c, raw * a.amount, 'pure', g.id, 'splash');
      }
    for (const a of this.gemAbilities(g)) {
      if (!landed) break;
      if (a.kind === 'script' && this.roll(a.chance, g, a.name))
        this.scriptEffect(g, target, raw, a.fn, a.args, tick);
      if (a.kind === 'hit-effect' && this.roll(a.chance, g, a.name)) {
        if (a.self) {
          if (a.states.includes('MODIFIER_STATE_DISARMED') && !protectedTower)
            g.disabledUntil = tick + Math.round(a.duration * TICK_HZ);
        } else
          for (const c of this.creeps)
            if (c === target || (a.radius > 0 && this.near(target, c, a.radius)))
              this.applyEffect(c, g, a, tick);
      }
    }
    if (landed && this.creeps.includes(target))
      for (const effect of this.gemAbilities(g)) {
        if (effect.kind !== 'slow' && effect.kind !== 'armor' && effect.kind !== 'poison') continue;
        if (this.immune(target) && effect.kind !== 'armor') continue;
        target.modifiers ??= {};
        const key =
          effect.kind === 'poison' ? `${effect.modifier}:${g.id}:${tick}` : effect.modifier;
        target.modifiers[key] = {
          expires: tick + Math.round(effect.duration * TICK_HZ),
          slow: effect.kind === 'slow' ? effect.amount : 0,
          armor: effect.kind === 'armor' ? effect.amount : 0,
          ...(effect.kind === 'poison'
            ? {
                poison: {
                  damage: effect.amount,
                  next: tick + Math.round(effect.interval * TICK_HZ),
                  interval: Math.round(effect.interval * TICK_HZ),
                  source: g.id,
                },
              }
            : {}),
        };
      }
  }

  private hurt(
    c: Creep,
    raw: number,
    type: 'physical' | 'magical' | 'pure',
    source: number,
    via: HitVia = 'effect',
  ): boolean {
    const attack = via === 'attack';
    if (!this.creeps.includes(c)) return false;
    const attacker = this.gems.find((g) => g.id === source);
    const skills = this.enemySkills(c);
    if (
      attack &&
      skills.includes('guai_shanbi') &&
      !(attacker && this.towerState(attacker, 'MODIFIER_STATE_CANNOT_MISS')) &&
      this.roll(50, c, 'evasion', true)
    )
      return false;
    if (type === 'magical' && this.immune(c)) return true;
    if (c.shield && c.shield.charges > 0 && c.shield.expires > this.time) {
      c.shield.charges--;
      return true;
    }
    const stats = this.creepStats(c);
    const armor = stats.armor;
    const factor =
      type === 'physical'
        ? 1 - (0.06 * armor) / (1 + 0.06 * Math.abs(armor))
        : type === 'magical'
          ? 1 - stats.magicResist / 100
          : 1;
    const incoming = Object.values(c.modifiers ?? {}).reduce(
      (sum, m) => sum + (m.properties?.MODIFIER_PROPERTY_INCOMING_DAMAGE_PERCENTAGE ?? 0),
      0,
    );
    let damage = Math.max(0, raw * factor * (1 + incoming / 100));
    if (type === 'physical' && skills.includes('enemy_wumian')) damage *= 0.25;
    if (type === 'physical' && c.modifiers?.modifier_medusa_stone_gaze_stone) damage *= 2;
    if (type === 'physical' && skills.includes('mars_bulwark') && attacker) {
      const route = c.fly ? this.flyRoute : this.route,
        next = route[Math.min(c.step, route.length - 1)];
      const dx = next.x - c.x,
        dy = next.y - c.y,
        ax = attacker.cell.x - c.x,
        ay = attacker.cell.y - c.y;
      const length = Math.sqrt((dx * dx + dy * dy) * (ax * ax + ay * ay));
      const facing = length ? (dx * ax + dy * ay) / length : -1;
      if (facing >= 0.7071067811865476) damage *= 0.3;
      else if (facing >= 0) damage *= 0.7;
    }
    c.hp -= damage;
    this.events.push({ type: 'attack', from: source, to: c.id, damage, x: c.x, y: c.y, via });
    this.waveDamage[source] = (this.waveDamage[source] ?? 0) + damage;
    if (skills.includes('tidehunter_blubber')) {
      if (!c.cleanse || this.time - c.cleanse.last > 10 * TICK_HZ)
        c.cleanse = { damage: 0, last: this.time };
      c.cleanse.damage += damage;
      c.cleanse.last = this.time;
      if (c.cleanse.damage >= 80000) {
        delete c.modifiers;
        c.cleanse.damage = 0;
      }
    }
    if (c.hp <= 0) this.kill(c, source);
    return true;
  }

  /** OnEntityKilled (line 6480): XP and gold by level band. */
  private kill(c: Creep, source?: number) {
    const l = this.level;
    let reward =
      l % 10 === 0 && l <= 50 ? 300 : l > 10 && l < 50 ? 5 * (Math.floor(l / 10) + 1) : 5;
    if (c.elite) reward *= 10;
    this.xp += reward;
    if (reward >= 100) reward /= 2;
    const killer = this.gems.find((g) => g.id === source);
    if (killer) {
      const fields = this.allyFields(killer);
      if (fields.some((a) => a.modifier === 'modifier_tower_tanlan') && this.rng.int(1, 100) <= 5)
        reward *= 10;
      if (
        fields.some((a) => a.modifier === 'modifier_tower_huichun_aura') &&
        this.rng.int(1, 100) <= 3
      )
        this.castleHp = Math.min(
          this.luaValue<number>('gem_castle_hp_max'),
          this.castleHp + c.damage,
        );
    }
    this.gold += Math.floor(reward);
    this.creeps = this.creeps.filter((x) => x !== c);
    this.events.push({ type: 'kill', id: c.id, gold: Math.floor(reward) });
  }

  step(tick: number) {
    this.time = tick;
    this.events = [];
    this.heroStep(tick);
    this.stoneLineStep(tick);
    if (this.tabletUpgradeIn > 0 && --this.tabletUpgradeIn === 0) {
      for (const g of [...this.gems]) {
        const upgrade = this.combineOptions(g.id).find((p) => p.kind === 'tablet-upgrade');
        if (upgrade) this.applyProgression(upgrade, g.id);
      }
    }
    if (this.phase !== 'wave') return;
    this.waveTicks++;
    if (this.toSpawn > 0 && tick >= this.nextSpawn) {
      this.spawn();
      this.nextSpawn = tick + SPAWN_TICKS;
    }
    this.tabletStep(tick);
    this.refreshFields(tick);
    this.delayedEffects(tick);
    for (const c of [...this.creeps]) {
      for (const [name, m] of Object.entries(c.modifiers ?? {})) {
        if (m.poison && m.poison.next <= tick && m.poison.next <= m.expires) {
          this.hurt(c, m.poison.damage, 'magical', m.poison.source, 'dot');
          m.poison.next += m.poison.interval;
        }
        if (m.expires <= tick) delete c.modifiers![name];
      }
      if (c.modifiers && !Object.keys(c.modifiers).length) delete c.modifiers;
      if (this.creeps.includes(c)) {
        if (this.enemySkills(c).includes('enemy_recharge') && !this.creepStats(c).noHeal)
          c.hp = Math.min(c.maxHp, c.hp + (c.maxHp * 0.003) / TICK_HZ);
        if (tick % 3 === 0) this.enemyThink(c, tick);
        this.move(c);
      }
    }
    for (const g of this.gems) this.attack(g, tick);
    if (tick % SPAWN_TICKS === 0) {
      const castle = this.flyRoute[this.flyRoute.length - 1];
      for (const c of [...this.creeps]) {
        if (sq(c.x - castle.x) + sq(c.y - castle.y) > sq(CASTLE_RADIUS)) continue;
        let damage = c.boss ? Math.ceil((100 * c.hp) / c.maxHp) : c.damage;
        const evasion = this.castleBuffs.evasion,
          guard = this.castleBuffs.guard;
        if (evasion?.expires > tick && this.rng.int(0, 100) < evasion.amount) damage = 0;
        if (guard?.expires > tick) damage = Math.max(0, damage - guard.amount);
        this.castleHp -= damage;
        this.creeps = this.creeps.filter((x) => x !== c);
        this.events.push({ type: 'leak', id: c.id, damage });
      }
    }
    if (this.castleHp <= 0) {
      this.castleHp = 0;
      // Lines 3835 and 7493: falling after wave 50 is a win.
      this.phase = this.level > LAST_LEVEL ? 'won' : 'lost';
    } else if (this.toSpawn <= 0 && this.creeps.length === 0) {
      const mvp =
        this.level > LAST_LEVEL
          ? undefined
          : this.gems
              .filter((g) => (g.level ?? 0) < 10)
              .sort(
                (a, b) =>
                  (this.waveDamage[b.id] ?? 0) - (this.waveDamage[a.id] ?? 0) || a.id - b.id,
              )[0];
      if (mvp && (this.waveDamage[mvp.id] ?? 0) > 0) mvp.level = (mvp.level ?? 0) + 1;
      // EndRoundIfNoEnemyAlive (line 13441)
      for (const g of this.gems) [g.cooldown, g.target] = [0, null];
      this.beacon = null; // start_build removes the beacon (line 4662)
      this.route = this.findRoute() ?? this.route;
      if (this.level >= LAST_LEVEL) {
        // No build phase after 50 (line 4683): the next wave follows after 11 s at 50, else 1.1 s.
        const delay = Math.round((this.level === LAST_LEVEL ? 11 : 1.1) * TICK_HZ);
        this.level++;
        // shortcut: the wave list ends at 50, so the original has no wave 101; end the run there as a win.
        if (!this.luaValue<Record<string, string>>('guai')[this.guaiLevel]) this.phase = 'won';
        else {
          this.startWave();
          this.nextSpawn = tick + delay;
          this.waveTicks = -delay; // the original starts the rage stopwatch when spawning begins
        }
      } else {
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
      tabletUpgradeIn: this.tabletUpgradeIn,
      tabletReady: this.tabletReady,
      tabletCasts: this.tabletCasts,
      tabletFields: this.tabletFields,
      time: this.time,
      waveTicks: this.waveTicks,
      waveDamage: this.waveDamage,
      delayed: this.delayed,
      hero: this.hero,
      heroPosition: this.heroPosition,
      heroRoute: this.heroRoute,
      heroFacing: this.heroFacing,
      beacon: this.beacon,
      stoneLine: this.stoneLine,
      pendingHero: this.pendingHero,
      prayers: this.prayers,
      perfected: this.perfected,
      swapTarget: this.swapTarget,
      castleBuffs: this.castleBuffs,
    };
  }
}

const key = (c: Cell) => c.y * 64 + c.x;
const sq = (v: number) => v * v;
