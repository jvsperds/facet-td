import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadData } from '../src/data';
import {
  AUTOSAVE_KEY,
  bestRun,
  loadHistory,
  loadSavedRun,
  recordRun,
  saveRun,
} from '../src/profile/runs';
import { Sim } from '../src/sim/sim';

const data = loadData('classic');
const values = new Map<string, string>();

beforeEach(() => {
  values.clear();
  Object.assign(globalThis, {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  });
});
afterEach(() => Reflect.deleteProperty(globalThis, 'localStorage'));

describe('run persistence', () => {
  it('autosaves and restores the exact deterministic state', () => {
    const sim = new Sim(data, 91, { endless: false });
    sim.send(0, { type: 'build', cell: { x: 12, y: 12 } });
    sim.step();
    saveRun(sim);
    expect(values.has(AUTOSAVE_KEY)).toBe(true);
    expect(loadSavedRun(data)?.stateHash()).toBe(sim.stateHash());
  });

  it('records finished runs once and chooses the strongest best score', () => {
    const a = new Sim(data, 1);
    Object.assign(a.game.stats, { result: 'lost', wavesCleared: 12, killScore: 100 });
    recordRun(a);
    recordRun(a);
    const b = new Sim(data, 2);
    Object.assign(b.game.stats, { result: 'won', wavesCleared: 50, killScore: 90 });
    recordRun(b);
    expect(loadHistory()).toHaveLength(2);
    expect(bestRun()?.seed).toBe(2);
  });
});
