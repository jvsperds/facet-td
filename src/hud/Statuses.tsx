import type { ComponentChildren } from 'preact';
import type { GameData } from '../data';
import type { Status } from '../sim/game';
import { displayName, skillName } from './names';

// Effect icons (GemTD's status row): one small tile per MVP level, aura, field, hero buff, creep
// modifier or shield, along the top of the command card. The stack count sits in the corner; the
// full effect, its source and time left are in the tile's tooltip and accessible name. Debuffs
// are edged red and pulse.

const ICONS: Record<string, ComponentChildren> = {
  mvp: <path d="M5 18h14 M5.5 15 4.5 7.5 9 11l3-5.5 3 5.5 4.5-3.5-1 7.5z" />,
  speed: <path d="M13 3 6 13h5l-1 8 7-10h-5z" />,
  damage: <path d="M5 19 15 9 M14 4h6v6 M9 15l-4-4 M7 21l-4-4" />,
  range: <path d="M12 3v4 M12 17v4 M3 12h4 M17 12h4 M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8" />,
  slow: <path d="M4 16c0-5 3-9 8-9s7 3 7 6-2 4-4 4H4 M19 13l2-3" />,
  armor: <path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6z" />,
  poison: <path d="M12 3s-6 7-6 11a6 6 0 0 0 12 0c0-4-6-11-6-11z" />,
  stun: <path d="M12 3l2 6h6l-5 4 2 6-5-4-5 4 2-6-5-4h6z" />,
  disarm: <path d="M5 5l14 14 M19 5 5 19" />,
  magic: <path d="M12 3v6 M12 15v6 M3 12h6 M15 12h6 M6 6l3 3 M15 15l3 3 M18 6l-3 3 M9 15l-3 3" />,
  rush: <path d="M4 6l6 6-6 6 M12 6l6 6-6 6" />,
  fire: <path d="M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-4 3-7 1 2 2 3 3 3 0-3-1-5 0-7z" />,
  hold: <path d="M7 5h10v14H7z M10 9v6 M14 9v6" />,
  other: <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8" />,
};

/** The icon for an effect, from its key or, failing that, what it does. */
function iconOf(s: Status) {
  const byKey: Record<string, string> = {
    mvp: 'mvp',
    disarmed: 'disarm',
    hold: 'hold',
    enraged: 'fire',
    enemy_zheguang: 'armor',
    enemy_high_armor: 'armor',
    runrunrun: 'rush',
  };
  if (byKey[s.key]) return byKey[s.key];
  const text = s.effects.join(' ');
  if (/Stunned|Rooted/.test(text)) return 'stun';
  if (/magic damage every/.test(text)) return 'poison';
  if (/attack speed/.test(text)) return 'speed';
  if (/attack range/.test(text)) return 'range';
  if (/% damage|damage taken/.test(text)) return 'damage';
  if (/move speed/.test(text)) return 'slow';
  if (/armor/.test(text)) return 'armor';
  if (/magic resistance|Magic immune/.test(text)) return 'magic';
  return 'other';
}

export function Statuses({ data, list }: { data: GameData; list: Status[] }) {
  if (!list.length) return null;
  return (
    <ul class="effects" role="list" aria-label="Effects">
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
            title={`${name}${s.count ? ` ${s.count}` : ''}: ${detail}`}
            aria-label={`${name}${s.count ? ` ${s.count}` : ''}: ${detail}`}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {ICONS[iconOf(s)]}
            </svg>
            {s.count !== undefined && <b class="tabular">{s.count}</b>}
          </li>
        );
      })}
    </ul>
  );
}
