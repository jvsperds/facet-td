import { expect, test } from 'vitest';
import { loadData } from '../src/data';
import { Sim } from '../src/sim/sim';
import { procCoefficient } from '../src/sim/probability';

const data = loadData('classic');
function battle(name: string, skills: string[] = []) {
  const sim = new Sim(data, 1),
    g = sim.game;
  g.phase = 'wave';
  g.stones.clear();
  g.route = [
    { x: 10, y: 20 },
    { x: 30, y: 20 },
  ];
  g.gems.push({ id: 1, name, cell: { x: 10, y: 19 }, cooldown: 0, target: null });
  g.creeps.push({
    id: 100,
    name: 'test',
    hp: 1e8,
    maxHp: 1e8,
    armor: 0,
    speed: 0,
    x: 10,
    y: 20,
    step: 1,
    fly: false,
    boss: false,
    damage: 1,
    skills,
  });
  return sim;
}

test('all combined-tower skills are represented with finite VPK effect values', () => {
  const g = new Sim(data, 1).game;
  const units = (
    data.files['npc/units.json'] as { DOTAUnits: Record<string, Record<string, string>> }
  ).DOTAUnits;
  const lua = data.files['lua/addon_game_mode.json'] as Record<
    string,
    { value: Record<string, string[]> }
  >;
  for (const name of Object.keys(lua.gemtd_merge.value)) {
    const declared = Object.entries(units[name])
      .filter(([k, v]) => /^Ability\d+$/.test(k) && v.startsWith('tower_'))
      .map(([, v]) => v);
    for (const skill of declared)
      expect(
        g.abilities(name).some((a) => a.name === skill),
        `${name}: ${skill}`,
      ).toBe(true);
    for (const a of g.abilities(name))
      if (a.kind === 'field' || a.kind === 'hit-effect') {
        for (const value of Object.values(a.properties)) expect(Number.isFinite(value)).toBe(true);
        expect(Number.isFinite(a.duration)).toBe(true);
      }
  }
});

test('burn auras tick independently and do not damage magic-immune creeps', () => {
  const sim = battle('gemtd_xingcaihongbaoshi'),
    g = sim.game,
    c = g.creeps[0];
  const burn = g.abilities(g.gems[0].name).find((a) => a.kind === 'field' && a.damage > 0);
  expect(burn).toBeDefined();
  g.gems[0].cooldown = 10000;
  const hp = c.hp;
  for (let i = 0; i < 31; i++) sim.step();
  expect(c.hp).toBeLessThan(hp);
  const immune = battle('gemtd_xingcaihongbaoshi', ['enemy_momian']);
  immune.game.gems[0].cooldown = 10000;
  for (let i = 0; i < 31; i++) immune.step();
  expect(immune.game.creeps[0].hp).toBe(1e8);
});

test('magic immunity rejects poison and slow but armor reduction still lands', () => {
  for (const name of ['gemtd_g1', 'gemtd_b1', 'gemtd_p1']) {
    const sim = battle(name, ['enemy_momian']);
    sim.step();
    const c = sim.game.creeps[0];
    if (name === 'gemtd_p1') expect(sim.game.creepStats(c).armor).toBe(-2);
    else expect(c.modifiers).toBeUndefined();
  }
});

test('invisible targets require Opal detection; disarm aura stops nearby unprotected towers', () => {
  const sim = battle('gemtd_d1', ['riki_permanent_invisibility']);
  sim.step();
  expect(sim.game.events.some((e) => e.type === 'attack')).toBe(false);
  sim.game.gems.push({
    id: 2,
    name: 'gemtd_e1',
    cell: { x: 11, y: 19 },
    cooldown: 0,
    target: null,
  });
  sim.step();
  expect(sim.game.events.some((e) => e.type === 'attack')).toBe(true);
  const disarm = battle('gemtd_d1', ['guai_jiaoxieguanghuan']);
  disarm.step();
  expect(disarm.game.events.some((e) => e.type === 'attack')).toBe(false);
  expect(disarm.game.gems[0].disabledUntil).toBe(30);
});

test('boss leak damage follows remaining health and PRD probabilities have the expected distribution', () => {
  const sim = battle('gemtd_d1'),
    g = sim.game,
    c = g.creeps[0];
  g.gems = [];
  const exit = g.flyRoute.at(-1)!;
  c.boss = true;
  c.hp = c.maxHp * 0.25;
  c.x = exit.x;
  c.y = exit.y;
  sim.step();
  expect(g.castleHp).toBe(75);
  expect(procCoefficient(10)).toBeCloseTo(0.01474584478, 8);
  expect(procCoefficient(50)).toBeCloseTo(0.30210302535, 8);
});
