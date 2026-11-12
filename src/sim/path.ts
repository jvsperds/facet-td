import { BOARD_SIZE, type Cell } from './board';

// Eight-direction shortest routes. Both orthogonal neighbours must be open for a diagonal,
// keeping the centre-to-centre movement clear of wall corners, as in the predecessor.

const SQRT2 = Math.SQRT2;
const DX = Int8Array.of(1, -1, 0, 0, 1, 1, -1, -1);
const DY = Int8Array.of(0, 0, 1, -1, 1, -1, 1, -1);
const W = BOARD_SIZE + 1;
const N = W * W;

// Scratch shared by every search (the sim is single-threaded and findPath is not re-entrant).
// Generation stamps make clearing free: a cell's g/parent is valid only when gStamp matches.
const gScore = new Float64Array(N);
const parent = new Int32Array(N);
const gStamp = new Uint32Array(N);
const closed = new Uint32Array(N);
let stamp = 0;

// Flat binary heap keyed (f, h, seq); seq is unique, so the key order is total and the pop order
// is the same as any other correct heap's: ties break on lower h, then insertion order.
let hf = new Float64Array(1024);
let hh = new Float64Array(1024);
let hs = new Int32Array(1024);
let hc = new Int32Array(1024);
let size = 0;

const less = (a: number, b: number) =>
  hf[a] !== hf[b] ? hf[a] < hf[b] : hh[a] !== hh[b] ? hh[a] < hh[b] : hs[a] < hs[b];
function swap(a: number, b: number) {
  let t = hf[a];
  hf[a] = hf[b];
  hf[b] = t;
  t = hh[a];
  hh[a] = hh[b];
  hh[b] = t;
  t = hs[a];
  hs[a] = hs[b];
  hs[b] = t;
  t = hc[a];
  hc[a] = hc[b];
  hc[b] = t;
}
function push(f: number, h: number, seq: number, cell: number) {
  if (size === hf.length) {
    const grow = <T extends Float64Array | Int32Array>(a: T, b: T) => (b.set(a), b);
    hf = grow(hf, new Float64Array(size * 2));
    hh = grow(hh, new Float64Array(size * 2));
    hs = grow(hs, new Int32Array(size * 2));
    hc = grow(hc, new Int32Array(size * 2));
  }
  hf[size] = f;
  hh[size] = h;
  hs[size] = seq;
  hc[size] = cell;
  for (let i = size++; i > 0;) {
    const p = (i - 1) >> 1;
    if (!less(i, p)) break;
    swap(i, p);
    i = p;
  }
}
/** Removes the top entry and returns its cell. */
function pop() {
  const top = hc[0];
  if (--size > 0) {
    hf[0] = hf[size];
    hh[0] = hh[size];
    hs[0] = hs[size];
    hc[0] = hc[size];
    for (let i = 0; ;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < size && less(l, m)) m = l;
      if (r < size && less(r, m)) m = r;
      if (m === i) break;
      swap(m, i);
      i = m;
    }
  }
  return top;
}

/** `blocked(x, y)` is true for occupied or off-board cells. Returns start..goal inclusive, or null. */
export function findPath(
  from: Cell,
  to: Cell,
  blocked: (x: number, y: number) => boolean,
): Cell[] | null {
  const open = (x: number, y: number) =>
    x >= 1 && x <= BOARD_SIZE && y >= 1 && y <= BOARD_SIZE && !blocked(x, y);
  if (!open(to.x, to.y) && !(to.x === from.x && to.y === from.y)) return null;
  const tx = to.x;
  const ty = to.y;
  const h = (x: number, y: number) => {
    const dx = Math.abs(x - tx);
    const dy = Math.abs(y - ty);
    return Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy);
  };
  if (++stamp === 0xffffffff) {
    gStamp.fill(0);
    closed.fill(0);
    stamp = 1;
  }
  const start = from.y * W + from.x;
  gScore[start] = 0;
  parent[start] = -1;
  gStamp[start] = stamp;
  size = 0;
  let seq = 0;
  const h0 = h(from.x, from.y);
  push(h0, h0, seq++, start);
  while (size) {
    const k = pop();
    if (closed[k] === stamp) continue;
    closed[k] = stamp;
    const x = k % W;
    const y = (k - x) / W;
    if (x === tx && y === ty) {
      const path: Cell[] = [];
      for (let c = k; c !== -1; c = parent[c]) path.push({ x: c % W, y: Math.floor(c / W) });
      return path.reverse();
    }
    const gk = gScore[k];
    for (let d = 0; d < 8; d++) {
      const dx = DX[d];
      const dy = DY[d];
      const nx = x + dx;
      const ny = y + dy;
      if (!open(nx, ny)) continue;
      if (dx && dy && (!open(x + dx, y) || !open(x, y + dy))) continue;
      const nk = ny * W + nx;
      const ng = gk + (dx && dy ? SQRT2 : 1);
      if (gStamp[nk] === stamp && ng >= gScore[nk]) continue;
      gScore[nk] = ng;
      parent[nk] = k;
      gStamp[nk] = stamp;
      const hn = h(nx, ny);
      push(ng + hn, hn, seq++, nk);
    }
  }
  return null;
}
