import { describe, expect, test } from 'vitest';
import { loadData } from '../src/data';
import { RunConfigError } from '../src/sim/config';
import type { Creep, Game, GameEvent } from '../src/sim/game';
import { TICK_HZ } from '../src/sim/game';
import { Sim } from '../src/sim/sim';

const data = loadData('classic');
type Internals = {
  kill(c: Creep, source?: number): void;
  hurt(c: Creep, raw: number, type: 'pure', source: number): boolean;
  startWave(): void;
};
const internals = (g: Game) => g as unknown as Internals;
let nextId = 1000;
const creep = (g: Game, over: Partial<Creep> = {}): Creep => {
  const c: Creep = {
    id: nextId++,
    name: 'gemtd_kuangbaoyezhu',
    hp: 10,
    maxHp: 10,
    armor: 0,
    speed: 0,
    x: 1,
    y: 1,
    step: 1,
    fly: false,
    boss: false,
    damage: 1,
    ...over,
  };
  g.creeps.push(c);
  return c;
};
const countEvents = (events: GameEvent[]) =>
  events.filter((e): e is Extract<GameEvent, { type: 'enemy-count' }> => e.type === 'enemy-count');

describe('run config', () => {
  test('defaults to the original single-player difficulty with no hero', () => {
    const sim = new Sim(data, 1);
    expect(sim.config).toEqual({ difficulty: 1, hero: null, skills: {} });
    expect(sim.game.heroActions()).toEqual([]);
  });

  test('difficulty indexes gem_difficulty and gem_difficulty_speed', () => {
    const lua = data.files['lua/addon_game_mode.json'] as Record<
      string,
      { value: Record<string, number> }
    >;
    const first = (difficulty: 1 | 2 | 3 | 4) => {
      const sim = new Sim(data, 5, { difficulty });
      const g = sim.game;
      for (let x = 12; g.draft.length < 5; x += 2) g.build({ x, y: 12 });
      sim.send(0, { type: 'keep', id: g.draft[0], upgrade: 0 });
      while (!g.creeps.length) sim.step();
      return g.creeps[0];
    };
    const a = first(1),
      d = first(4);
    const units = (
      data.files['npc/units.json'] as { DOTAUnits: Record<string, Record<string, string>> }
    ).DOTAUnits;
    expect(a.elite || d.elite).toBe(false);
    for (const [c, i] of [
      [a, 1],
      [d, 4],
    ] as const) {
      const u = units[c.name];
      expect(c.maxHp).toBe(Math.floor(Number(u.StatusHealth) * lua.gem_difficulty.value[i]));
    }
    expect(d.speed / a.speed).toBeCloseTo(
      lua.gem_difficulty_speed.value[4] / lua.gem_difficulty_speed.value[1],
      6,
    );
    expect(new Sim(data, 5, { difficulty: 2 }).stateHash()).not.toBe(new Sim(data, 5).stateHash());
  });

  test('the loadout comes from the config and is fixed; sandbox keeps it free', () => {
    const sim = new Sim(data, 1, { hero: 'h101', skills: { a101: 2, a201: 4 } });
    expect(sim.game.hero.abilities).toEqual({ gemtd_hero_huichun: 2, gemtd_hero_lanse: 4 });
    sim.send(0, { type: 'hero-loadout', hero: 'h102', abilities: { a102: 4 } });
    sim.step();
    expect(sim.game.hero.selected).toBe('h101');
    expect(sim.game.configureHero('h102', {}).ok).toBe(false);
    const sandbox = new Sim(data, 1, { sandbox: true });
    sandbox.send(0, { type: 'hero-loadout', hero: 'h102', abilities: { a102: 4 } });
    sandbox.step();
    expect(sandbox.game.hero.selected).toBe('h102');
  });

  test('invalid configs fail clearly', () => {
    const bad = (config: object) => () => new Sim(data, 1, config);
    expect(bad({ difficulty: 5 })).toThrow(RunConfigError);
    expect(bad({ hero: 'h999' })).toThrow(/Unknown hero/);
    expect(bad({ hero: 'h101', skills: { a999: 1 } })).toThrow(/Unknown hero skill/);
    expect(bad({ hero: 'h101', skills: { a101: 5 } })).toThrow(/level must be 1\.\.4/);
    expect(bad({ hero: 'h101', skills: { a101: 0 } })).toThrow(RunConfigError);
    expect(bad({ hero: 'h101', skills: { a101: 1, a102: 1, a103: 1, a201: 1, a202: 1 } })).toThrow(
      /At most 4/,
    );
    expect(bad({ skills: { a101: 1 } })).toThrow(/need a hero/);
    expect(bad({ hero: 'h101', skills: { a101: 1, gemtd_hero_huichun: 2 } })).toThrow(/twice/);
  });
});

describe('win streak and enemy count (WinStreakAdjust)', () => {
  test('starts at 10 and 0; kills add 0.75 / elite 1.5 / boss 10', () => {
    const g = new Sim(data, 1).game;
    expect([g.waveEnemyCount, g.winStreak]).toEqual([10, 0]);
    internals(g).kill(creep(g));
    expect(g.winStreak).toBe(0.75);
    internals(g).kill(creep(g, { elite: true }));
    expect(g.winStreak).toBe(2.25);
    internals(g).kill(creep(g, { name: 'gemtd_buquzhanquan_boss', boss: true }));
    expect(g.winStreak).toBe(12.25);
  });

  test('50 streak raises the count by one per call, with an event; OnThink repeats it each second', () => {
    const sim = new Sim(data, 1),
      g = sim.game;
    g.winStreak = 120;
    internals(g).kill(creep(g));
    expect(g.waveEnemyCount).toBe(11);
    expect(g.winStreak).toBe(70.75);
    expect(countEvents(g.events)).toEqual([{ type: 'enemy-count', count: 11, delta: 1 }]);
    sim.step(); // tick 0: OnThink
    expect(g.waveEnemyCount).toBe(12);
    for (let i = 0; i < TICK_HZ; i++) sim.step();
    expect(g.waveEnemyCount).toBe(12);
    expect(g.stats.maxWaveEnemyCount).toBe(12);
  });

  test('a leak costs 3 streak per castle HP; the count never drops below 5', () => {
    const sim = new Sim(data, 1),
      g = sim.game;
    g.waveEnemyCount = 5;
    g.phase = 'wave';
    const castle = g.flyRoute.at(-1)!;
    creep(g, { x: castle.x, y: castle.y, damage: 7, step: g.flyRoute.length, fly: true });
    sim.step();
    expect(g.castleHp).toBe(93);
    expect(g.winStreak).toBe(-21);
    g.winStreak = -60;
    sim.step(); // no OnThink on tick 1
    for (let i = 1; i < TICK_HZ; i++) sim.step();
    expect(g.waveEnemyCount).toBe(5);
    expect(g.winStreak).toBe(-10);
    expect(g.stats.leaks).toBe(1);
    expect(g.stats.castleDamageTaken).toBe(7);
  });

  test('path checkpoints cost damage x path_xishu_table, only in order, never at the castle', () => {
    const sim = new Sim(data, 1),
      g = sim.game;
    g.phase = 'wave';
    g.gold = 1000;
    const route = g.flyRoute; // route[i - 1] is path_i
    const arrive = (c: Creep, i: number) => {
      c.x = route[i - 1].x - 0.005;
      c.y = route[i - 1].y;
      c.step = i - 1;
      sim.step();
    };
    // Spawned without counting path2, a creep first seen at path3 never counts a point.
    const late = creep(g, { fly: true, damage: 10, speed: 0.01, skills: ['enemy_thief'] });
    arrive(late, 3);
    arrive(late, 4);
    expect([g.winStreak, g.gold]).toEqual([0, 1000]);
    g.creeps.length = 0;
    const walker = creep(g, { fly: true, damage: 10, speed: 0.01, skills: ['enemy_thief'] });
    let gold = g.gold;
    for (const [i, streak] of [
      [2, 0],
      [3, -0.5],
      [4, -1.5],
      [5, -3.5],
      [6, -7.5],
    ] as const) {
      arrive(walker, i);
      expect(g.winStreak).toBeCloseTo(streak, 9);
      expect(g.gold).toBe((gold = Math.floor(gold * 0.99)));
    }
    arrive(walker, 7);
    expect(g.gold).toBe(gold);
    expect(g.stats.goldStolen).toBe(1000 - gold);
  });
});

describe('rules checked against the original script', () => {
  test('kill gold and XP bands (OnEntityKilled, line 6488)', () => {
    const g = new Sim(data, 1).game;
    const reward = (level: number, over: Partial<Creep> = {}) => {
      g.level = level;
      const [gold, xp] = [g.gold, g.xp];
      internals(g).kill(creep(g, over));
      return [g.gold - gold, g.xp - xp];
    };
    expect(reward(1)).toEqual([5, 5]);
    expect(reward(9)).toEqual([5, 5]);
    expect(reward(10)).toEqual([150, 300]);
    expect(reward(11)).toEqual([10, 10]);
    expect(reward(25)).toEqual([15, 15]);
    expect(reward(35)).toEqual([20, 20]);
    expect(reward(49)).toEqual([25, 25]);
    expect(reward(50)).toEqual([150, 300]);
    expect(reward(60)).toEqual([5, 5]);
    expect(reward(75)).toEqual([5, 5]);
    expect(reward(3, { elite: true })).toEqual([50, 50]);
    expect(reward(15, { elite: true })).toEqual([50, 100]);
  });

  test('kill score: 1 per creep, 2 per elite, 10 per boss, +3/+5 for rare bosses (extra_kill)', () => {
    const g = new Sim(data, 1).game;
    internals(g).kill(creep(g));
    internals(g).kill(creep(g, { elite: true }));
    internals(g).kill(creep(g, { name: 'gemtd_buquzhanquan_boss', boss: true }));
    internals(g).kill(creep(g, { name: 'gemtd_zard_boss_fly', boss: true }));
    internals(g).kill(creep(g, { name: 'gemtd_roushan_boss_fly_jin', boss: true }));
    expect(g.stats.kills).toBe(5);
    expect(g.stats.killScore).toBe(1 + 2 + 10 + 13 + 15);
    expect(g.stats.extraKills).toBe(1 + 3 + 5);
    expect(g.stats.killsByUnit.gemtd_zard_boss_fly).toBe(1);
  });

  test('a boss hits the castle for its remaining HP percentage, rounded up', () => {
    const sim = new Sim(data, 1),
      g = sim.game;
    g.phase = 'wave';
    const castle = g.flyRoute.at(-1)!;
    creep(g, {
      boss: true,
      hp: 301,
      maxHp: 1000,
      damage: 100,
      x: castle.x,
      y: castle.y,
      step: 7,
      fly: true,
    });
    sim.step();
    expect(g.castleHp).toBe(100 - 31);
  });

  test('rare boss swaps at 20/30/40/50 are rolled once and replayed by the endless waves', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed < 80; seed++) {
      const sim = new Sim(data, seed),
        g = sim.game;
      g.level = 50;
      internals(g).startWave();
      seen.add(g.wavePreview.names[0]);
      const name = g.wavePreview.names[0];
      g.level = 100;
      internals(g).startWave();
      expect(g.wavePreview.names[0]).toBe(name);
    }
    expect(seen).toEqual(
      new Set([
        'gemtd_roushan_boss_fly',
        'gemtd_roushan_boss_fly_jin',
        'gemtd_roushan_boss_fly_bojin',
      ]),
    );
  });

  test('MVP: one level for the top damage tower through wave 50, never past MVP 10, none after 50', () => {
    const sim = new Sim(data, 2),
      g = sim.game;
    for (let x = 12; g.draft.length < 5; x += 2) g.build({ x, y: 12 });
    const a = g.draft[0];
    sim.send(0, { type: 'keep', id: a, upgrade: 0 });
    sim.step();
    const tower = g.gems.find((x) => x.id === a)!;
    while (g.phase === 'wave') {
      for (const c of [...g.creeps]) internals(g).hurt(c, 1e12, 'pure', a);
      sim.step();
    }
    expect(tower.level).toBe(1);
    expect(g.stats.mvpAwards).toBe(1);
    // An MVP-10 tower is skipped even when it did the most damage.
    tower.level = 10;
    g.level = 49;
    for (let x = 12; g.draft.length < 5; x += 2) g.build({ x, y: 30 - (x % 4) });
    const b = g.draft[0];
    sim.send(0, { type: 'keep', id: b, upgrade: 0 });
    sim.step();
    while (g.level === 49) {
      for (const c of [...g.creeps]) {
        internals(g).hurt(c, 1, 'pure', b);
        internals(g).hurt(c, 1e12, 'pure', a);
      }
      sim.step();
    }
    expect(tower.level).toBe(10);
    expect(g.gems.find((x) => x.id === b)!.level).toBe(1);
    expect(g.stats.mvpMaxTowers).toBe(1);
    // Past wave 50 no MVP is awarded.
    expect(g.level).toBe(50);
    for (let x = 12; g.draft.length < 5; x += 2) g.build({ x, y: 34 - (x % 4) });
    sim.send(0, { type: 'keep', id: g.draft[0], upgrade: 0 });
    sim.step();
    const clearLevel = (level: number) => {
      while (g.level === level) {
        for (const c of [...g.creeps]) internals(g).hurt(c, 1e12, 'pure', b);
        sim.step();
      }
    };
    clearLevel(50);
    expect(g.gems.find((x) => x.id === b)!.level).toBe(2);
    clearLevel(51);
    expect(g.level).toBe(52);
    expect(g.gems.find((x) => x.id === b)!.level).toBe(2);
    expect(g.stats.mvpAwards).toBe(3);
  });

  test('rage starts after 181 s of a wave (kuangbao_time 180 for one player)', () => {
    const sim = new Sim(data, 1),
      g = sim.game;
    for (let x = 12; g.draft.length < 5; x += 2) g.build({ x, y: 12 });
    sim.send(0, { type: 'keep', id: g.draft[0], upgrade: 0 });
    sim.step();
    for (let i = 0; i < 180 * TICK_HZ; i++) {
      g.creeps.length = 0;
      creep(g, { x: 1, y: 1 });
      sim.step();
    }
    expect(g.enraged).toBe(false);
    for (let i = 0; i < 2 * TICK_HZ; i++) sim.step();
    expect(g.enraged).toBe(true);
  });

  test('the run ends as a win when level 101 starts', () => {
    const sim = new Sim(data, 3),
      g = sim.game;
    g.level = 100;
    internals(g).startWave();
    while (g.phase === 'wave') {
      sim.step();
      g.creeps.length = 0;
    }
    expect(g.phase).toBe('won');
    expect(g.level).toBe(101);
    expect(g.stats.result).toBe('won');
    expect(g.stats.castleHpEnd).toBe(100);
  });
});

describe('run statistics', () => {
  test('a played round fills the stats and stops counting when the run ends', () => {
    const sim = new Sim(data, 7),
      g = sim.game;
    for (let x = 12; g.draft.length < 5; x += 2) g.build({ x, y: 12 });
    const kept = g.gems.find((x) => x.id === g.draft[0])!;
    sim.send(0, { type: 'keep', id: kept.id, upgrade: 0 });
    while (g.level === 1) sim.step();
    const s = g.stats;
    expect(s.wavesCleared).toBe(1);
    expect(s.kept).toEqual({ [kept.name]: 1 });
    expect(s.kills + s.leaks).toBe(10);
    expect(s.goldEarned).toBe(g.gold);
    expect(s.killsByUnit.gemtd_kuangbaoyezhu ?? 0).toBe(s.kills);
    if (s.kills) expect(s.damageByTower[kept.id].damage).toBeGreaterThan(0);
    expect(s.ticks).toBe(sim.tick);
    g.castleHp = 0;
    g.phase = 'wave';
    sim.step();
    const ticks = g.stats.ticks;
    sim.step();
    expect(g.stats).toMatchObject({ result: 'lost', castleHpEnd: 0, ticks });
  });

  test('hero casts and their gold are counted', () => {
    const sim = new Sim(data, 1, { hero: 'h101', skills: { a102: 1 } }),
      g = sim.game;
    g.gold = 1000;
    sim.send(0, { type: 'hero-cast', action: 'gemtd_hero_shanbi' });
    sim.step();
    expect(g.stats.heroCasts).toEqual({ gemtd_hero_shanbi: 1 });
    expect(g.stats.goldSpent).toBe(1000 - g.gold);
    expect(g.stats.goldSpent).toBeGreaterThan(0);
  });
});
