import { expect, test } from 'vitest';
import {
  CREEP_SCALE,
  MAX_GROUND_WIDTH,
  clearancePush,
  creepPartScale,
  creepRadius,
} from '../src/world/clearance';

// Issue #11: creep models stay out of the walls.

test('ground creeps fit a one-cell corridor; small and flying creeps keep their scale', () => {
  expect(creepPartScale(1, false)).toBe(CREEP_SCALE);
  expect(creepPartScale(5, true)).toBe(CREEP_SCALE);
  for (const modelScale of [1, 1.5, 2.2, 5, 6]) {
    const s = creepPartScale(modelScale, false);
    expect(creepRadius(modelScale, s) * 2).toBeLessThanOrEqual(MAX_GROUND_WIDTH + 1e-9);
  }
  // Bigger creeps are never drawn smaller than smaller ones.
  const width = (m: number) => creepRadius(m, creepPartScale(m, false));
  expect(width(2.2)).toBeGreaterThanOrEqual(width(1));
});

test('nothing pushes a creep in an open field or down the middle of a corridor', () => {
  const corridor = (x: number, y: number) => y === 9 || y === 11;
  expect(clearancePush(10, 10, 0.42, () => false)).toEqual({ x: 0, y: 0 });
  expect(clearancePush(10.3, 10, 0.42, corridor)).toEqual({ x: 0, y: 0 });
});

test('a diagonal step past a wall corner slides the body around it', () => {
  const wall = (x: number, y: number) => x === 11 && y === 10;
  // Halfway between (10, 10) and (11, 11): the centre sits on the wall cell's corner region.
  const p = clearancePush(10.6, 10.6, 0.4, wall);
  // Away from the wall cell's centre (11, 10).
  expect(p.x * (10.6 - 11) + p.y * (10.6 - 10)).toBeGreaterThan(0);
  const [x, y] = [10.6 + p.x, 10.6 + p.y];
  // Afterwards the body no longer overlaps the wall square.
  const nx = Math.max(10.5, Math.min(x, 11.5));
  const ny = Math.max(9.5, Math.min(y, 10.5));
  expect(Math.hypot(x - nx, y - ny)).toBeGreaterThanOrEqual(0.4 - 1e-9);
});

test('the push is bounded by the radius even between several walls', () => {
  const all = (x: number, y: number) => !(x === 10 && y === 10);
  const p = clearancePush(10.2, 10.1, 0.45, all);
  expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(0.45 + 1e-9);
});
