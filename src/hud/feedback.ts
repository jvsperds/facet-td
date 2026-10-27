import { signal } from '@preact/signals';
import { TICK_HZ, type Game } from '../sim/game';

export type Cue =
  'attack' | 'kill' | 'leak' | 'wave' | 'clear' | 'clear-leak' | 'won' | 'lost' | 'build';
export type Feedback = ReturnType<typeof createFeedback>;

export function createFeedback(game: Game) {
  const notice = signal({ text: 'Place five gems, then keep one to start wave 1.', danger: false });
  const reward = signal({ gold: 0, kills: 0 });
  let phase = game.phase;
  let level = game.level;
  let gems = game.draft.length;
  let warningTicks = 0;
  let status = notice.value.text;
  return {
    notice,
    reward,
    afterStep(): Cue | undefined {
      let cue: Cue | undefined;
      if (game.phase === 'wave' && phase !== 'wave') reward.value = { gold: 0, kills: 0 };
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
      const damage = game.events.reduce((sum, e) => sum + (e.type === 'leak' ? e.damage : 0), 0);
      if (warningTicks > 0 && --warningTicks === 0) notice.value = { text: status, danger: false };
      if (game.phase !== phase || game.level !== level) {
        if (game.phase === 'wave') {
          status = `Wave ${game.level} started. Defend the castle.`;
          cue = 'wave';
        } else if (game.phase === 'build') {
          status = `Wave ${level} cleared. Place five gems for wave ${game.level}.`;
          cue = 'clear';
        } else {
          status = game.phase === 'won' ? 'Victory! All 50 waves cleared.' : 'The castle fell.';
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
