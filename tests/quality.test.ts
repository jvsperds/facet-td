import { expect, test } from 'vitest';
import { TIERS, getQuality, setQuality, weakDevice } from '../src/world/world';

test('weak devices: touch-first, small screens or little memory', () => {
  expect(weakDevice({ coarse: false, minSide: 900, memory: 8 })).toBe(false);
  expect(weakDevice({ coarse: true, minSide: 900, memory: 8 })).toBe(true);
  expect(weakDevice({ coarse: false, minSide: 390 })).toBe(true);
  expect(weakDevice({ coarse: false, minSide: 900, memory: 4 })).toBe(true);
});

test('the low tier caps pixel ratio, halves the shadow map and drops MSAA', () => {
  expect(TIERS.low.maxPixelRatio).toBeLessThanOrEqual(1.5);
  expect(TIERS.low.shadow).toBe(1024);
  expect(TIERS.low.antialias).toBe(false);
});

test('the quality choice is stored under facet-td:quality', () => {
  const store = new Map<string, string>();
  Object.assign(globalThis, {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    },
  });
  expect(getQuality()).toBe('auto');
  setQuality('low');
  expect(store.get('facet-td:quality')).toBe('low');
  expect(getQuality()).toBe('low');
});
