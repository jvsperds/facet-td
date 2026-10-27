import { expect, test } from 'vitest';
import { loadData } from '../src/data';
import {
  adjustDraftOdds,
  listHeroActions,
  planHeroAction,
  readHeroCatalog,
  type HeroContext,
  type HeroState,
} from '../src/sim/hero';

const data = loadData('classic');
const state: HeroState = {
  selected: 'h101',
  abilities: {
    gemtd_hero_huichun: 1,
    gemtd_hero_lanse: 4,
    gemtd_hero_huidaoguoqu: 2,
    gemtd_hero_shanbi: 1,
    gemtd_hero_kuaisusheji: 2,
  },
  cooldowns: {},
};
const context: HeroContext = {
  gold: 1000,
  phase: 'build',
  buildReady: false,
  castleHp: 95,
  castleMaxHp: 100,
};

test('catalog and supplied skills remain independent of service ownership', () => {
  expect(readHeroCatalog(data).heroes.h101).toBeTruthy();
  expect(readHeroCatalog(data).ownership).toBe('offline-free');
  expect(listHeroActions(data, state)).toHaveLength(5);
});

test('healing costs 300, uses inclusive roll, caps HP and sets ten-second cooldown', () => {
  const before = JSON.stringify({ state, context });
  expect(planHeroAction(data, state, 'gemtd_hero_huichun', context, 10, 10)).toEqual({
    ok: true,
    cost: 300,
    cooldownUntil: 310,
    effect: { kind: 'heal', amount: 5 },
  });
  expect(planHeroAction(data, state, 'gemtd_hero_huichun', context, 10, 11)).toEqual({
    ok: false,
    reason: 'roll',
  });
  expect(
    planHeroAction(data, state, 'gemtd_hero_huichun', { ...context, gold: 299 }, 10, 1),
  ).toEqual({ ok: false, reason: 'gold' });
  expect(
    planHeroAction(
      data,
      { ...state, cooldowns: { gemtd_hero_huichun: 11 } },
      'gemtd_hero_huichun',
      context,
      10,
      1,
    ),
  ).toEqual({ ok: false, reason: 'cooldown' });
  expect(JSON.stringify({ state, context })).toBe(before);
});

test('prayer uses strict original roll boundary and rewind requires unfinished build', () => {
  expect(planHeroAction(data, state, 'gemtd_hero_lanse', context, 0)).toEqual({
    ok: true,
    cost: 200,
    cooldownUntil: 90,
    effect: { kind: 'prayer', color: 1, chance: 70 },
  });
  expect(adjustDraftOdds({ color: 2, quality: '1' }, { color: 1, chance: 70 }, 69).color).toBe(1);
  expect(adjustDraftOdds({ color: 2, quality: '1' }, { color: 1, chance: 70 }, 70).color).toBe(2);
  expect(planHeroAction(data, state, 'gemtd_hero_huidaoguoqu', context, 0)).toMatchObject({
    ok: true,
    cost: 500,
  });
  expect(
    planHeroAction(data, state, 'gemtd_hero_huidaoguoqu', { ...context, buildReady: true }, 0),
  ).toEqual({ ok: false, reason: 'phase' });
});

test('castle and tower buffs read original values and validate targets', () => {
  expect(planHeroAction(data, state, 'gemtd_hero_shanbi', context, 0)).toMatchObject({
    cost: 150,
    effect: { amount: 10, duration: 1800 },
  });
  expect(planHeroAction(data, state, 'gemtd_hero_kuaisusheji', context, 0)).toEqual({
    ok: false,
    reason: 'target',
  });
  expect(
    planHeroAction(
      data,
      state,
      'gemtd_hero_kuaisusheji',
      { ...context, target: { id: 7, attackDamage: 1, friendly: true } },
      0,
    ),
  ).toMatchObject({
    cost: 200,
    effect: { target: 7, duration: 2700, values: { attack_speed: 80 } },
  });
});

test('board skills expose source parameters and enforce targets', () => {
  const abilities = Object.fromEntries(
    [
      'yixinghuanwei',
      'qingyi',
      'shitou',
      'xuanfeng',
      'guangzhudaobiao',
      'beishuiyizhan',
      'fengbaozhichui',
    ].map((k) => [`gemtd_hero_${k}`, 1]),
  );
  const hero = { ...state, abilities };
  const target = { id: 7, attackDamage: 5, friendly: true };
  expect(
    planHeroAction(data, hero, 'gemtd_hero_yixinghuanwei', { ...context, target }, 0),
  ).toMatchObject({ cost: 300, cooldownUntil: 90, effect: { kind: 'swap', target: 7 } });
  expect(planHeroAction(data, hero, 'gemtd_hero_qingyi', { ...context, target }, 0)).toMatchObject({
    cost: 200,
    cooldownUntil: 150,
    effect: { kind: 'swapNearbyStone', radius: 192 },
  });
  expect(
    planHeroAction(
      data,
      hero,
      'gemtd_hero_qingyi',
      { ...context, target: { ...target, slab: true } },
      0,
    ),
  ).toEqual({ ok: false, reason: 'target' });
  expect(
    planHeroAction(data, hero, 'gemtd_hero_yixinghuanwei', { ...context, target, race: true }, 0),
  ).toEqual({ ok: false, reason: 'target' });
  expect(planHeroAction(data, hero, 'gemtd_hero_shitou', context, 0)).toMatchObject({
    cost: 450,
    effect: { kind: 'stoneLine', count: 4 },
  });
  expect(
    planHeroAction(data, hero, 'gemtd_hero_xuanfeng', { ...context, point: { x: 1, y: 2 } }, 0),
  ).toMatchObject({ cost: 200, effect: { kind: 'whirlwind', radius: 192 } });
  expect(
    planHeroAction(
      data,
      hero,
      'gemtd_hero_guangzhudaobiao',
      { ...context, point: { x: 1, y: 2 } },
      0,
    ),
  ).toMatchObject({ cost: 375, effect: { kind: 'beacon', enemyRadius: 192, friendlyRadius: 58 } });
  expect(
    planHeroAction(data, hero, 'gemtd_hero_beishuiyizhan', { ...context, target }, 0),
  ).toMatchObject({ cost: 100, effect: { kind: 'lastStand', target: 7, level: 1 } });
  expect(planHeroAction(data, hero, 'gemtd_hero_fengbaozhichui', context, 0)).toEqual({
    ok: false,
    reason: 'unsupported',
  });
});
