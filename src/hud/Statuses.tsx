import type { GameData } from '../data';
import type { Status } from '../sim/game';
import { displayName, skillName } from './names';

const art = import.meta.glob<string>('./status-art/*.png', {
  eager: true,
  import: 'default',
  query: '?url',
});
const FAMILY: Record<string, string> = {
  mvp: 'crit',
  speed: 'speed',
  damage: 'cleave',
  range: 'range',
  slow: 'frost',
  armor: 'calm',
  poison: 'poison',
  stun: 'stun',
  disarm: 'disarm',
  magic: 'bolt',
  rush: 'speed',
  fire: 'fire',
  hold: 'disarm',
  aura: 'aura',
  split: 'split',
  splash: 'cleave',
  critical: 'crit',
  shield: 'calm',
  heal: 'aura',
  fly: 'speed',
  pierce: 'pierce',
  might: 'disarm',
  sight: 'sight',
  aim: 'aim',
};

export function StatusIcon({ kind }: { kind: string }) {
  return (
    <img
      class="effect-art"
      src={art[`./status-art/${FAMILY[kind] ?? 'star'}.png`]}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}

// Effect icons (GemTD's status row): one small tile per MVP level, aura, field, hero buff, creep
// modifier or shield, along the top of the command card. The stack count sits in the corner; the
// full effect, its source and time left are in the tile's tooltip and accessible name. Debuffs
// are edged red and pulse.

const NAMED: [RegExp, string][] = [
  [/^(Slow|Ice|Freezing)/, 'slow'],
  [/^Cleave/, 'splash'],
  [/^Crit/, 'critical'],
  [/^(Damage|Inspire)/, 'might'],
  [/^(Pierce|Corrupt|Decadent)/, 'pierce'],
  [/^Aura/, 'aura'],
  [/^True sight/, 'sight'],
  [/^Resist/, 'shield'],
  [/^Poison/, 'poison'],
  [/^Burn/, 'fire'],
  [/^(Stun|Stone Gaze)/, 'stun'],
  [/^(Lightning|Forked Lightning)/, 'magic'],
  [/^(Split|Radiation)/, 'split'],
  [/^(Anti-fly|Overlook|Monkey King Bar)/, 'aim'],
];

/** An ability's level from its name ("Cleave 2" → "2", "Damage MAX" → "M"), or undefined. */
export function levelOf(name: string) {
  const m = /\s*(\d+|MAX)$/.exec(name);
  return m ? (m[1] === 'MAX' ? 'M' : m[1]) : undefined;
}

/** The icon for an ability or effect from its name (when given first) and what it says it does. */
export function iconForText(text: string) {
  // The ability's name first: it names the effect exactly where the description only implies it.
  for (const [re, kind] of NAMED) if (re.test(text)) return kind;
  if (/Stunned|Rooted|stun/i.test(text)) return 'stun';
  if (/magic damage every|poison/i.test(text)) return 'poison';
  if (/attack speed/i.test(text)) return 'speed';
  if (/attack range/i.test(text)) return 'range';
  if (/% damage|damage taken|critical/i.test(text)) return 'damage';
  if (/move(ment)? speed|slow/i.test(text)) return 'slow';
  if (/armor/i.test(text)) return 'armor';
  if (/magic resistance|Magic immune|immune/i.test(text)) return 'magic';
  if (/heal|regenerat|restore/i.test(text)) return 'heal';
  if (/shield|block|evasion|evade/i.test(text)) return 'shield';
  if (/fly|flying|air/i.test(text)) return 'fly';
  if (/fast|haste|rush|speed/i.test(text)) return 'rush';
  return 'other';
}

/** The icon for an effect, from its key or, failing that, what it does. */
function iconOf(data: GameData, s: Status) {
  const byKey: Record<string, string> = {
    mvp: 'mvp',
    disarmed: 'disarm',
    hold: 'hold',
    enraged: 'fire',
    enemy_zheguang: 'armor',
    enemy_high_armor: 'armor',
    runrunrun: 'rush',
  };
  return byKey[s.key] ?? iconForText(`${skillName(data, s.key)} ${s.effects.join(' ')}`);
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
            <StatusIcon kind={iconOf(data, s)} />
            {(s.count ?? levelOf(name)) !== undefined && (
              <b class="tabular">{s.count ?? levelOf(name)}</b>
            )}
          </li>
        );
      })}
    </ul>
  );
}
