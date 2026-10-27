import { expect, test } from 'vitest';
import {
  arrowStep,
  basis,
  dragToGround,
  ISO_ELEVATION,
  safeRect,
  toCell,
  toScene,
} from '../src/world/view';

test('scene and cell coordinates round-trip; board north is -Z', () => {
  expect(toScene({ x: 19, y: 19 })).toEqual({ x: 0, z: 0 });
  expect(toScene({ x: 19, y: 20 })).toEqual({ x: 0, z: -1 });
  expect(toCell(0.49, -1.4)).toEqual({ x: 19, y: 20 });
});

test('true iso ground diamonds are 1.732:1 at the preset', () => {
  const b = basis(ISO_ELEVATION, 45);
  // One cell's diagonals: (1,0,1) spans screen width, (1,0,-1) spans screen height.
  const w = Math.abs(b.right[0] * 1 + b.right[2] * -1);
  const h = Math.abs(b.up[0] * 1 + b.up[2] * 1);
  expect(w / h).toBeCloseTo(Math.sqrt(3), 3);
});

test('a ground drag moves the point under the pointer by exactly the screen delta', () => {
  for (const [e, a] of [
    [ISO_ELEVATION, 45],
    [90, 0],
    [ISO_ELEVATION, 200],
  ]) {
    const scale = 30;
    const g = dragToGround(12, -7, scale, e, a);
    const b = basis(e, a);
    expect((b.right[0] * g.x + b.right[2] * g.z) * scale).toBeCloseTo(12);
    expect(-(b.up[0] * g.x + b.up[2] * g.z) * scale).toBeCloseTo(-7);
  }
});

test('safe rect keeps the side of each panel that fits the board largest', () => {
  const vp = { x: 0, y: 0, w: 1000, h: 800 };
  const r = safeRect(
    vp,
    [
      { x: 0, y: 0, w: 1000, h: 64 },
      { x: 0, y: 700, w: 300, h: 100 },
    ],
    2,
    1,
  );
  expect(r).toEqual({ x: 0, y: 64, w: 1000, h: 636 });
  expect(safeRect(vp, [{ x: 2000, y: 0, w: 10, h: 10 }], 1, 1)).toEqual(vp);
});

test('arrow keys follow the screen as the board turns', () => {
  expect(arrowStep('ArrowUp', 0)).toEqual({ x: 0, y: 1 });
  expect(arrowStep('ArrowRight', 0)).toEqual({ x: 1, y: 0 });
  expect(arrowStep('ArrowUp', 45)).toEqual({ x: 0, y: 1 }); // iso preset rounds to north
  expect(arrowStep('ArrowUp', 90)).toEqual({ x: -1, y: 0 });
  expect(arrowStep('ArrowLeft', 180)).toEqual({ x: 1, y: 0 });
  expect(arrowStep('ArrowDown', -90)).toEqual({ x: -1, y: 0 });
});
