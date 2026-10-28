import { expect, test } from 'vitest';
import { Rng } from '../src/sim/rng';
import { gaussianDamage } from '../src/sim/gaussian';

test('deterministic arithmetic matches original rounded Gaussian rolls and rejection draws', () => {
  for (let seed = 1; seed <= 2000; seed++) {
    const a = new Rng(seed),
      b = new Rng(seed);
    let normal = 9999;
    while (normal > 4 || normal < -4) {
      const u = b.int(1, 10000) / 10000,
        v = b.int(1, 10000) / 10000;
      normal = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }
    expect(gaussianDamage(a)).toBe(Math.max(30, Math.ceil(normal * 128 + 512)));
    expect(a.state).toBe(b.state);
  }
});
