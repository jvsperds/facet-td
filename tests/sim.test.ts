import { expect, test } from 'vitest';
import { loadData } from '../src/data';
import { Rng } from '../src/sim/rng';
import { Sim } from '../src/sim/sim';

const data = loadData('classic', { 'x.json': { a: 1 } }, {});

function play(seed: number) {
  const sim = new Sim(data, seed, 4);
  for (let t = 0; t < 300; t++) {
    if (t % 7 === 0) sim.send(t % 4, { type: 'noop' });
    sim.rng.u32(); // stand-in for rules consuming randomness each tick
    sim.step();
  }
  return sim;
}

test('same seed + same commands = same state', () => {
  expect(play(42).stateHash()).toBe(play(42).stateHash());
  expect(play(42).stateHash()).not.toBe(play(43).stateHash());
});

test('rng stream matches reference mulberry32 (seed 1 -> 0.62707394)', () => {
  const r = new Rng(1);
  expect([r.u32(), r.u32(), r.u32()]).toEqual([2693262067, 11749833, 2265367787]);
  const d = new Rng(7);
  const rolls = Array.from({ length: 1000 }, () => d.int(1, 6));
  expect(new Set(rolls)).toEqual(new Set([1, 2, 3, 4, 5, 6]));
});
