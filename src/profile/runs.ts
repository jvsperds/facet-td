import type { GameData } from '../data';
import type { RunConfig } from '../sim/config';
import { Sim, type SaveEnvelope } from '../sim/sim';
import type { RunStats } from '../sim/stats';

export const AUTOSAVE_KEY = 'facet-td:autosave';
export const HISTORY_KEY = 'facet-td:run-history';

export interface RunRecord {
  id: string;
  finishedAt: string;
  seed: number;
  config: RunConfig;
  stats: RunStats;
}

export function saveRun(sim: Sim) {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(sim.save()));
  } catch {
    // Autosave is optional when storage is unavailable.
  }
}

export function loadSavedRun(data: GameData): Sim | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    return raw ? Sim.restore(data, JSON.parse(raw) as SaveEnvelope) : null;
  } catch {
    clearSavedRun();
    return null;
  }
}

export function hasSavedRun() {
  try {
    return localStorage.getItem(AUTOSAVE_KEY) !== null;
  } catch {
    return false;
  }
}

export function clearSavedRun() {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    // Nothing else to do.
  }
}

export function loadHistory(): RunRecord[] {
  try {
    const rows = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
    return Array.isArray(rows) ? rows.slice(0, 50) : [];
  } catch {
    return [];
  }
}

export function recordRun(sim: Sim): RunRecord {
  const row: RunRecord = {
    id: `${sim.seed}:${sim.tick}:${sim.game.stats.result}`,
    finishedAt: new Date().toISOString(),
    seed: sim.seed,
    config: { ...sim.config, skills: { ...sim.config.skills } },
    stats: structuredClone(sim.game.stats) as RunStats,
  };
  const history = loadHistory();
  if (!history.some((r) => r.id === row.id)) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify([row, ...history].slice(0, 50)));
    } catch {
      // History remains unavailable for this browser.
    }
  }
  clearSavedRun();
  return row;
}

export function bestRun(history = loadHistory()) {
  return [...history].sort(
    (a, b) =>
      b.stats.wavesCleared - a.stats.wavesCleared ||
      b.stats.killScore - a.stats.killScore ||
      a.stats.ticks - b.stats.ticks,
  )[0];
}
