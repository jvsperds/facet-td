/**
 * Run statistics, collected by the sim as the game plays (deterministic, part of the state hash).
 * Read them through `Game.stats`; quests (quests.ts) and the end-of-run card are built from them.
 */
export interface RunStats {
  /** Ticks simulated until the run ended (or so far). */
  ticks: number;
  /** Waves the castle survived, endless waves included. */
  wavesCleared: number;
  /** Creeps killed by towers or effects (leaks are not kills). */
  kills: number;
  /**
   * The original's kill score (`_G.kills`, OnEntityKilled line 6390): 1 per creep, 2 per elite,
   * 10 per boss or tester, plus 3 for the rare 20/30/40 bosses and 5 for the gold/platinum Roshan.
   */
  killScore: number;
  /** `_G.extra_kill`: the bonus part of killScore from rare bosses (3 or 5) and elites (1 each). */
  extraKills: number;
  killsByUnit: Record<string, number>;
  /** Creeps that reached the castle, and the castle HP they took. */
  leaks: number;
  castleDamageTaken: number;
  goldEarned: number;
  goldSpent: number;
  /** Gold taken by thieves (enemy_thief). */
  goldStolen: number;
  /** Successful hero casts by ability name. */
  heroCasts: Record<string, number>;
  /** Gems kept from a draft (keep, downgrade, Fixed Hammer), by final name. */
  kept: Record<string, number>;
  /** Combination results by name, all kinds. */
  combined: Record<string, number>;
  /** Single-round (draft) combinations by result name: the draft and secret recipes. */
  draftCombined: Record<string, number>;
  /** Pedal (tablet) upgrades: three aligned pedals merging into a sparkling one. */
  tabletUpgrades: number;
  /** MVP awards given, and the most MVP-max (level 10) towers held when one was awarded. */
  mvpAwards: number;
  mvpMaxTowers: number;
  /** Highest creeps-per-wave count reached (wave_enemy_count, see WinStreakAdjust). */
  maxWaveEnemyCount: number;
  /** Castle HP when the run ended; null while it runs. */
  castleHpEnd: number | null;
  /** Lifetime damage per tower id, with the tower's latest name. */
  damageByTower: Record<number, { name: string; damage: number }>;
  result: 'won' | 'lost' | null;
}

export function emptyStats(enemyCount: number): RunStats {
  return {
    ticks: 0,
    wavesCleared: 0,
    kills: 0,
    killScore: 0,
    extraKills: 0,
    killsByUnit: {},
    leaks: 0,
    castleDamageTaken: 0,
    goldEarned: 0,
    goldSpent: 0,
    goldStolen: 0,
    heroCasts: {},
    kept: {},
    combined: {},
    draftCombined: {},
    tabletUpgrades: 0,
    mvpAwards: 0,
    mvpMaxTowers: 0,
    maxWaveEnemyCount: enemyCount,
    castleHpEnd: null,
    damageByTower: {},
    result: null,
  };
}

export const bump = (table: Record<string, number>, key: string, by = 1) => {
  table[key] = (table[key] ?? 0) + by;
};
