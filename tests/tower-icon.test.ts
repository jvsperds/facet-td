import { expect, test } from 'vitest';
import { loadData } from '../src/data';
import { readRecipes } from '../src/sim/progression';
import { iconOf } from '../src/hud/TowerIcon';
import { towerModel } from '../src/world/pieces';

// HUD icons are rendered from the board's tower models, so every name the HUD can show (each
// recipe's result and ingredients) must build a model with a tower to frame.

const data = loadData('classic');

test('every recipe result and ingredient has a tower model for its icon', () => {
  const names = new Set(readRecipes(data).flatMap((r) => [r.result, ...r.ingredients]));
  expect(names.size).toBeGreaterThan(20);
  for (const name of names) {
    const model = towerModel(name);
    expect(model.children.at(-1), name).toBeDefined();
  }
});

test('without WebGL the icon falls back to the SVG glyph', () => {
  expect(iconOf('gemtd_r1')).toBe('');
});
