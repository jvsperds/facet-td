import type { GameData } from '../data';
import type { Status } from '../sim/game';
import { displayName, skillName } from './names';

// Status cards (GemTD's buff and debuff row): one card per MVP level, aura, field, hero buff,
// creep modifier or shield, with its stack count and time left. The full effect is in the card's
// tooltip and accessible name.

export function Statuses({ data, list }: { data: GameData; list: Status[] }) {
  if (!list.length) return null;
  return (
    <>
      <h3 class="section-label">Effects</h3>
      <ul class="effects" role="list">
        {list.map((s, i) => {
          const name = skillName(data, s.key);
          const detail = [
            ...s.effects,
            ...(s.from ? [`from ${displayName(data, s.from)}`] : []),
            ...(s.left !== undefined ? [`${Math.ceil(s.left)}s left`] : []),
          ].join(', ');
          return (
            <li
              key={`${s.key}:${i}`}
              class={`effect ${s.good ? 'good' : 'bad'}`}
              title={`${name}: ${detail}`}
              aria-label={`${name}${s.count ? ` ${s.count}` : ''}: ${detail}`}
            >
              <span class="effect-name">{name}</span>
              {s.count !== undefined && <span class="effect-count tabular">{s.count}</span>}
              {s.left !== undefined && (
                <span class="effect-time tabular">{Math.ceil(s.left)}s</span>
              )}
              <span class="effect-line">{s.effects[0] ?? ''}</span>
            </li>
          );
        })}
      </ul>
    </>
  );
}
