import { BOARD_SIZE, type Cell } from './board';

// Shortest route between two cells on the blocked grid, matching the original's Jumper settings:
// 8 directions, diagonal steps cost sqrt(2), and a diagonal is refused only when both orthogonal
// neighbours it passes are blocked. The original used Jump Point Search, which returns an optimal
// path of the same length; where several optimal paths tie, this A* may pick a different one.

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

/** `blocked(x, y)` is true for occupied or off-board cells. Returns start..goal inclusive, or null. */
export function findPath(
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
      if (dx && dy && !open(x + dx, y) && !open(x, y + dy)) continue;
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
