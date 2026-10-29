import { effect, signal } from '@preact/signals';
import type { Board, Cell } from '../sim/board';
import type { Cmd } from '../sim/sim';
import {
  arrowStep,
  azimuth,
  dragToGround,
  elevation,
  MAX_ZOOM,
  MIN_ZOOM,
  toScene,
  type ViewState,
} from '../world/view';
import type { World } from '../world/world';

// Pointer, wheel and keyboard -> camera and selection. Camera moves never send sim commands.

const DRAG_PX = 6;
/** Two picks of the same cell within this time place a gem there (issue #13). */
const DOUBLE_PICK_MS = 400;
const REVEAL_MARGIN_PX = 48;
const ORBIT_DEG_PER_PX = 0.4;
const PRESET: ViewState = { mode: 'iso', rotation: 0, zoom: 1, panX: 0, panZ: 0 };

export const view = signal<ViewState>(PRESET);
/** Fixed angle (drag pans) or Rotate (drag orbits). */
export const rotateMode = signal(false);
export const selected = signal<Cell | null>(null);
/** The selected creep's id; selecting a cell clears it and the other way round. */
export const selectedCreep = signal<number | null>(null);
export const cursor = signal<Cell | null>(null);
/** The board cell under a mouse pointer that is not pressed, for the row and column guides. */
export const hovered = signal<Cell | null>(null);
/**
 * A hero command waiting for its cell (Dota's targeting cursor): the next board pick sends it
 * there instead of selecting. Shift keeps it armed for another cell; Escape or a right click
 * cancels it.
 */
export const targeting = signal<'build' | 'remove' | null>(null);
/** Polite screen-reader announcement; set to a new string to announce it once. */
export const announcement = signal('');

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export function createCameraInput(
  world: World,
  board: Board,
  send: (cmd: Cmd) => void,
  canBuild: (cell: Cell) => boolean = () => true,
) {
  const set = (patch: Partial<ViewState>, animate = true) => {
    view.value = { ...view.value, ...patch };
    world.setView(view.value, animate && !reducedMotion.matches);
  };

  /** Pan so a cell sits in the safe area's centre if it is outside the safe area or near its edge. */
  const reveal = (cell: Cell) => {
    const p = world.screenOf(cell);
    const s = p.safe;
    // At the fit every cell is already visible; the margin only matters once zoomed in.
    const m = view.value.zoom > 1 ? Math.min(REVEAL_MARGIN_PX, s.w / 2, s.h / 2) : 0;
    if (p.x >= s.x + m && p.x <= s.x + s.w - m && p.y >= s.y + m && p.y <= s.y + s.h - m) return;
    const { x, z } = toScene(cell);
    set({ panX: x, panZ: z });
  };
  const keepFocusVisible = () => {
    const cell = cursor.value ?? selected.value;
    if (cell) reveal(cell);
  };

  const actions = {
    toggleMode() {
      set({ mode: view.value.mode === 'iso' ? 'top' : 'iso' });
      keepFocusVisible();
      announcement.value = view.value.mode === 'iso' ? 'Isometric view' : 'Top view';
    },
    toggleRotate() {
      rotateMode.value = !rotateMode.value;
      announcement.value = rotateMode.value
        ? 'Rotate: drag turns the board'
        : 'Fixed angle: drag pans the board';
    },
    turn(deg: number) {
      set({ rotation: view.value.rotation + deg });
      keepFocusVisible();
      announcement.value = `Turned ${deg < 0 ? 'left' : 'right'}`;
    },
    zoomBy(factor: number) {
      set({ zoom: clampZoom(view.value.zoom * factor) });
      keepFocusVisible();
    },
    reset() {
      set({ rotation: 0, zoom: 1, panX: 0, panZ: 0 });
      announcement.value = 'View reset';
    },
    select(cell: Cell | null) {
      selected.value = cell;
      selectedCreep.value = null;
      if (cell) cursor.value = cell;
    },
  };

  // Pointers: a press that does not travel is a pick; travel pans or orbits; two pointers pinch-zoom.
  const canvas = world.canvas;
  const down = new Map<number, { x: number; y: number }>();
  let travel = 0;
  let pinch = 0;
  let lastPick: { cell: Cell; time: number } | null = null;
  canvas.style.touchAction = 'none';
  effect(() => {
    canvas.style.cursor = targeting.value ? 'crosshair' : '';
  });
  /** Send the armed command at `cell`; true when one was armed. */
  const cast = (cell: Cell, keep: boolean) => {
    const type = targeting.value;
    if (!type) return false;
    send({ type, cell: { ...cell } });
    announcement.value = `${type === 'build' ? 'Placing a gem' : 'Removing the stone'} at cell ${cell.x}, ${cell.y}`;
    if (!keep) targeting.value = null;
    return true;
  };
  canvas.addEventListener('contextmenu', (e) => {
    if (!targeting.value) return;
    e.preventDefault();
    targeting.value = null;
    announcement.value = 'Cancelled';
  });
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    down.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (down.size === 1) travel = 0;
    pinch = 0;
  });
  canvas.addEventListener('pointermove', (e) => {
    const last = down.get(e.pointerId);
    if (!last) {
      if (e.pointerType !== 'mouse') return;
      const r = canvas.getBoundingClientRect();
      const cell = world.pick(e.clientX - r.left, e.clientY - r.top);
      if (cell?.x !== hovered.value?.x || cell?.y !== hovered.value?.y) hovered.value = cell;
      return;
    }
    const [dx, dy] = [e.clientX - last.x, e.clientY - last.y];
    down.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (down.size >= 2) {
      const [a, b] = [...down.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) set({ zoom: clampZoom(view.value.zoom * (dist / pinch)) }, false);
      pinch = dist;
      travel = Infinity;
      return;
    }
    travel += Math.abs(dx) + Math.abs(dy);
    if (travel < DRAG_PX) return;
    const v = view.value;
    if (rotateMode.value) set({ rotation: v.rotation + dx * ORBIT_DEG_PER_PX }, false);
    else {
      const g = dragToGround(dx, dy, world.scale, elevation(v), azimuth(v));
      set({ panX: v.panX - g.x, panZ: v.panZ - g.z }, false);
    }
  });
  const up = (e: PointerEvent) => {
    if (!down.delete(e.pointerId)) return;
    if (down.size > 0 || travel >= DRAG_PX || world.moving || e.button === 2) return;
    const r = canvas.getBoundingClientRect();
    if (targeting.value) {
      const at = world.pick(e.clientX - r.left, e.clientY - r.top);
      if (at) cast(at, e.shiftKey);
      lastPick = null;
      return;
    }
    // A creep under the pointer wins over the cell beneath it.
    const creep = world.creepAt(e.clientX - r.left, e.clientY - r.top);
    if (creep !== null) {
      selected.value = null;
      selectedCreep.value = creep;
      lastPick = null;
      announcement.value = 'Selected a creep';
      return;
    }
    const cell = world.pick(e.clientX - r.left, e.clientY - r.top);
    const now = e.timeStamp;
    const again =
      cell &&
      lastPick &&
      lastPick.cell.x === cell.x &&
      lastPick.cell.y === cell.y &&
      now - lastPick.time <= DOUBLE_PICK_MS;
    lastPick = again || !cell ? null : { cell, time: now };
    actions.select(cell);
    // A double click or double tap on an open cell or a stone places the gem straight away.
    if (again && canBuild(cell)) {
      send({ type: 'build', cell: { ...cell } });
      announcement.value = `Placing a gem at cell ${cell.x}, ${cell.y}`;
      return;
    }
    announcement.value = cell ? `Selected cell ${cell.x}, ${cell.y}` : 'Selection cleared';
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', (e) => down.delete(e.pointerId));
  canvas.addEventListener('pointerleave', () => (hovered.value = null));
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      set({ zoom: clampZoom(view.value.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)) }, false);
    },
    { passive: false },
  );

  // Keyboard board cursor: arrows move relative to the screen, Enter selects.
  canvas.tabIndex = 0;
  canvas.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && targeting.value) {
      targeting.value = null;
      announcement.value = 'Cancelled';
      e.stopPropagation();
    } else if (e.key === 'Enter' || e.key === ' ') {
      if (!cursor.value || world.moving) return;
      if (cast(cursor.value, e.shiftKey)) {
        e.preventDefault();
        return;
      }
      actions.select(cursor.value);
      announcement.value = `Selected cell ${cursor.value.x}, ${cursor.value.y}`;
    } else if (
      e.key === 'ArrowUp' ||
      e.key === 'ArrowDown' ||
      e.key === 'ArrowLeft' ||
      e.key === 'ArrowRight'
    ) {
      const from = cursor.value ?? selected.value ?? { x: 19, y: 19 };
      const step = cursor.value ? arrowStep(e.key, azimuth(view.value)) : { x: 0, y: 0 };
      const next = { x: from.x + step.x, y: from.y + step.y };
      if (!board.inside(next)) return;
      cursor.value = next;
      reveal(next);
      announcement.value = `Cell ${next.x}, ${next.y}`;
    } else if (e.key === 'b' || e.key === 'B') {
      if (cursor.value) send({ type: 'build', cell: cursor.value });
    } else if (e.key === '+' || e.key === '=') actions.zoomBy(1.25);
    else if (e.key === '-') actions.zoomBy(1 / 1.25);
    else return;
    e.preventDefault();
  });

  return actions;
}
export type CameraActions = ReturnType<typeof createCameraInput>;
