import { expect, test } from 'vitest';
import { loadData } from '../src/data';
import { planTabletCast, readTabletSpell } from '../src/sim/tablets';
const data = loadData('classic');
const names = ['youbu', 'zhangqi', 'hongliu', 'haojiao', 'suanwu', 'mabi', 'konghe', 'xuwu'];
const kinds = ['targets', 'line', 'area', 'friendlyAura', 'area', 'bounce', 'area', 'area'];
const creeps = [{ id: 1, x: 1, y: 0, hp: 100, maxHp: 100 }];
test('all source families and tiers produce finite plans', () => {
  const before = JSON.stringify(creeps);
  for (const [i, family] of names.entries())
    for (const suffix of ['', '_yin', '_jin']) {
      const name = `gemtd_${family}shiban${suffix}`;
      expect(readTabletSpell(data, name)).toBeDefined();
      const plan = planTabletCast(data, name, { x: 0, y: 0 }, creeps, 10);
      expect(plan.ok).toBe(true);
      if (plan.ok) {
        expect(plan.plans[0].kind).toBe(kinds[i]);
        expect(plan.cooldownUntil).toBe(310);
      }
    }
  expect(JSON.stringify(creeps)).toBe(before);
});
test('trigger range, cooldown, and invalid names refuse casts', () => {
  const name = 'gemtd_youbushiban';
  expect(planTabletCast(data, name, { x: 0, y: 0, cooldownUntil: 11 }, creeps, 10)).toEqual({
    ok: false,
    reason: 'cooldown',
  });
  expect(planTabletCast(data, name, { x: -0.01, y: 0 }, creeps, 10)).toEqual({
    ok: false,
    reason: 'no target',
  });
  expect(planTabletCast(data, 'unknown', { x: 0, y: 0 }, creeps, 10).ok).toBe(false);
});
