import { expect, test } from 'vitest';
import { loadData } from '../src/data';
import { qualityOf } from '../src/sim/game';
import { findPath } from '../src/sim/path';
import { Sim } from '../src/sim/sim';

const data = loadData('classic');
const free = () => false;

test('path: straight, diagonal and no squeezing between two diagonal blockers', () => {
  expect(findPath({ x: 1, y: 1 }, { x: 1, y: 5 }, free)).toHaveLength(5);
  expect(findPath({ x: 1, y: 1 }, { x: 4, y: 4 }, free)).toHaveLength(4);
  const wall = (x: number, y: number) => (x === 2 && y === 1) || (x === 1 && y === 2);
  expect(findPath({ x: 1, y: 1 }, { x: 2, y: 2 }, wall)).toBeNull();
  const corner = (x: number, y: number) => x === 2 && y === 1;
  expect(findPath({ x: 1, y: 1 }, { x: 2, y: 2 }, corner)).toHaveLength(2); // one blocked corner may be cut
});

test('the empty board routes through all seven waypoints in order', () => {
  const g = new Sim(data, 1).game;
  for (const w of g.board.waypoints) expect(g.route).toContainEqual(w.cell);
  expect(g.route[0]).toEqual(g.board.waypoints[0].cell);
  expect(g.route.at(-1)).toEqual(g.board.waypoints[6].cell);
});

test('build rules: waypoints, no-build zones and route blocking are refused', () => {
  const g = new Sim(data, 1).game;
  expect(g.canBuild({ x: 5, y: 19 })).toEqual({ ok: false, reason: 'Unable to build here' });
  expect(g.canBuild({ x: 30, y: 5 })).toEqual({ ok: false, reason: 'Unable to build here' });
  // Box in checkpoint 1 at (5, 19): stones already sit at (4,19) and (6,19).
  for (const c of [
    { x: 4, y: 20 },
    { x: 5, y: 20 },
    { x: 6, y: 20 },
    { x: 4, y: 18 },
  ])
    expect(g.build(c).ok).toBe(true);
  expect(g.canBuild({ x: 5, y: 18 })).toEqual({ ok: false, reason: 'Blocked if build here' });
  expect(g.canBuild({ x: 6, y: 18 }).ok).toBe(true);
});

test('a round: five chipped gems at build level 1, keep one, four become stones, the wave plays out', () => {
  const sim = new Sim(data, 7);
  const g = sim.game;
  const cells = [12, 14, 16, 18, 20].map((x) => ({ x, y: 12 }));
  for (const cell of cells) sim.send(0, { type: 'build', cell });
  sim.step();
  expect(g.draft).toHaveLength(5);
  expect(g.gems.every((gem) => qualityOf(gem.name) === 1)).toBe(true);
  expect(g.keepResult(g.draft[0], 0).ok).toBe(true);
  const stonesBefore = g.stones.size;
  sim.send(0, { type: 'keep', id: g.draft[2], upgrade: 0 });
  sim.step();
  expect(g.gems).toHaveLength(1);
  expect(g.stones.size).toBe(stonesBefore + 4);
  expect(g.phase).toBe('wave');
  let kills = 0;
  let leaks = 0;
  for (let t = 0; t < 60 * 30 && g.phase === 'wave'; t++) {
    sim.step();
    kills += g.events.filter((e) => e.type === 'kill').length;
    leaks += g.events.filter((e) => e.type === 'leak').length;
  }
  expect(kills + leaks).toBe(10);
  expect(g.phase).toBe('build');
  expect(g.level).toBe(2);
  expect(g.gold).toBe(kills * 5);
  expect(g.castleHp).toBeLessThanOrEqual(100 - leaks);
});

test('the same seed and commands replay to the same state', () => {
  const play = () => {
    const sim = new Sim(data, 3);
    for (let x = 10; x < 15; x++) sim.send(0, { type: 'build', cell: { x, y: 25 } });
    sim.step();
    sim.send(0, { type: 'keep', id: sim.game.draft[0], upgrade: 0 });
    for (let t = 0; t < 900; t++) sim.step();
    return sim.stateHash();
  };
  expect(play()).toBe(play());
});

test('an automated game runs to its end without errors', () => {
  const sim = new Sim(data, 11);
  const g = sim.game;
  let x = 1;
  let y = 3;
  while (g.phase === 'build' || g.phase === 'wave') {
    if (g.phase === 'build') {
      // Fill rows left to right, skipping refused cells, then keep the highest-quality gem.
      while (g.draft.length < 5) {
        if (g.build({ x, y }).ok) continue;
        if (++x > 37) [x, y] = [1, y + 2];
        if (y > 36) throw new Error('ran out of cells');
      }
      const best = [...g.draft].sort(
        (a, b) =>
          qualityOf(g.gems.find((q) => q.id === b)!.name) -
          qualityOf(g.gems.find((q) => q.id === a)!.name),
      )[0];
      sim.send(0, { type: 'keep', id: best, upgrade: 0 });
    }
    sim.step();
    expect(g.route.length).toBeGreaterThan(0);
  }
  expect(['lost', 'won']).toContain(g.phase);
  expect(g.level).toBeGreaterThan(1);
}, 60_000);
