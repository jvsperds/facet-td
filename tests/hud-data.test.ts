import { expect, test } from 'vitest';
import { loadData } from '../src/data';
import { Sim } from '../src/sim/sim';
import { compact, roleOf } from '../src/hud/names';
import { owned, recipesUsing } from '../src/hud/RecipeBook';

// Data behind the redesigned HUD: wave preview, recipe progress, damage meter, labels.

const data = loadData('classic');

test('each ingredient is matched by at most one gem on the board', () => {
  expect(owned(['gemtd_r1', 'gemtd_r1', 'gemtd_p1'], ['gemtd_r1', 'gemtd_p1'])).toEqual([
    true,
    false,
    true,
  ]);
});

test('"builds into" lists recipes using the gem, best progress first', () => {
  const list = recipesUsing(data, 'gemtd_g1', ['gemtd_g1', 'gemtd_e1']);
  expect(list.length).toBeGreaterThan(0);
  expect(list.every(({ recipe }) => recipe.ingredients.includes('gemtd_g1'))).toBe(true);
  const share = (h: boolean[]) => h.filter(Boolean).length / h.length;
  for (let i = 1; i < list.length; i++)
    expect(share(list[i - 1].have)).toBeGreaterThanOrEqual(share(list[i].have));
});

test('the wave preview names the coming creep, and the damage meter reads this wave', () => {
  const game = new Sim(data, 1).game;
  const preview = game.wavePreview;
  expect(preview.names.length).toBeGreaterThan(0);
  expect(preview.count).toBeGreaterThan(0);
  expect(game.damageThisWave).toEqual({});
});

test('labels: compact numbers and tower roles', () => {
  expect([compact(950), compact(1234), compact(34567), compact(1.5e6)]).toEqual([
    '950',
    '1.2k',
    '35k',
    '1.5M',
  ]);
  const game = new Sim(data, 1).game;
  expect(roleOf(game.abilities('gemtd_g1'))).toBe('Poisons enemies');
  expect(roleOf(game.abilities('gemtd_r1'))).toBe('Splash damage');
  expect(roleOf(game.abilities('gemtd_e1'))).toBe('Empowers nearby towers');
});

test('the spawn queue counts down the creeps still to come, for their walk out of the cave', () => {
  const sim = new Sim(data, 1);
  const game = sim.game;
  expect(game.spawning).toBeNull(); // building: nothing on its way
  for (const x of [20, 22, 24, 26, 28]) sim.send(0, { type: 'build', cell: { x, y: 12 } });
  sim.step();
  sim.send(0, { type: 'keep', id: game.draft[0], upgrade: 0 });
  sim.step();
  sim.step();
  const first = game.spawning!;
  expect(first.name).toBe(game.wavePreview.names[0]);
  expect(first.speed).toBeGreaterThan(0);
  expect(first.count + game.creeps.length).toBe(game.wavePreview.count);
  for (let t = 0; t < first.next + first.every; t++) sim.step();
  expect(game.spawning!.count).toBeLessThan(first.count);
});
