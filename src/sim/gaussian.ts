import type { Rng } from './rng';

// Arithmetic-only log and cosine keep Lua's Box–Muller roll stable across JS engines.
function log(value: number) {
  let exponent = 0;
  while (value < 1) {
    value *= 2;
    exponent--;
  }
  const z = (value - 1) / (value + 1),
    square = z * z;
  let term = z,
    sum = 0;
  for (let denominator = 1; denominator < 61; denominator += 2) {
    sum += term / denominator;
    term *= square;
  }
  return 2 * sum + exponent * 0.6931471805599453;
}
function cosine(angle: number) {
  if (angle > Math.PI) angle -= 2 * Math.PI;
  let term = 1,
    sum = 1;
  for (let n = 1; n <= 16; n++) {
    term *= (-angle * angle) / ((2 * n - 1) * 2 * n);
    sum += term;
  }
  return sum;
}

/** addon_game_mode.lua GaussRandom: reject outside four standard deviations, floor damage at 30. */
export function gaussianDamage(rng: Rng) {
  let normal = 9999;
  while (normal > 4 || normal < -4) {
    const u = rng.int(1, 10000) / 10000,
      v = rng.int(1, 10000) / 10000;
    normal = Math.sqrt(-2 * log(u)) * cosine(2 * Math.PI * v);
  }
  return Math.max(30, Math.ceil(normal * 128 + 512));
}
