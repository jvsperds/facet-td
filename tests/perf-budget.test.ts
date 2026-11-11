import { expect, test } from 'vitest';
import { loadData } from '../src/data';
import type { Cell } from '../src/sim/board';
import type { Game } from '../src/sim/game';
import { Rng } from '../src/sim/rng';
import { Sim } from '../src/sim/sim';

// Route search budgets on a late-game maze (~600-cell route, ~465 stones, ~100 towers). Measured
// in Node: route search ~0.6 ms, a build ~0.7 ms, keep ~0.5 ms; the previous Map/Set search with a
// per-probe gem scan took ~15-23 ms, ~30 ms and ~18 ms. Budgets sit well above the current cost so
// slow CI machines pass, and well below the old cost so a regression fails.

type Internals = { searchRoute(extra: Cell | undefined, beacon: Cell | null): Cell[] | null };
const median = (a: number[]) => [...a].sort((x, y) => x - y)[a.length >> 1];
const time = (f: () => void) => {
  const t = performance.now();
  f();
  return performance.now() - t;
};

/** Serpentine maze: walls every other row with the gap at alternating ends, as a late-game player
 * builds; cells whose stone would cut the route are skipped. */
function heavyMaze(g: Game) {
  for (let y = 2, wall = 0; y <= 36; y += 2, wall++)
    for (let x = 1; x <= 37; x++) {
      if (wall % 2 ? x >= 35 : x <= 3) continue;
      const c = { x, y };
      if (!g.canBuild(c).ok) continue;
      // About one wall cell in five is a gem tower, as in a played maze.
      if (x % 5 === 0) {
        g.draft = [];
        g.build(c);
      } else g.stones.set(y * 64 + x, c);
    }
  g.draft = [];
}

test(
  'route search and build commands stay within budget on a heavy maze',
  { timeout: 120_000 },
  () => {
    const sim = new Sim(loadData('classic'), 5);
    const g = sim.game;
    heavyMaze(g);
    g.route = (g as unknown as Internals).searchRoute(undefined, null)!;
    expect(g.route.length).toBeGreaterThan(500);

    const search = Array.from({ length: 40 }, () =>
      time(() => (g as unknown as Internals).searchRoute(undefined, g.beacon)),
    );
    expect(median(search)).toBeLessThanOrEqual(8);

    // Builds on fresh cells (each pays one probe search); keep pays at most one more.
    const builds: number[] = [];
    const rng = new Rng(4);
    while (builds.length < 5) {
      const c = g.route[rng.int(2, g.route.length - 3)];
      // A cell not yet probed: the build pays its own route check.
      let ok = false;
      const ms = time(() => (ok = g.build(c).ok));
      if (ok) builds.push(ms);
    }
    expect(Math.max(...builds)).toBeLessThanOrEqual(40);
    expect(median(builds)).toBeLessThanOrEqual(12);
    expect(g.draft).toHaveLength(5);
    const keep = time(() => g.keep(g.draft[0], 0));
    expect(keep).toBeLessThanOrEqual(12);
    expect(g.phase).toBe('wave');

    // Repeated HUD checks of the same cell are memoised per maze version.
    g.phase = 'build';
    const cell = g.route[10];
    g.canBuild(cell);
    const again = Array.from({ length: 50 }, () => time(() => g.canBuild(cell)));
    expect(median(again)).toBeLessThanOrEqual(0.5);
  },
);
