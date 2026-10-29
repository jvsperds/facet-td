import { expect, test } from 'vitest';
import { CREEP_SCALE, MAX_GROUND_WIDTH, creepPartScale, creepRadius } from '../src/world/clearance';

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
