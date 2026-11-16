/** Offline progression numbers. They are intentionally centralized because the VPK has no prices. */
export const ECONOMY = Object.freeze({
  boxes: {
    hero: { cost: 30, duplicateRefund: 5, tierOdds: [60, 28, 10, 2] as const },
    skill: { cost: 40, duplicateRefund: 8, tierOdds: [55, 30, 12, 3] as const },
  },
  slotCosts: [50, 100, 200] as const,
  maxSkillLevel: 4,
  run: {
    wavesPerShell: 5,
    clearBonus: 5,
    difficultyMultiplier: [1, 1.5, 2, 3] as const,
    endlessWavesPerShell: 5,
  },
  questRewards: [3, 5, 8] as const,
});

export function shellReward(wavesCleared: number, difficulty: 1 | 2 | 3 | 4) {
  const waves = Math.max(0, Math.floor(wavesCleared));
  const classic = Math.floor(Math.min(waves, 50) / ECONOMY.run.wavesPerShell);
  const clear = waves >= 50 ? ECONOMY.run.clearBonus : 0;
  const endless = Math.floor(Math.max(0, waves - 50) / ECONOMY.run.endlessWavesPerShell);
  return Math.floor((classic + clear + endless) * ECONOMY.run.difficultyMultiplier[difficulty - 1]);
}
