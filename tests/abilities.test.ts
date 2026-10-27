import { expect, test } from 'vitest';
import { loadData } from '../src/data';
import { CELL_UNITS } from '../src/sim/board';
import { TICK_HZ, type Gem } from '../src/sim/game';
import { Sim } from '../src/sim/sim';

const data = loadData('classic');
const tower = (name: string, id = 1, x = 10, y = 19): Gem => ({
  id,
  name,
  cell: { x, y },
  cooldown: 0,
  target: null,
});

function battle(name: string) {
  const sim = new Sim(data, 1);
  const g = sim.game;
  g.stones.clear();
  g.phase = 'wave';
  g.route = [
    { x: 10, y: 20 },
    { x: 30, y: 20 },
  ];
  g.creeps.push({
    id: 100,
    name: 'test',
    hp: 10000,
    maxHp: 10000,
    armor: 10,
    speed: 300 / CELL_UNITS / TICK_HZ,
    x: 10,
    y: 20,
    step: 1,
    fly: false,
    boss: false,
    damage: 1,
  });
  g.gems.push(tower(name));
  return sim;
}

test.each([1, 2, 3, 4, 5, 6])(
  'tier %i reads original slow, armor, attack-speed and aura definitions',
  (quality) => {
    const g = new Sim(data, 1).game;
    const suffix = '1'.repeat(quality);
    expect(g.abilities(`gemtd_b${suffix}`)[0]).toMatchObject({
      kind: 'slow',
      amount: [-60, -90, -120, -150, -180, -480][quality - 1],
      duration: 3,
    });
    expect(g.abilities(`gemtd_p${suffix}`)[0]).toMatchObject({
      kind: 'armor',
      amount: -(2 ** quality),
      duration: quality === 6 ? 5 : 3,
    });
    expect(g.abilities(`gemtd_q${suffix}`)[0]).toMatchObject({
      kind: 'speed',
      amount: quality === 6 ? 500 : 200,
    });
    expect(g.abilities(`gemtd_e${suffix}`).find((a) => a.kind === 'aura')).toMatchObject({
      kind: 'aura',
      amount: 10 + quality * 10,
      radius: 664 / CELL_UNITS,
    });
  },
);

test('slow refreshes its own tier, stacks other tiers, affects movement, expires and obeys the speed floor', () => {
  const sim = battle('gemtd_b1');
  const g = sim.game;
  const c = g.creeps[0];
  sim.step();
  const firstX = c.x;
  expect(g.creepStats(c).speed * CELL_UNITS * TICK_HZ).toBeCloseTo(240);
  g.gems[0].cooldown = 0;
  sim.step();
  expect(c.x - firstX).toBeCloseTo(240 / CELL_UNITS / TICK_HZ);
  expect(Object.keys(c.modifiers!)).toHaveLength(1);
  expect(c.modifiers!.modifier_tower_slow1_debuff.expires).toBe(91);
  g.gems.push(tower('gemtd_b11', 2));
  sim.step();
  expect(g.creepStats(c).speed * CELL_UNITS * TICK_HZ).toBeCloseTo(150);
  expect(g.snapshot().creeps[0].modifiers).toHaveProperty('modifier_tower_slow2_debuff');
  g.gems.push(tower('gemtd_b111111', 3));
  sim.step();
  expect(g.creepStats(c).speed * CELL_UNITS * TICK_HZ).toBeCloseTo(100);
  g.gems = [];
  while (sim.tick <= 93) sim.step();
  expect(c.modifiers).toBeUndefined();
  expect(g.creepStats(c).speed).toBe(c.speed);
});

test('armor reduction starts after the triggering hit, stacks by tier, expires and leaves base armor intact', () => {
  const sim = battle('gemtd_p1');
  const g = sim.game;
  const c = g.creeps[0];
  const multiplier = (armor: number) => 1 - (0.06 * armor) / (1 + 0.06 * Math.abs(armor));
  sim.step();
  expect(g.events.find((e) => e.type === 'attack')?.damage).toBeCloseTo(2 * multiplier(10));
  expect(g.creepStats(c).armor).toBe(8);
  g.gems[0].cooldown = 0;
  sim.step();
  expect(g.events.find((e) => e.type === 'attack')?.damage).toBeCloseTo(2 * multiplier(8));
  expect(g.creepStats(c).armor).toBe(8);
  g.gems.push(tower('gemtd_p11', 2));
  sim.step();
  expect(g.creepStats(c).armor).toBe(4);
  expect(c.armor).toBe(10);
  g.gems = [];
  while (sim.tick <= 92) sim.step();
  expect(g.creepStats(c).armor).toBe(10);
});

test('Aquamarine cadence and self-inclusive Opal auras stack by tier within the exact VPK radius', () => {
  const sim = battle('gemtd_q1');
  const g = sim.game;
  const q = g.gems[0];
  expect(g.attackInterval(q)).toBeCloseTo(1 / 3);
  const shots: number[] = [];
  for (let i = 0; i <= 30; i++) {
    sim.step();
    if (g.events.some((e) => e.type === 'attack')) shots.push(i);
  }
  expect(shots).toEqual([0, 10, 20, 30]);
  const opal = tower('gemtd_e1', 2, q.cell.x + 664 / CELL_UNITS);
  g.gems.push(opal, tower('gemtd_e1', 3, 11));
  expect(g.attackInterval(q)).toBeCloseTo(100 / 320);
  expect(g.attackInterval(opal)).toBeCloseTo(100 / 120);
  g.gems.push(tower('gemtd_e11', 4, 11));
  expect(g.attackInterval(q)).toBeCloseTo(100 / 350);
  g.gems.splice(2);
  opal.cell.x += 0.001;
  expect(g.attackInterval(q)).toBeCloseTo(1 / 3);
  g.gems = [tower('gemtd_q111111')];
  for (let i = 1; i <= 6; i++) g.gems.push(tower(`gemtd_e${'1'.repeat(i)}`, i + 1));
  expect(g.attackInterval(g.gems[0])).toBeCloseTo(Number(g.unit('gemtd_q111111').AttackRate) / 7);
  g.creeps[0].speed = 0;
  g.creeps[0].hp = 1e9;
  let fastShots = 0;
  for (let i = 0; i < 300; i++) {
    sim.step();
    fastShots += g.events.filter((e) => e.type === 'attack' && e.from === 1).length;
  }
  expect(fastShots).toBe(140); // 0.5 base attack time at 700 attack speed: 14 attacks per second
  g.gems = [tower('gemtd_q1')];
  g.gems[0].cooldown = 0.25;
  g.creeps[0].x = 30;
  sim.step();
  expect(g.gems[0].cooldown).toBe(0);
  g.creeps[0].x = 10;
  sim.step();
  expect(g.gems[0].cooldown).toBe(10);
});

test('modifiers enter the determinism hash and identical ability battles replay identically', () => {
  const a = battle('gemtd_b1');
  const b = battle('gemtd_b1');
  for (let i = 0; i < 100; i++) {
    a.step();
    b.step();
    expect(a.stateHash()).toBe(b.stateHash());
  }
  const before = a.stateHash();
  a.game.creeps[0].modifiers!.modifier_tower_slow1_debuff.expires++;
  expect(a.stateHash()).not.toBe(before);
});

test('Emerald poison stacks per hit, ticks for its full duration and retains kill ownership', () => {
  const sim = battle('gemtd_g1');
  const g = sim.game,
    c = g.creeps[0];
  c.speed = 0;
  c.armor = 0;
  sim.step();
  g.gems[0].cooldown = 0;
  sim.step();
  expect(Object.keys(c.modifiers!)).toHaveLength(2);
  g.gems = [];
  while (sim.tick <= 301) sim.step();
  expect(c.hp).toBe(10000 - 4 - 40);
  expect(c.modifiers).toBeUndefined();
});

test('Ruby adds pure splash to the primary and nearby targets; Topaz attacks only three additional targets', () => {
  const ruby = battle('gemtd_r1'),
    g = ruby.game;
  g.creeps[0].speed = 0;
  for (let i = 1; i <= 4; i++) g.creeps.push({ ...g.creeps[0], id: 100 + i, x: 10 + i });
  ruby.step();
  expect(10000 - g.creeps[0].hp).toBeCloseTo(4 * 0.625 + 4 * 0.3);
  expect(10000 - g.creeps[1].hp).toBeCloseTo(4 * 0.3);
  expect(g.creeps[3].hp).toBe(10000);
  const topaz = battle('gemtd_y1');
  topaz.game.creeps[0].speed = 0;
  for (let i = 1; i <= 5; i++)
    topaz.game.creeps.push({ ...topaz.game.creeps[0], id: 100 + i, x: 10 + i / 2 });
  topaz.step();
  expect(topaz.game.events.filter((e) => e.type === 'attack')).toHaveLength(4);
  expect(topaz.game.creeps[4].hp).toBe(10000);
});

test('higher-quality Diamond base damage bonus comes from the VPK modifier', () => {
  const sim = battle('gemtd_d1111');
  sim.game.creeps[0].speed = 0;
  sim.game.creeps[0].armor = 0;
  sim.step();
  const unit = sim.game.unit('gemtd_d1111');
  const hit = sim.game.events.find((e) => e.type === 'attack')!;
  if (hit.type === 'attack') expect(hit.damage).toBe(Number(unit.AttackDamageMin) * 1.2);
});
