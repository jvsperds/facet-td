import type { GameData } from '../data';
import type { Game } from '../sim/game';
import { TowerIcon } from './TowerIcon';
import { compact, displayName, gemType } from './names';

// Damage meter (inspired by GemTD's damage panel): this wave's top towers and their share.

const TOP = 5;

export function DamageMeter({ data, game }: { data: GameData; game: Game }) {
  const dealt = game.damageThisWave;
  const total = Object.values(dealt).reduce((s, d) => s + d, 0);
  const rows = game.gems
    .map((g) => ({ g, d: dealt[g.id] ?? 0 }))
    .filter((r) => r.d > 0)
    .sort((a, b) => b.d - a.d || a.g.id - b.g.id)
    .slice(0, TOP);
  return (
    <section class="panel meter-panel dps" aria-label="Damage this wave">
      <div class="drawer-head">
        <h2 class="section-label">DPS · wave {game.level}</h2>
        <span class="muted tabular">{compact(total)}</span>
      </div>
      {rows.length === 0 ? (
        <p class="muted">No damage dealt yet this wave.</p>
      ) : (
        <ol class="damage-list">
          {rows.map(({ g, d }) => {
            const share = total ? d / total : 0;
            const type = gemType(g.name);
            return (
              <li class={type ? `gem-${type}` : ''} key={g.id}>
                <span
                  class="bar"
                  style={{ width: `${Math.max(2, share * 100)}%` }}
                  aria-hidden="true"
                />
                <TowerIcon name={g.name} class="glyph mini" />
                <span class="damage-name">{displayName(data, g.name)}</span>
                <span class="tabular">
                  {compact(d)} · {Math.round(share * 100)}%
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
