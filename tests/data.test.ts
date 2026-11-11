import { expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { loadData, merge } from '../src/data';
import { versionOf } from '../src/data/version';

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

test('the bundled data version is the hash of the whole baseline, not just the bundled files', () => {
  const root = 'data/baseline';
  const files: Record<string, unknown> = {};
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, e.name);
      if (e.isDirectory()) walk(path);
      else if (e.name.endsWith('.json'))
        files[relative(root, path).split(sep).join('/')] = JSON.parse(readFileSync(path, 'utf8'));
    }
  };
  walk(root);
  const data = loadData('classic');
  expect(data.version).toBe(versionOf(files));
  // The data hash the game shipped with before the bundle was trimmed.
  expect(data.version).toBe('9e99dd5e');
  // Only what the 1-player game reads is bundled; the map keeps just the route's path corners.
  expect(Object.keys(data.files).sort()).toEqual([
    'localization/english.json',
    'lua/addon_game_mode.json',
    'maps/gemtd_1p.entities.json',
    'npc/abilities.json',
    'npc/units.json',
  ]);
  const entities = data.files['maps/gemtd_1p.entities.json'] as { classname: string }[];
  expect(entities.length).toBeGreaterThanOrEqual(7);
  expect(entities.every((e) => e.classname === 'path_corner')).toBe(true);
});
