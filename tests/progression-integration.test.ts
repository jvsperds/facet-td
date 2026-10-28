import { expect, test } from 'vitest';
import { loadData } from '../src/data';
import { Sim } from '../src/sim/sim';

const data = loadData('classic');
function draft(names: string[]) {
  const sim = new Sim(data, 5);
  for (const x of [12, 14, 16, 18, 20]) sim.send(0, { type: 'build', cell: { x, y: 12 } });
  sim.step();
  sim.game.gems.forEach((g, i) => (g.name = names[i]));
  return sim;
}

test('a draft combine consumes the full draft, preserves the selected cell and starts a wave', () => {
  const sim = draft(['gemtd_b1', 'gemtd_y1', 'gemtd_d1', 'gemtd_p1', 'gemtd_g1']);
  const g = sim.game,
    anchor = g.gems[1],
    before = g.stones.size;
  sim.send(0, { type: 'combine', id: anchor.id, kind: 'draft', result: 'gemtd_baiyin' });
  sim.step();
  expect(g.gems).toHaveLength(1);
  expect(g.gems[0]).toMatchObject({ name: 'gemtd_baiyin', cell: anchor.cell });
  expect(g.stones.size).toBe(before + 4);
  expect(g.phase).toBe('wave');
  expect(g.draft).toEqual([]);
});

test('tablet placement refuses occupied cells and keeps its own cell passable', () => {
  const sim = draft(['gemtd_y111', 'gemtd_d11', 'gemtd_b1', 'gemtd_p1', 'gemtd_g1']);
  const g = sim.game,
    anchor = g.gems[0],
    route = g.route,
    before = g.stones.size;
  expect(g.canCombine(anchor.id, 'tablet', 'gemtd_youbushiban', anchor.cell).ok).toBe(false);
  expect(g.draft).toHaveLength(5);
  sim.send(0, {
    type: 'combine',
    id: anchor.id,
    kind: 'tablet',
    result: 'gemtd_youbushiban',
    cell: { x: 11, y: 12 },
  });
  sim.step();
  expect(g.gems[0]).toMatchObject({ name: 'gemtd_youbushiban', cell: { x: 11, y: 12 } });
  expect(g.stones.size).toBe(before + 5);
  expect(g.stoneAt({ x: 11, y: 12 })).toBe(false);
  expect(g.route).toEqual(route);
});

test('three aligned tablets upgrade without leaving blocking stones behind', () => {
  const sim = new Sim(data, 5),
    g = sim.game;
  g.stones.clear();
  for (let i = 0; i < 3; i++)
    g.gems.push({
      id: i + 1,
      name: 'gemtd_youbushiban',
      cell: { x: 12 + i, y: 12 },
      cooldown: 0,
      target: null,
    });
  const before = g.stones.size;
  sim.send(0, { type: 'combine', id: 2, kind: 'tablet-upgrade', result: 'gemtd_youbushiban_yin' });
  sim.step();
  expect(g.gems).toHaveLength(1);
  expect(g.gems[0].name).toBe('gemtd_youbushiban_yin');
  expect(g.stones.size).toBe(before);
});

test('natural emerald steals three distinct nearby ranged tower abilities', () => {
  const sim = new Sim(data, 5),
    g = sim.game;
  g.phase = 'wave';
  g.gems = [
    { id: 1, name: 'gemtd_shenhaizhenzhu', cell: { x: 10, y: 10 }, cooldown: 0, target: null },
    { id: 2, name: 'gemtd_g11111', cell: { x: 11, y: 10 }, cooldown: 0, target: null },
    { id: 3, name: 'gemtd_d111', cell: { x: 10, y: 11 }, cooldown: 0, target: null },
    { id: 4, name: 'gemtd_b1', cell: { x: 9, y: 10 }, cooldown: 0, target: null },
    { id: 5, name: 'gemtd_e1', cell: { x: 10, y: 9 }, cooldown: 0, target: null },
    { id: 6, name: 'gemtd_p1', cell: { x: 9, y: 9 }, cooldown: 0, target: null },
  ];
  expect(g.combine(1, 'normal', 'gemtd_tianranzumulv').ok).toBe(true);
  const emerald = g.gems.find((gem) => gem.name === 'gemtd_tianranzumulv')!;
  expect(emerald.stolenAbilities?.map((a) => a.name).sort()).toEqual(
    ['tower_jianjia1', 'tower_slow1', 'tower_speed_aura1'].sort(),
  );
});

test('downgrade and the perfect +2 special outcome are reachable through replayable commands', () => {
  const play = () => {
    const sim = draft(Array(5).fill('gemtd_b11111'));
    sim.send(0, { type: 'keep', id: sim.game.gems[0].id, upgrade: 2 });
    sim.step();
    expect(sim.game.gems[0].name).toBe('gemtd_zhenjiazhishi');
    return sim.stateHash();
  };
  expect(play()).toBe(play());
  const sim = draft(Array(5).fill('gemtd_b11'));
  sim.send(0, { type: 'downgrade', id: sim.game.gems[0].id });
  sim.step();
  expect(sim.game.gems[0].name).toBe('gemtd_b1');
  expect(sim.game.phase).toBe('wave');
});
