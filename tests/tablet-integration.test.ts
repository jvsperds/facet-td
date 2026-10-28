import { expect, test } from 'vitest';
import { loadData } from '../src/data';
import { Sim } from '../src/sim/sim';
import type { Creep } from '../src/sim/game';

function setup(name: string, seed = 1) {
  const sim = new Sim(loadData('classic'), seed);
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

test('remaining tablet families apply their VPK debuffs and stuns at runtime', () => {
  const youbu = setup('gemtd_youbushiban');
  youbu.creep.skills = ['enemy_momian'];
  youbu.sim.step();
  expect(youbu.game.creepStats(youbu.creep).stopped).toBe(true);

  const cask = setup('gemtd_mabishiban_yin');
  cask.game.creeps.push({ ...cask.creep, id: 3, x: 11, y: 10 });
  cask.sim.step();
  expect(cask.game.creeps.every((c) => cask.game.creepStats(c).stopped)).toBe(true);

  const gale = setup('gemtd_zhangqishiban');
  gale.sim.step();
  expect(
    Object.values(gale.creep.modifiers ?? {}).some(
      (m) => m.properties?.MODIFIER_PROPERTY_MOVESPEED_BONUS_PERCENTAGE === -50,
    ),
  ).toBe(true);

  const konghe = setup('gemtd_kongheshiban');
  konghe.sim.step();
  expect(
    Object.values(konghe.creep.modifiers ?? {}).some(
      (m) => m.properties?.MODIFIER_PROPERTY_INCOMING_DAMAGE_PERCENTAGE === 80,
    ),
  ).toBe(true);

  const xuwu = setup('gemtd_xuwushiban');
  xuwu.sim.step();
  expect(xuwu.game.creepStats(xuwu.creep).magicResist).toBe(-60);
});

test('a nearby chain-frost tower can trigger from a tablet cast and bounces with source values', () => {
  const { sim, game, creep } = setup('gemtd_haojiaoshiban_jin', 2);
  game.gems.push({
    id: 3,
    name: 'gemtd_haibao',
    cell: { x: 11, y: 10 },
    cooldown: 10000,
    target: null,
  });
  expect(game.abilities('gemtd_haibao')).toContainEqual({ kind: 'trait', name: 'tower_chain_frost' });
  sim.rng.int = (min) => min;
  sim.step();
  expect(creep.hp).toBeLessThan(creep.maxHp);
  expect(Object.keys(creep.modifiers ?? {})).toContain('modifier_chain_frost_slow');
});
