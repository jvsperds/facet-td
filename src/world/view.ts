import { BOARD_SIZE, type Cell } from '../sim/board';

// Camera maths, free of three.js and the DOM so it is testable. Scene axes: one cell = one unit,
// X = east, Z = south (board north is -Z), ground at y = 0, board centre cell (19, 19) at the origin.

export type ViewMode = 'iso' | 'top';
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** Logical camera state. Switching modes keeps every field; only the projection changes. */
export interface ViewState {
  mode: ViewMode;
  /** Relative orbit offset in degrees, added to the mode's preset azimuth. */
  rotation: number;
  /** Multiplier on the fit scale. */
  zoom: number;
  /** Ground offset of the view centre from the fitted board centre. */
  panX: number;
  panZ: number;
}

export const ISO_ELEVATION = 35.264; // true isometric: atan(1/sqrt(2))
const RAD = Math.PI / 180;
const HALF = BOARD_SIZE / 2;
/** Tallest board content to keep inside the fit (stone walls reach 0.38 cell). */
const FIT_HEIGHT = 0.4;
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 6;

export const toScene = (c: Cell) => ({ x: c.x - 19, z: 19 - c.y });
export const toCell = (x: number, z: number): Cell => ({
  x: Math.round(x) + 19,
  y: 19 - Math.round(z),
});

export const elevation = (s: Pick<ViewState, 'mode'>) => (s.mode === 'top' ? 90 : ISO_ELEVATION);
export const azimuth = (s: Pick<ViewState, 'mode' | 'rotation'>) =>
  (s.mode === 'top' ? 0 : 45) + s.rotation;

/** Orthonormal camera basis: `d` points from the target to the camera, `right`/`up` are screen axes. */
export function basis(elevationDeg: number, azimuthDeg: number) {
  const e = elevationDeg * RAD;
  const a = azimuthDeg * RAD;
  const [se, ce, sa, ca] = [Math.sin(e), Math.cos(e), Math.sin(a), Math.cos(a)];
  return {
    d: [ce * sa, se, ce * ca] as const,
    right: [ca, 0, -sa] as const,
    up: [-se * sa, ce, -se * ca] as const,
  };
}
type Basis = ReturnType<typeof basis>;
const dot = (v: readonly number[], x: number, y: number, z: number) =>
  v[0] * x + v[1] * y + v[2] * z;

/** Screen-space extents (world units) of the board box under a basis. */
export function boardExtents(b: Basis) {
  let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const x of [-HALF, HALF])
    for (const z of [-HALF, HALF])
      for (const y of [0, FIT_HEIGHT]) {
        const sx = dot(b.right, x, y, z);
        const sy = dot(b.up, x, y, z);
        [x0, x1, y0, y1] = [Math.min(x0, sx), Math.max(x1, sx), Math.min(y0, sy), Math.max(y1, sy)];
      }
  return { w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

const fitScale = (r: Rect, w: number, h: number) => Math.min(r.w / w, r.h / h);

/**
 * The viewport area no HUD panel covers, chosen so the board fits largest. Each panel is cut away
 * by keeping the side of it (above, below, left or right) that leaves the biggest fit.
 */
export function safeRect(viewport: Rect, panels: Rect[], boardW: number, boardH: number): Rect {
  let r = viewport;
  for (const p of panels) {
    if (p.x >= r.x + r.w || p.x + p.w <= r.x || p.y >= r.y + r.h || p.y + p.h <= r.y) continue;
    const options: Rect[] = [
      { x: r.x, y: r.y, w: r.w, h: p.y - r.y },
      { x: r.x, y: p.y + p.h, w: r.w, h: r.y + r.h - p.y - p.h },
      { x: r.x, y: r.y, w: p.x - r.x, h: r.h },
      { x: p.x + p.w, y: r.y, w: r.x + r.w - p.x - p.w, h: r.h },
    ].filter((o) => o.w > 0 && o.h > 0);
    if (options.length === 0) return r; // shortcut: a panel covering everything is ignored; never happens with corner panels
    r = options.reduce((best, o) =>
      fitScale(o, boardW, boardH) > fitScale(best, boardW, boardH) ? o : best,
    );
  }
  return r;
}

/** Everything the renderer needs for one frame: basis, pixels per unit, camera ground offset. */
export function frame(
  s: ViewState,
  elevationDeg: number,
  azimuthDeg: number,
  viewport: Rect,
  panels: Rect[],
) {
  const b = basis(elevationDeg, azimuthDeg);
  const ext = boardExtents(b);
  const safe = safeRect(viewport, panels, ext.w, ext.h);
  const scale = fitScale(safe, ext.w, ext.h) * s.zoom;
  // Place the board's screen centre (plus pan) at the safe rect's centre.
  const ox = safe.x + safe.w / 2 - (viewport.x + viewport.w / 2);
  const oy = viewport.y + viewport.h / 2 - (safe.y + safe.h / 2);
  const camRight = ext.cx + dot(b.right, s.panX, 0, s.panZ) - ox / scale;
  const camUp = ext.cy + dot(b.up, s.panX, 0, s.panZ) - oy / scale;
  return { basis: b, scale, safe, camRight, camUp };
}

/** Ground displacement under a screen drag of (dx, dy) CSS px (dy down), at the given scale. */
export function dragToGround(
  dx: number,
  dy: number,
  scale: number,
  elevationDeg: number,
  azimuthDeg: number,
) {
  const a = azimuthDeg * RAD;
  const A = dx / scale;
  const C = dy / scale / Math.sin(elevationDeg * RAD); // screen-down is ground-forward foreshortened
  return { x: A * Math.cos(a) + C * Math.sin(a), z: -A * Math.sin(a) + C * Math.cos(a) };
}

/**
 * Board step for an arrow key, relative to the screen at the current azimuth. Diagonal views
 * (true iso at 45 degrees) round toward the preset's "up = north" choice.
 */
export function arrowStep(
  key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight',
  azimuthDeg: number,
) {
  const k = ((Math.round((azimuthDeg - 1) / 90) % 4) + 4) % 4;
  const up = [
    [0, 1],
    [-1, 0],
    [0, -1],
    [1, 0],
  ][k];
  const [dx, dy] = up;
  const step = (x: number, y: number) => ({ x: x + 0, y: y + 0 }); // + 0 turns -0 into 0
  return {
    ArrowUp: step(dx, dy),
    ArrowDown: step(-dx, -dy),
    ArrowRight: step(dy, -dx),
    ArrowLeft: step(-dy, dx),
  }[key];
}
