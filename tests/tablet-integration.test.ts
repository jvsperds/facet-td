import { expect, test } from 'vitest';
import { loadData } from '../src/data';
import { Sim } from '../src/sim/sim';
import type { Creep } from '../src/sim/game';

function setup(name: string) {
  const sim = new Sim(loadData('classic'), 1);
  const game = sim.game;
  game.phase = 'wave';
  game.gems = [{ id: 1, name, cell: { x: 10, y: 10 }, cooldown: 0, target: null }];
  const creep: Creep = {
    id: 2,
    name: 'test',
    hp: 10000,
    maxHp: 10000,
    armor: 0,
    speed: 0,
    x: 10,
    y: 10,
    step: 1,
    fly: false,
    boss: false,
    damage: 1,
    skills: [],
  };
  game.creeps = [creep];
  return { sim, game, creep };
}

test('torrent resolves at the cast position after its delay and observes cooldown', () => {
  const { sim, game, creep } = setup('gemtd_hongliushiban');
  sim.step();
  creep.x = 20;
  for (let i = 0; i < 50; i++) sim.step();
  expect(creep.hp).toBe(10000);
  expect(game.snapshot().tabletCasts).toHaveLength(0);
  creep.x = 10;
  for (let i = 0; i < 100; i++) sim.step();
  expect(creep.hp).toBe(10000);
});

test('acid applies armor on entry and removes it on exit', () => {
  const { sim, creep } = setup('gemtd_suanwushiban');
  sim.step();
  expect(Object.keys(creep.modifiers ?? {}).some((k) => k.startsWith('modifier_acid_spray'))).toBe(
    true,
  );
  creep.x = 30;
  sim.step();
  expect(Object.keys(creep.modifiers ?? {}).some((k) => k.startsWith('modifier_acid_spray'))).toBe(
    false,
  );
});
