import { expect, test } from 'vitest';
import { loadData } from '../src/data';
import { Sim } from '../src/sim/sim';

const data = loadData('classic');
const setup = () => {
  const sim = new Sim(data, 17);
  sim.game.gold = 10000;
  return sim;
};
const finish = (sim: Sim) => {
  for (let i = 0; i < 7; i++) sim.step();
};

test('offline hero and arbitrary valid skill levels are replayable and validated atomically', () => {
  const a = setup(),
    b = setup();
  for (const sim of [a, b]) {
    sim.send(0, { type: 'hero-loadout', hero: 'h101', abilities: { a101: 4, a201: 2 } });
    sim.step();
    expect(sim.game.hero.abilities).toEqual({ gemtd_hero_huichun: 4, gemtd_hero_lanse: 2 });
    const before = sim.game.snapshot();
    expect(sim.game.configureHero('h102', { a101: 5 }).ok).toBe(false);
    expect(sim.game.snapshot()).toEqual(before);
    sim.send(0, { type: 'hero-cast', action: 'gemtd_hero_huichun' });
    finish(sim);
  }
  expect(a.stateHash()).toBe(b.stateHash());
  expect(a.game.gold).toBe(9700);
  const gold = a.game.gold;
  a.send(0, { type: 'hero-cast', action: 'gemtd_hero_huichun' });
  a.step();
  expect(a.game.gold).toBe(gold);
});

test('hero healing completes after channel and rewind clears all draft occupancy', () => {
  const sim = setup(),
    g = sim.game;
  g.configureHero('h101', { a101: 1, a306: 4 });
  g.castleHp = 90;
  sim.send(0, { type: 'hero-cast', action: 'gemtd_hero_huichun' });
  sim.step();
  expect(g.castleHp).toBe(90);
  finish(sim);
  expect(g.castleHp).toBeGreaterThan(90);
  const cell = { x: 12, y: 12 };
  expect(g.build(cell).ok).toBe(true);
  expect(g.configureHero('h102', {}).ok).toBe(false);
  sim.send(0, { type: 'hero-cast', action: 'gemtd_hero_huidaoguoqu' });
  finish(sim);
  expect(g.draft).toHaveLength(0);
  expect(g.gemAt(cell)).toBeUndefined();
  expect(g.stoneAt(cell)).toBe(false);
});

test('color and quality prayers coexist, are consumed once, and rejected commands do not spend RNG', () => {
  let success = false;
  for (let seed = 1; seed < 20 && !success; seed++) {
    const sim = new Sim(data, seed),
      g = sim.game;
    g.gold = 10000;
    g.configureHero('h101', { a201: 4, a402: 4 });
    sim.send(0, { type: 'hero-cast', action: 'gemtd_hero_lanse' });
    finish(sim);
    sim.send(0, { type: 'hero-cast', action: 'gemtd_hero_wanmei' });
    finish(sim);
    const state = sim.rng.state,
      gold = g.gold;
    expect(g.castHero('not-an-action', undefined, sim.tick).ok).toBe(false);
    expect(sim.rng.state).toBe(state);
    expect(g.gold).toBe(gold);
    g.build({ x: 12, y: 12 });
    success = g.gems[0].name === 'gemtd_b11111';
    expect(g.snapshot().prayers).toEqual({});
  }
  expect(success).toBe(true);
});

test('tower buffs affect range and interval, and nearby exchange preserves board occupancy', () => {
  const sim = setup(),
    g = sim.game;
  g.configureHero('h101', { a301: 4, a303: 4, a211: 4 });
  const gem = { id: 900, name: 'gemtd_d1', cell: { x: 19, y: 19 }, cooldown: 0, target: null };
  g.gems.push(gem);
  const range = g.attackRange(gem),
    interval = g.attackInterval(gem);
  sim.send(0, { type: 'hero-cast', action: 'gemtd_hero_miaozhun', target: 900 });
  finish(sim);
  expect(g.attackRange(gem)).toBe(range + 1400 / 128);
  sim.send(0, { type: 'hero-cast', action: 'gemtd_hero_kuaisusheji', target: 900 });
  finish(sim);
  expect(g.attackInterval(gem)).toBeLessThan(interval);
  const cell = { x: 20, y: 19 };
  g.stones.set(cell.y * 64 + cell.x, cell);
  sim.send(0, { type: 'hero-cast', action: 'gemtd_hero_qingyi', target: 900 });
  finish(sim);
  expect(gem.cell).toEqual(cell);
  expect(g.stoneAt({ x: 19, y: 19 })).toBe(true);
});

test('hero movement progresses in build phase and movement state contributes to replay hash', () => {
  const sim = setup(),
    g = sim.game;
  g.configureHero('h101', {});
  const before = sim.stateHash();
  expect(g.moveHero({ x: 20, y: 20 }).ok).toBe(true);
  expect(sim.stateHash()).not.toBe(before);
  for (let i = 0; i < 20; i++) sim.step();
  expect(g.heroPosition).toEqual({ x: 20, y: 20 });
});

test('channel prevents conflicting draft edits and cooldown allows casting on its exact expiry', () => {
  const sim = setup(),
    g = sim.game;
  g.configureHero('h101', { a101: 1, a306: 4 });
  for (const x of [12, 14, 16, 18]) g.build({ x, y: 12 });
  sim.send(0, { type: 'hero-cast', action: 'gemtd_hero_huidaoguoqu' });
  sim.step();
  expect(g.build({ x: 20, y: 12 }).ok).toBe(false);
  finish(sim);
  expect(g.draft).toHaveLength(0);
  g.hero.cooldowns.gemtd_hero_huichun = sim.tick;
  expect(g.castHero('gemtd_hero_huichun', undefined, sim.tick).ok).toBe(true);
});

test('two-stage swaps preserve stone count and whirlwind rotates occupied neighbors', () => {
  const sim = setup(),
    g = sim.game;
  g.configureHero('h101', { a401: 4, a308: 4 });
  const a = { x: 18, y: 20 },
    b = { x: 18, y: 19 };
  g.stones.set(a.y * 64 + a.x, a);
  g.stones.set(b.y * 64 + b.x, b);
  const count = g.stones.size;
  sim.send(0, { type: 'hero-cast', action: 'gemtd_hero_yixinghuanwei', target: -(a.y * 64 + a.x) });
  finish(sim);
  while (sim.tick < g.hero.cooldowns.gemtd_hero_yixinghuanwei) sim.step();
  sim.send(0, { type: 'hero-cast', action: 'gemtd_hero_yixinghuanwei', target: -(b.y * 64 + b.x) });
  finish(sim);
  expect(g.stones.size).toBe(count);
  expect(g.stoneAt(a) && g.stoneAt(b)).toBe(true);
  g.stones.delete(a.y * 64 + a.x);
  const gem = { id: 900, name: 'gemtd_d1', cell: a, cooldown: 0, target: null };
  g.gems.push(gem);
  const gold = g.gold;
  sim.send(0, { type: 'hero-cast', action: 'gemtd_hero_xuanfeng', point: { x: 19, y: 19 } });
  finish(sim);
  expect(gem.cell).toEqual(b);
  expect(g.stoneAt(a)).toBe(true);
  expect(g.gold).toBe(gold - 50);
});

test('stone line builds along the hero facing and turns the first normal stone it meets into a gem', () => {
  const sim = setup(),
    g = sim.game;
  expect(g.configureHero('h101', { a212: 1 }).ok).toBe(true);
  const row = [15, 16, 17, 18].map((x) => ({ x, y: 14 }));
  for (const c of row) expect(g.board.kind(c) === 'open' && !g.stoneAt(c)).toBe(true);
  g.heroPosition = { x: 14, y: 14 };
  g.heroFacing = { x: 1, y: 0 };
  g.stones.set(17 + 14 * 64, row[2]);
  sim.send(0, { type: 'hero-cast', action: 'gemtd_hero_shitou' });
  for (let i = 0; i < 60; i++) sim.step();
  expect(g.stoneAt(row[0]) && g.stoneAt(row[1])).toBe(true);
  expect(g.stoneAt(row[2])).toBe(false);
  expect(g.gemAt(row[2])).toBeDefined();
  expect(g.draft).not.toContain(g.gemAt(row[2])!.id);
  expect(g.stoneAt(row[3]) || !!g.gemAt(row[3])).toBe(false);
});

test('beacon reroutes ground creeps through its cell, blocks building there and clears at round end', () => {
  const sim = setup(),
    g = sim.game;
  expect(g.configureHero('h101', { a403: 1 }).ok).toBe(true);
  g.heroPosition = { x: 14, y: 14 };
  expect(g.canHeroAction('gemtd_hero_guangzhudaobiao', undefined, { x: 5, y: 19 }).ok).toBe(false);
  const point = { x: 15, y: 15 };
  expect(g.route).not.toContainEqual(point);
  sim.send(0, { type: 'hero-cast', action: 'gemtd_hero_guangzhudaobiao', point });
  for (let i = 0; i < 8; i++) sim.step();
  expect(g.beacon).toEqual(point);
  const at = g.route.findIndex((c) => c.x === point.x && c.y === point.y);
  const path2 = g.route.findIndex((c) => c.x === 5 && c.y === 19);
  expect(at).toBeGreaterThan(0);
  expect(at).toBeLessThan(path2);
  expect(g.canBuild(point).ok).toBe(false);
  for (let x = 20; g.draft.length < 5; x += 2) g.build({ x, y: 25 });
  sim.send(0, { type: 'keep', id: g.draft[0], upgrade: 0 });
  sim.step();
  expect(g.phase).toBe('wave');
  while (g.phase !== 'build') {
    sim.step();
    g.creeps.length = 0;
  }
  expect(g.beacon).toBeNull();
  expect(g.route).not.toContainEqual(point);
});
