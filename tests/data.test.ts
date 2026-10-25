import { expect, test } from 'vitest';
import { loadData, merge } from '../src/data';

test('merge: objects merge, null deletes, arrays replace', () => {
  expect(merge({ a: 1, b: { c: 2, d: 3 }, e: [1, 2] }, { b: { c: 9, d: null }, e: [7] })).toEqual({
    a: 1,
    b: { c: 9 },
    e: [7],
  });
});

test('classic ignores overrides; facet applies them and changes the version', () => {
  const base = { 'npc/units.json': { gem: { Damage: '10', Range: '500' } } };
  const facet = { 'npc/units.json': { gem: { Damage: '12' } } };
  const classic = loadData('classic', base, facet);
  const faceted = loadData('facet', base, facet);
  expect(classic.files['npc/units.json']).toEqual(base['npc/units.json']);
  expect(faceted.files['npc/units.json']).toEqual({ gem: { Damage: '12', Range: '500' } });
  expect(faceted.version).not.toBe(classic.version);
  expect(base['npc/units.json'].gem.Damage).toBe('10'); // baseline object untouched
});

test('real baseline loads, and classic data version is stable', () => {
  const a = loadData('classic');
  expect(Object.keys(a.files)).toContain('lua/addon_game_mode.json');
  expect(loadData('classic').version).toBe(a.version);
});
