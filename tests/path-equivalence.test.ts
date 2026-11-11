import { expect, test } from 'vitest';
import { loadData } from '../src/data';
import { BOARD_SIZE, Board, type Cell } from '../src/sim/board';
import type { Game } from '../src/sim/game';
import { findPath } from '../src/sim/path';
import { Rng } from '../src/sim/rng';
import { Sim } from '../src/sim/sim';

// The typed-array A* must return exactly the routes of the original Map/Set implementation, kept
// verbatim below as the reference: replays and saves depend on its tie-breaking.

const SQRT2 = Math.SQRT2;
const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

const idx = (x: number, y: number) => y * (BOARD_SIZE + 1) + x;

function referencePath(
  from: Cell,
  to: Cell,
  blocked: (x: number, y: number) => boolean,
): Cell[] | null {
  const open = (x: number, y: number) =>
    x >= 1 && x <= BOARD_SIZE && y >= 1 && y <= BOARD_SIZE && !blocked(x, y);
  if (!open(to.x, to.y) && !(to.x === from.x && to.y === from.y)) return null;
  const h = (x: number, y: number) => {
    const dx = Math.abs(x - to.x);
    const dy = Math.abs(y - to.y);
    return Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy);
  };
  const g = new Map<number, number>([[idx(from.x, from.y), 0]]);
  const parent = new Map<number, number>();
  const done = new Set<number>();
  // Binary heap of [f, h, seq, x, y]; ties break on lower h, then insertion order, for determinism.
  const heap: [number, number, number, number, number][] = [];
  let seq = 0;
  const less = (a: (typeof heap)[0], b: (typeof heap)[0]) =>
    a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  const push = (n: (typeof heap)[0]) => {
    heap.push(n);
    for (let i = heap.length - 1; i > 0;) {
      const p = (i - 1) >> 1;
      if (less(heap[p], heap[i]) <= 0) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ;) {
        const [l, r] = [2 * i + 1, 2 * i + 2];
        let m = i;
        if (l < heap.length && less(heap[l], heap[m]) < 0) m = l;
        if (r < heap.length && less(heap[r], heap[m]) < 0) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  push([h(from.x, from.y), h(from.x, from.y), seq++, from.x, from.y]);
  while (heap.length) {
    const [, , , x, y] = pop();
    const k = idx(x, y);
    if (done.has(k)) continue;
    done.add(k);
    if (x === to.x && y === to.y) {
      const path: Cell[] = [];
      for (let c: number | undefined = k; c !== undefined; c = parent.get(c))
        path.push({ x: c % (BOARD_SIZE + 1), y: Math.floor(c / (BOARD_SIZE + 1)) });
      return path.reverse();
    }
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!open(nx, ny)) continue;
      if (dx && dy && (!open(x + dx, y) || !open(x, y + dy))) continue;
      const nk = idx(nx, ny);
      const ng = g.get(k)! + (dx && dy ? SQRT2 : 1);
      if (ng >= (g.get(nk) ?? Infinity)) continue;
      g.set(nk, ng);
      parent.set(nk, k);
      push([ng + h(nx, ny), h(nx, ny), seq++, nx, ny]);
    }
  }
  return null;
}

/** The original Game.blocked: a stone, or a gem that is not a tablet. */
const referenceBlocked = (g: Game) => (x: number, y: number) =>
  g.stones.has(y * 64 + x) ||
  g.gems.some((gem) => !gem.name.includes('shiban') && gem.cell.x === x && gem.cell.y === y);

function referenceRoute(g: Game, blocked: (x: number, y: number) => boolean) {
  const w = g.beacon ? [g.flyRoute[0], g.beacon, ...g.flyRoute.slice(1)] : g.flyRoute;
  const route: Cell[] = [];
  for (let i = 0; i + 1 < w.length; i++) {
    const leg = referencePath(w[i], w[i + 1], blocked);
    if (!leg) return null;
    route.push(...(i ? leg.slice(1) : leg));
  }
  return route;
}

const data = loadData('classic');
const board = new Board(data);
const waypoints = board.waypoints.map((w) => w.cell);

test('typed A* matches the reference cell-for-cell on random mazes of the real board', () => {
  const rng = new Rng(2024);
  let routes = 0;
  let cuts = 0;
  for (let maze = 0; maze < 400; maze++) {
    const density = 50 + (maze % 9) * 60;
    const grid = new Uint8Array(64 * 64);
    for (const s of board.stones) grid[s.y * 64 + s.x] = 1;
    for (let y = 1; y <= BOARD_SIZE; y++)
      for (let x = 1; x <= BOARD_SIZE; x++) if (rng.int(1, 1000) <= density) grid[y * 64 + x] = 1;
    for (const w of waypoints) grid[w.y * 64 + w.x] = 0;
    const blocked = (x: number, y: number) => grid[y * 64 + x] === 1;
    const pairs: [Cell, Cell][] = waypoints.slice(1).map((w, i) => [waypoints[i], w]);
    const cell = () => ({ x: rng.int(1, BOARD_SIZE), y: rng.int(1, BOARD_SIZE) });
    for (let i = 0; i < 4; i++) pairs.push([cell(), cell()]);
    for (const [a, b] of pairs) {
      const expected = referencePath(a, b, blocked);
      expect(findPath(a, b, blocked)).toEqual(expected);
      if (expected) routes++;
      else cuts++;
    }
  }
  expect(routes).toBeGreaterThan(1000);
  expect(cuts).toBeGreaterThan(100);
});

test(
  'game routes, build checks and mazeVersion agree with the reference as a maze grows',
  { timeout: 120_000 },
  () => {
    const g = new Sim(data, 11).game;
    const rng = new Rng(77);
    let version = g.mazeVersion;
    let built = 0;
    for (let n = 0; n < 160; n++) {
      const c = g.route[rng.int(2, g.route.length - 3)];
      const kind = g.board.kind(c);
      const check = g.canBuild(c);
      const blocked = referenceBlocked(g);
      const probe = referenceRoute(g, (x, y) => (x === c.x && y === c.y) || blocked(x, y));
      const free = (kind === 'open' || kind === 'stone') && !g.gemAt(c);
      const expected = free ? !!probe : false;
      expect(check.ok).toBe(expected);
      expect(g.canBuild(c)).toEqual(check); // memoised answer is the same
      expect(g.mazeVersion).toBe(version);
      if (!check.ok) continue;
      g.draft = [];
      expect(g.build(c).ok).toBe(true);
      built++;
      expect(g.mazeVersion).toBeGreaterThan(version);
      version = g.mazeVersion;
      expect(g.route).toEqual(referenceRoute(g, referenceBlocked(g)));
      // Every few builds turn a gem into a stone (same blocking, route reused) or drop a tablet.
      if (n % 5 === 0) {
        const gem = g.gems[0];
        g.gems = g.gems.slice(1);
        g.stones.set(gem.cell.y * 64 + gem.cell.x, { ...gem.cell });
        expect(g.mazeVersion).toBeGreaterThan(version);
        version = g.mazeVersion;
      }
      if (n % 7 === 0 && g.gems.length) {
        g.gems[0].name = 'gemtd_shiban_test';
        expect(g.mazeVersion).toBeGreaterThan(version);
        version = g.mazeVersion;
        expect(g.canBuild(g.gems[0].cell).ok).toBe(false); // still occupied by a tower
      }
    }
    expect(built).toBeGreaterThan(60);
    expect(g.route.length).toBeGreaterThan(250);
  },
);

test('beacon detours are searched afresh and match the reference', () => {
  const g = new Sim(data, 3).game;
  const version = g.mazeVersion;
  g.beacon = { x: 20, y: 30 };
  expect(g.mazeVersion).toBe(version + 1);
  g.draft = [];
  expect(g.build({ x: 12, y: 12 }).ok).toBe(true);
  expect(g.route).toEqual(referenceRoute(g, referenceBlocked(g)));
  expect(g.route).toContainEqual({ x: 20, y: 30 });
});
