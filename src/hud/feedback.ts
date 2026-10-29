import { signal } from '@preact/signals';
import { LAST_LEVEL, TICK_HZ, type Game } from '../sim/game';

export type Cue =
  'attack' | 'kill' | 'leak' | 'wave' | 'clear' | 'clear-leak' | 'won' | 'lost' | 'build';
export type Feedback = ReturnType<typeof createFeedback>;

export function createFeedback(game: Game) {
  const notice = signal({ text: 'Place five gems, then keep one to start wave 1.', danger: false });
  const reward = signal({ gold: 0, kills: 0 });
  /** Whole-run tallies for the top-right stats: creeps killed and creeps that reached the castle. */
  const totals = signal({ kills: 0, leaks: 0 });
  /** The last wave's MVP tower id, from the wave's end until the next wave starts. */
  const mvp = signal<number | null>(null);
  /** Sim ticks since the run began, and the tick the current round (build or wave) began. */
  let ticks = 0;
  const roundStart = signal(0);
  /** Tower MVP levels when the wave began; the one that rose at its end is the MVP. */
  let levels = new Map<number, number>();
  let phase = game.phase;
  let level = game.level;
  let gems = game.draft.length;
  let warningTicks = 0;
  let status = notice.value.text;
  return {
    notice,
    reward,
    totals,
    mvp,
    roundStart,
    /** Sim ticks seen so far. */
    get ticks() {
      return ticks;
    },
    afterStep(): Cue | undefined {
      let cue: Cue | undefined;
      ticks++;
      if (game.phase === 'wave' && phase !== 'wave') {
        reward.value = { gold: 0, kills: 0 };
        levels = new Map(game.gems.map((g) => [g.id, g.level ?? 0]));
        mvp.value = null;
      }
      if (game.phase === 'build' && phase === 'wave')
        mvp.value = game.gems.find((g) => (g.level ?? 0) > (levels.get(g.id) ?? 0))?.id ?? null;
      if (game.phase !== phase) roundStart.value = ticks;
      if (game.draft.length > gems) cue = 'build';
      gems = game.draft.length;
      if (game.events.some((e) => e.type === 'attack')) cue = 'attack';
      const kills = game.events.filter((e) => e.type === 'kill');
      if (kills.length) {
        reward.value = {
          gold: reward.value.gold + kills.reduce((sum, e) => sum + e.gold, 0),
          kills: reward.value.kills + kills.length,
        };
        cue = 'kill';
      }
      const leaks = game.events.filter((e) => e.type === 'leak').length;
      if (kills.length || leaks)
        totals.value = {
          kills: totals.value.kills + kills.length,
          leaks: totals.value.leaks + leaks,
        };
      const damage = game.events.reduce((sum, e) => sum + (e.type === 'leak' ? e.damage : 0), 0);
      if (warningTicks > 0 && --warningTicks === 0) notice.value = { text: status, danger: false };
      if (game.phase !== phase || game.level !== level) {
        if (game.phase === 'wave' && level === LAST_LEVEL) {
          status = `Victory! All ${LAST_LEVEL} waves cleared. Endless waves begin; hold as long as you can.`;
          cue = 'won';
        } else if (game.phase === 'wave') {
          status = `Wave ${game.level} started. Defend the castle.`;
          cue = 'wave';
        } else if (game.phase === 'build') {
          status = `Wave ${level} cleared. Place five gems for wave ${game.level}.`;
          cue = 'clear';
        } else {
          status =
            game.phase === 'lost'
              ? 'The castle fell.'
              : game.level > LAST_LEVEL
                ? `The castle fell on endless wave ${game.level}. Victory.`
                : `Victory! All ${LAST_LEVEL} waves cleared.`;
          cue = game.phase;
        }
        notice.value = { text: status, danger: game.phase === 'lost' };
        warningTicks = 0;
        phase = game.phase;
        level = game.level;
      }
      if (damage && game.phase !== 'lost' && game.phase !== 'won') {
        const cleared = cue === 'clear';
        notice.value = {
          text: `${cleared ? `Wave ${game.level - 1} cleared. ` : ''}Castle hit: −${damage} HP. ${game.castleHp} HP remaining.`,
          danger: true,
        };
        warningTicks = 3 * TICK_HZ;
        cue = cleared ? 'clear-leak' : 'leak';
      }
      return cue;
    },
  };
}
