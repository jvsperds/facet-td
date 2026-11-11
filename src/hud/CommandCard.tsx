import { signal, useSignal } from '@preact/signals';
import type { ComponentChildren } from 'preact';
import { useEffect, useId } from 'preact/hooks';
import { CELL_UNITS, type Cell } from '../sim/board';
import {
  AIM,
  AIM_BOSS,
  DRAFT_SIZE,
  TICK_HZ,
  isBasicGem,
  qualityOf,
  type Check,
  type Game,
} from '../sim/game';
import { readHeroCatalog } from '../sim/hero';
import type { RecipeKind } from '../sim/progression';
import type { Cmd, Sim } from '../sim/sim';
import { announcement, refusal, selected, selectedCreep, targeting } from '../input/camera';
import { Icon, ICONS } from './icons';
import {
  QUALITY,
  code,
  compact,
  displayName,
  isTablet,
  roleOf,
  skillName,
  skillText,
} from './names';
import { StatusIcon, Statuses, iconForText, levelOf } from './Statuses';
import { WIP } from './flags';
import { CreepIcon, TowerIcon } from './TowerIcon';

// The command card: Dota 2's bottom bar, as Gem TD shows it. A portrait with the unit's name over
// it, its stats down the right edge and its level in the corner; then the buffs and debuffs, one
// line of abilities and actions with their hotkeys above, and the health and mana bars. It shows
// the builder (Q places a gem, W removes a stone; with `?wip`, E D F R are the hero's skills) when
// nothing is selected, and otherwise the selected cell, gem, tower or creep.

const WAYPOINT_NAMES = [
  'Spawn (S)',
  'Checkpoint 1',
  'Checkpoint 2',
  'Checkpoint 3',
  'Checkpoint 4',
  'Checkpoint 5',
  'Castle exit (E)',
];
const XP_LEVELS = [0, 250, 650, 1200, 1900];
const CASTLE_MAX = 100;
/** Hero skill hotkeys, in skill order, after the hero's own Q (place gem) and W (remove stone). */
export const SKILL_KEYS = ['E', 'D', 'F', 'R'];
const COMMAND_ICONS: Partial<Record<Cmd['type'], keyof typeof ICONS>> = {
  build: 'stone',
  remove: 'close',
  keep: 'check',
  downgrade: 'down',
};

/** An effect-style icon (Statuses.tsx) for a passive ability. */
const effectIcon = (key: string) => <StatusIcon kind={key} />;

/** The hero's castable skills, in hotkey order. */
export const heroSkills = (game: Game) =>
  game
    .heroActions()
    .filter((a) => a.supported)
    .slice(0, SKILL_KEYS.length);

/** Arm Q or W: the next picked cell gets the command (toggles off if already armed). */
export function arm(type: 'build' | 'remove') {
  targeting.value = targeting.value === type ? null : type;
  announcement.value = targeting.value
    ? type === 'build'
      ? 'Place gem: pick a cell'
      : 'Remove stone: pick a stone'
    : 'Cancelled';
  if (targeting.value) document.querySelector<HTMLCanvasElement>('body > canvas')?.focus();
}
const same = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;
/** A tablet waiting for its cell: it stays pending while the player selects where to put it. */
export const pending = signal<{ id: number; kind: RecipeKind; result: string } | null>(null);

/** What a hero skill cast at the current selection aims at: a gem, a stone, or a point. */
export function heroTarget(game: Game) {
  const point = selected.value ?? undefined;
  const target = point
    ? (game.gemAt(point)?.id ?? (game.stoneAt(point) ? -(point.y * 64 + point.x) : undefined))
    : undefined;
  return { point, target };
}

/** Rich hover and focus tooltip (Dota's ability tooltip): name, hotkey, level and what it does. */
function Tip(p: {
  id: string;
  title: string;
  hint?: string;
  level?: string;
  text?: string;
  reason?: string;
}) {
  return (
    <span class="tip" id={p.id} role="tooltip">
      <span class="tip-head">
        <b>{p.title}</b>
        {p.hint && <kbd>{p.hint}</kbd>}
        {p.level && <span class="tip-level">{p.level}</span>}
      </span>
      {p.text && <span class="tip-text">{p.text}</span>}
      {p.reason && <span class="tip-reason">{p.reason}</span>}
    </span>
  );
}

/** An ability slot: an icon square, the hotkey above it, the full description in its tooltip. */
function Command(p: {
  label: string;
  hint?: string;
  check?: Check;
  primary?: boolean;
  glow?: boolean;
  icon?: ComponentChildren;
  /** A small line above the label, e.g. "Combine". */
  caption?: string;
  /** Tooltip body; the label is its title. */
  text?: string;
  level?: string;
  /** Seconds of cooldown left, drawn over the icon. */
  cooldown?: number;
  pressed?: boolean;
  /** A wide button with its label shown (the empty cell's Place gem). */
  wide?: boolean;
  /** When refused, stay pressable and call this (so a tap can explain why) instead of disabling. */
  onRefused?: () => void;
  onClick: () => void;
}) {
  const id = useId();
  const refused = p.check && !p.check.ok ? p.check.reason : undefined;
  const soft = !!refused && !!p.onRefused;
  return (
    <div class="slot-cell">
      <kbd class="slot-key" aria-hidden="true">
        {p.hint ?? ''}
      </kbd>
      <button
        aria-label={p.caption ? `${p.caption}: ${p.label}` : p.label}
        aria-describedby={id}
        class={`cmd ${p.primary ? 'primary' : ''} ${p.glow ? 'glow' : ''} ${p.wide ? 'wide' : ''} ${soft ? 'refused' : ''}`}
        disabled={!!refused && !soft}
        aria-disabled={soft || undefined}
        aria-keyshortcuts={p.hint}
        aria-pressed={p.pressed}
        onClick={soft ? p.onRefused : p.onClick}
      >
        <span class="cmd-icon">{p.icon ?? <span class="cmd-letter">{p.label[0]}</span>}</span>
        {p.cooldown ? <span class="cmd-cooldown tabular">{p.cooldown}</span> : null}
        <span class="cmd-label">{p.label}</span>
      </button>
      <Tip
        id={id}
        title={p.caption ? `${p.caption}: ${p.label}` : p.label}
        hint={p.hint}
        level={p.level}
        text={p.text}
        reason={refused}
      />
    </div>
  );
}

/** A passive ability slot: not a command, so focusable only to read its tooltip. */
function Passive({ name, text, icon }: { name: string; text: string; icon?: ComponentChildren }) {
  const id = useId();
  return (
    <div class="slot-cell">
      <kbd class="slot-key" aria-hidden="true" />
      <span
        class="cmd passive"
        tabIndex={0}
        role="img"
        aria-label={`${name}: ${text}`}
        aria-describedby={id}
      >
        <span class="cmd-icon">{icon ?? <span class="cmd-letter">{name[0]}</span>}</span>
        <span class="cmd-label">{name}</span>
        <span class="passive-description">{text}</span>
      </span>
      <Tip id={id} title={name} level="Passive" text={text} />
    </div>
  );
}

/** An empty ability or item slot, so the bar keeps Dota's fixed grid. */
const Empty = ({ hint }: { hint?: string }) => (
  <div class="slot-cell" aria-hidden="true">
    <kbd class="slot-key">{hint ?? ''}</kbd>
    <span class="cmd empty" />
  </div>
);

type Stat = [icon: keyof typeof ICONS, label: string, value: ComponentChildren, sub?: string];
type Bar = { label: string; value: number; max: number; text: string; kind: 'hp' | 'mana' };

/** A Dota resource bar (green health, blue mana) with its numbers centred. */
function ResourceBar({ bar }: { bar: Bar }) {
  const share = bar.max > 0 ? Math.max(0, Math.min(1, bar.value / bar.max)) : 0;
  return (
    <div
      class={`bar ${bar.kind} ${bar.kind === 'hp' && share < 0.3 ? 'low' : ''}`}
      role="meter"
      aria-label={bar.label}
      aria-valuemin={0}
      aria-valuemax={bar.max}
      aria-valuenow={Math.ceil(bar.value)}
    >
      <i style={{ width: `${share * 100}%` }} />
      <span class="tabular">{bar.text}</span>
    </div>
  );
}

/**
 * The bottom bar's frame, after Dota's: the portrait (name over it, stats down its right edge,
 * level in its corner), then the effects row, the abilities and actions in one line with their
 * hotkeys above, and the health and mana bars.
 */
function Card(p: {
  portrait: ComponentChildren;
  /** The level disc in the portrait's corner, e.g. a gem's quality or the build level. */
  badge?: string;
  badgeTitle?: string;
  name: string;
  subtitle?: string;
  stats?: Stat[];
  /** Free text under the bars: what the cell is, why an action is refused. */
  children?: ComponentChildren;
  effects?: ComponentChildren;
  abilities?: ComponentChildren;
  actions?: ComponentChildren;
  bars?: Bar[];
  kind?: string;
}) {
  // Short screens start with the card collapsed to its abilities so the board keeps room.
  const collapsed = useSignal(matchMedia('(max-width: 600px), (max-height: 500px)').matches);
  // Not measured for the camera fit: a reserved dock (Hud.tsx) keeps the board still when the card
  // opens, so a second tap lands on the cell the first one selected.
  return (
    <div class="selection-stack">
      {p.effects && <div class="card-effects">{p.effects}</div>}
      <section
        class={`card ${p.kind ?? ''} ${collapsed.value ? 'collapsed' : ''}`}
        aria-label="Selection"
      >
        <div class="card-portrait">
          <h2 class="portrait-name" title={p.name}>
            {p.name}
          </h2>
          <div class="portrait-art">{p.portrait}</div>
          <p class="selection-subtitle">{p.subtitle}</p>
          {p.stats && p.stats.length > 0 && (
            <dl class="stats tabular">
              {p.stats.map(([icon, k, v, sub]) => (
                <div key={k} title={sub ? `${k}: ${sub}` : k}>
                  <Icon name={icon} />
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                  {sub && <dd class="sr-only">{sub}</dd>}
                </div>
              ))}
            </dl>
          )}
          {p.badge && (
            <span class="level-disc tabular" title={p.badgeTitle}>
              {p.badge}
            </span>
          )}
        </div>
        <div class="card-main">
          <div class="card-head">
            {p.subtitle && <p class="sr-only">{p.subtitle}</p>}
            <span class="spacer" />
            <button
              class="icon-button collapse"
              aria-label={collapsed.value ? 'Show details' : 'Hide details'}
              aria-expanded={!collapsed.value}
              aria-controls="info-body"
              onClick={() => (collapsed.value = !collapsed.value)}
            >
              <Icon name={collapsed.value ? 'chevronUp' : 'chevronDown'} />
            </button>
          </div>
          <div class="abilities" role="group" aria-label="Commands">
            {p.abilities}
          </div>
          <div class="card-body" id="info-body">
            {p.bars?.map((b) => (
              <ResourceBar key={b.label} bar={b} />
            ))}
            {p.children}
          </div>
        </div>
        {p.actions && (
          <section class="selection-actions" aria-label="Selected gem commands">
            <div class="context-commands">{p.actions}</div>
          </section>
        )}
      </section>
    </div>
  );
}

/** A tower's skills from its unit (Ability1..n), skipping internal ones with no tooltip. */
function towerSkills(sim: Sim, name: string): [string, string, string][] {
  return Object.entries(sim.game.unit(name) ?? {})
    .filter(([k, v]) => /^Ability\d+$/.test(k) && v)
    .map(([, k]) => [skillName(sim.data, String(k)), skillText(sim.data, String(k))] as const)
    .filter(([, text]) => text)
    .map(([n, text]) => [n, text, iconForText(`${n} ${text}`)]);
}

/**
 * Abilities as a row of icons over one description panel (GemTD/Dota): the card keeps one height
 * whether a tower has one ability or five. Hover or focus an icon to read it; the first shows by default.
 */
function AbilityList({ items }: { items: [string, string, string][] }) {
  const active = useSignal(0);
  const [name, text] = items[Math.min(active.value, items.length - 1)];
  return (
    <>
      <ul class="ability-strip" role="list">
        {items.map(([n, t, icon], i) => (
          <li key={n}>
            <button
              class={`ability-icon ${i === active.value ? 'active' : ''}`}
              aria-label={`${n}: ${t}`}
              aria-pressed={i === active.value}
              onMouseEnter={() => (active.value = i)}
              onFocus={() => (active.value = i)}
              onClick={() => (active.value = i)}
            >
              {effectIcon(icon)}
              {levelOf(n) && <b class="ability-level tabular">{levelOf(n)}</b>}
            </button>
          </li>
        ))}
      </ul>
      <p class="ability-detail" aria-hidden="true">
        <b>{name}</b> {text}
      </p>
    </>
  );
}

/** Hero skills on E, D, F, R, cast at the current selection; free keys show empty slots. */
function HeroSkills({ sim, send, empty }: { sim: Sim; send: (cmd: Cmd) => void; empty?: boolean }) {
  const game = sim.game;
  if (!game.hero.selected) return null;
  const { point, target } = heroTarget(game);
  const skills = heroSkills(game);
  return (
    <>
      {SKILL_KEYS.map((key, i) => {
        const a = skills[i];
        if (!a) return empty ? <Empty key={key} hint={key} /> : null;
        const check = game.canHeroAction(a.name, target, point, sim.tick);
        const left = Math.max(0, Math.ceil(((game.hero.cooldowns[a.name] ?? 0) - sim.tick) / 30));
        return (
          <Command
            key={a.name}
            label={skillName(sim.data, a.name)}
            hint={key}
            check={check}
            level={`Level ${a.level}`}
            text={skillText(sim.data, a.name)}
            cooldown={left}
            onClick={() => send({ type: 'hero-cast', action: a.name, target, point })}
          />
        );
      })}
    </>
  );
}

/** Nothing selected: the hero, with Q/W building and the hero's skills (GemTD's idle card). */
function HeroCard({
  sim,
  send,
  openHero,
}: {
  sim: Sim;
  send: (cmd: Cmd) => void;
  openHero: () => void;
  tick: number;
}) {
  const game = sim.game;
  const catalog = readHeroCatalog(sim.data);
  const unit = catalog.heroes[game.hero.selected];
  const name = unit ? skillName(sim.data, unit).replace(/^Npc dota hero /i, '') : 'Builder';
  const level = game.heroLevel;
  const next = XP_LEVELS[level];
  return (
    <Card
      kind="hero"
      portrait={
        <svg class="hero-mark" viewBox="0 0 24 24" aria-hidden="true">
          {ICONS.hero}
        </svg>
      }
      name={name}
      badge={String(level)}
      badgeTitle={
        next ? `Build level ${level}: ${game.xp}/${next} XP` : `Build level ${level} (max)`
      }
      subtitle={
        game.phase === 'build'
          ? `Place gem ${Math.min(game.draft.length + 1, DRAFT_SIZE)} of 5 · Q, then pick a cell`
          : 'Select a tower or creep to inspect it'
      }
      stats={[
        ['flag', 'Build lv', String(level), next ? `${game.xp}/${next} XP` : 'max'],
        ['coin', 'Gold', compact(game.gold)],
        ['tower', 'Towers', String(game.gems.length)],
        ['stone', 'Stones', String(game.stones.size)],
      ]}
      abilities={
        <>
          {WIP &&
            (game.hero.selected ? (
              <HeroSkills sim={sim} send={send} empty />
            ) : (
              SKILL_KEYS.map((k) => <Empty key={k} hint={k} />)
            ))}
        </>
      }
      bars={[
        {
          label: 'Castle',
          kind: 'hp',
          value: Math.max(0, game.castleHp),
          max: CASTLE_MAX,
          text: `${Math.max(0, game.castleHp)} / ${CASTLE_MAX}`,
        },
        {
          label: 'Gems placed',
          kind: 'mana',
          value: game.draft.length,
          max: DRAFT_SIZE,
          text: `${game.draft.length} / ${DRAFT_SIZE}`,
        },
      ]}
    >
      {WIP && (
        <button
          class="hero-button"
          aria-label="Hero"
          aria-haspopup="dialog"
          aria-keyshortcuts="H"
          onClick={openHero}
        >
          {game.hero.selected ? 'Hero & skills' : 'Choose hero'} <kbd aria-hidden="true">H</kbd>
        </button>
      )}
    </Card>
  );
}

/** A creep: health, defences, castle damage, its abilities and the effects on it. */
function CreepCard({ sim, id }: { sim: Sim; id: number; tick: number }) {
  const game = sim.game;
  const creep = game.creeps.find((c) => c.id === id);
  // Killed or arrived: drop the selection.
  useEffect(() => {
    if (!creep) {
      selectedCreep.value = null;
      announcement.value = 'The selected creep is gone';
    }
  }, [creep]);
  if (!creep) return null;
  const stats = game.creepStats(creep);
  const speed = Math.round(stats.speed * CELL_UNITS * TICK_HZ);
  const baseSpeed = Math.round(creep.speed * CELL_UNITS * TICK_HZ);
  const skills = game.creepSkills(creep);
  return (
    <Card
      kind="creep"
      portrait={<CreepIcon name={creep.name} />}
      name={`${creep.elite ? 'Elite ' : ''}${displayName(sim.data, creep.name)}`}
      badge={String(game.level)}
      badgeTitle={`Wave ${game.level}`}
      subtitle={[
        creep.boss ? 'Boss' : 'Creep',
        creep.fly ? 'Flying' : 'Ground',
        `wave ${game.level}`,
      ].join(' · ')}
      effects={<Statuses data={sim.data} list={game.creepStatuses(creep)} />}
      stats={[
        [
          'shield',
          'Armor',
          String(+stats.armor.toFixed(1)),
          stats.armor !== creep.armor ? `base ${creep.armor}` : undefined,
        ],
        ['sparkle', 'Magic res.', `${Math.round(stats.magicResist)}%`],
        ['boot', 'Speed', String(speed), speed !== baseSpeed ? `base ${baseSpeed}` : undefined],
        [
          'castle',
          'Castle dmg',
          creep.boss
            ? `${Math.ceil(Math.max(0, creep.hp / creep.maxHp) * 100)}`
            : String(creep.damage),
          'if it arrives',
        ],
      ]}
      abilities={
        skills.length
          ? skills.map((k) => (
              <Passive
                key={k}
                name={skillName(sim.data, k)}
                text={skillText(sim.data, k) || 'Creep ability'}
                icon={effectIcon(
                  iconForText(`${skillName(sim.data, k)} ${skillText(sim.data, k)}`),
                )}
              />
            ))
          : undefined
      }
      bars={[
        {
          label: 'Health',
          kind: 'hp',
          value: creep.hp,
          max: creep.maxHp,
          text: `${compact(Math.ceil(creep.hp))} / ${compact(creep.maxHp)}`,
        },
      ]}
    />
  );
}

/** A cell: open floor, a stone, a waypoint, a gem or a tower, with its commands. */
function CellCard({
  sim,
  send,
  cell,
}: {
  sim: Sim;
  send: (cmd: Cmd) => void;
  cell: Cell;
  /** Changes every HUD tick, so the card redraws with the sim. */
  tick: number;
}) {
  const game = sim.game;
  const gem = game.gemAt(cell);
  const kind = sim.board.kind(cell);
  // Open floor shows a card only while placing: its Place gem button.
  if (
    !gem &&
    !game.stoneAt(cell) &&
    (kind === 'open' || kind === 'stone') &&
    !pending.value &&
    game.phase !== 'build'
  )
    return null;
  let title = 'Open cell';
  let subtitle = '';
  let detail = '';
  const stats: Stat[] = [];
  let cards: [string, string, string][] = [];
  const buttons: [string, Check, Cmd, string?, string?][] = [];
  const name = gem?.name;
  let waveTotal = 0;
  const draftGem = !!gem && game.draft.includes(gem.id);
  if (gem && name) {
    const u = game.unit(name);
    title = displayName(sim.data, name);
    subtitle = [
      isTablet(name) ? 'Pedal' : isBasicGem(name) ? 'Gem' : 'Combined tower',
      roleOf(game.abilities(name)),
      ...(draftGem ? ['this round'] : []),
    ].join(' · ');
    const interval = game.attackInterval(gem);
    const dealt = game.damageThisWave[gem.id] ?? 0;
    waveTotal = Object.values(game.damageThisWave).reduce((sum, d) => sum + d, 0);
    stats.push(
      ['sword', 'Damage', `${u.AttackDamageMin ?? 0}–${u.AttackDamageMax ?? 0}`],
      [
        'bolt',
        'Attacks/s',
        interval > 0 ? (1 / interval).toFixed(1) : '—',
        interval > 0 ? `every ${interval.toFixed(2)}s` : undefined,
      ],
      ['target', 'Range', game.attackRange(gem).toFixed(1), 'tiles'],
      ['meter', 'Dealt', compact(dealt), 'this wave'],
    );
    cards = towerSkills(sim, name);
    // Keep and downgrade apply only to this round's gems while placing.
    for (const up of draftGem && game.phase === 'build' ? ([0, -1, 1, 2] as const) : []) {
      if (up === -1) {
        buttons.push([
          'Downgrade and keep',
          game.canDowngrade(gem.id),
          { type: 'downgrade', id: gem.id },
          'W',
          'Keep this gem one quality lower.',
        ]);
        continue;
      }
      const r = game.keepResult(gem.id, up);
      buttons.push([
        up ? `Keep +${up}` : 'Keep',
        r,
        { type: 'keep', id: gem.id, upgrade: up },
        up === 1 ? 'E' : up === 2 ? 'R' : 'Q',
        up && r.ok
          ? `Keep it as ${displayName(sim.data, r.name).toLowerCase()}.`
          : 'Keep this gem as a tower; the other four become stones and the wave starts.',
      ]);
    }
    if (draftGem && game.hero.abilities.gemtd_hero_fengbaozhichui)
      buttons.push([
        'Hammer: −1 level and keep',
        game.canHammer(gem.id),
        { type: 'downgrade', id: gem.id, hammer: true },
        undefined,
        'The hero hammer: keep this gem one level lower.',
      ]);
  } else if (game.stoneAt(cell)) {
    title = 'Stone';
    detail = 'Blocks the creep route. A gem can be built over it.';
    buttons.push([
      'Remove stone',
      game.canRemove(cell),
      { type: 'remove', cell },
      undefined,
      'Clear this stone from the maze.',
    ]);
  } else if (kind === 'waypoint') {
    title = WAYPOINT_NAMES[sim.board.waypoints.findIndex((w) => same(w.cell, cell))];
    detail = 'Creep route waypoint. Cannot build here.';
  } else if (kind === 'no-build') {
    title = 'No-build zone';
    detail = cell.x <= 9 ? 'Reserved around the spawn.' : 'Reserved around the castle.';
  }
  if (!gem && kind !== 'waypoint' && kind !== 'no-build' && game.phase === 'build') {
    buttons.unshift([
      'Place gem',
      game.canBuild(cell),
      { type: 'build', cell },
      'B',
      `Place gem ${Math.min(game.draft.length + 1, DRAFT_SIZE)} of 5 here. Tapping the selected cell again does the same.`,
    ]);
    if (!detail) detail = 'Open floor. Place a gem here, or tap the cell again.';
  }
  const combines = gem ? game.combineOptions(gem.id) : [];
  // The first enabled command is the primary action and takes the accent fill.
  const primary = combines.length ? -1 : buttons.findIndex(([, check]) => check.ok);
  const aims = !!gem && !!name && !isTablet(name);
  const portrait = name ? (
    <TowerIcon name={name} portrait />
  ) : (
    <svg class="cell-mark" viewBox="0 0 24 24" aria-hidden="true">
      {game.stoneAt(cell) ? ICONS.stone : kind === 'waypoint' ? ICONS.route : ICONS.top}
    </svg>
  );
  const actions = pending.value ? (
    <>
      <Command
        label="Place tablet here"
        primary
        check={game.canCombine(pending.value.id, pending.value.kind, pending.value.result, cell)}
        icon={<TowerIcon name={pending.value.result} class="glyph" />}
        text={`Put ${displayName(sim.data, pending.value.result)} on this cell.`}
        onClick={() => {
          send({ type: 'combine', ...pending.value!, cell });
          pending.value = null;
        }}
      />
      <Command
        label="Cancel tablet placement"
        icon={<Icon name="close" />}
        onClick={() => (pending.value = null)}
      />
    </>
  ) : (
    <>
      <div class="gem-toolstrip">
        {buttons.map(([label, check, cmd, key, text], i) => (
          <Command
            key={label}
            label={label}
            hint={key}
            check={check}
            primary={i === primary}
            icon={
              <Icon
                name={
                  cmd.type === 'keep' && cmd.upgrade
                    ? cmd.upgrade === 1
                      ? 'upgrade'
                      : 'upgradeMax'
                    : (COMMAND_ICONS[cmd.type] ?? 'stone')
                }
              />
            }
            text={text}
            wide={cmd.type === 'build' && !gem}
            onRefused={
              cmd.type === 'build'
                ? () => (refusal.value = { cell: { ...cell }, at: performance.now() })
                : undefined
            }
            onClick={() => send(cmd)}
          />
        ))}
        {gem && !gem.name.includes('shiban') && (
          <Command
            label={gem.holdFire ? 'Resume attacking' : 'Stop attacking'}
            hint="S"
            pressed={!!gem.holdFire}
            icon={<Icon name={gem.holdFire ? 'play' : 'pause'} />}
            text={
              gem.holdFire
                ? 'This tower is holding fire. Let it attack again.'
                : 'Hold fire: this tower stops attacking until resumed.'
            }
            onClick={() => send({ type: 'hold', id: gem.id, hold: !gem.holdFire })}
          />
        )}
      </div>
      {combines.length > 0 && (
        <div class="combine-options" aria-label="Available combinations">
          {combines.map((p, i) => (
            <Command
              key={p.result}
              caption="Combine"
              label={displayName(sim.data, p.result)}
              hint={i === 0 && p.placement !== 'separate' ? 'C' : undefined}
              icon={<TowerIcon name={p.result} portrait />}
              onClick={() => {
                if (p.placement === 'separate') {
                  pending.value = { id: gem!.id, kind: p.kind as RecipeKind, result: p.result };
                  announcement.value = 'Select an empty cell to place the tablet.';
                } else
                  send({
                    type: 'combine',
                    id: gem!.id,
                    kind: p.kind as RecipeKind,
                    result: p.result,
                  });
              }}
            />
          ))}
        </div>
      )}
      {WIP && <HeroSkills sim={sim} send={send} />}
    </>
  );
  const aim = aims && gem && !pending.value && (
    <div class="aim">
      <label for="aim-mode">Aim</label>
      <select
        id="aim-mode"
        value={(gem.aim ?? 0) % AIM_BOSS}
        onChange={(e) =>
          send({
            type: 'aim',
            id: gem.id,
            mode:
              Number((e.target as HTMLSelectElement).value) +
              ((gem.aim ?? 0) >= AIM_BOSS ? AIM_BOSS : 0),
          })
        }
      >
        {AIM.map((label, i) => (
          <option key={label} value={i}>
            {label}
          </option>
        ))}
      </select>
      <button
        class="boss"
        aria-pressed={(gem.aim ?? 0) >= AIM_BOSS}
        title="Bosses and elite creeps are targeted first"
        onClick={() =>
          send({ type: 'aim', id: gem.id, mode: ((gem.aim ?? 0) + AIM_BOSS) % (2 * AIM_BOSS) })
        }
      >
        Boss first
      </button>
    </div>
  );
  const mvpLevel = gem?.level ?? 0;
  return (
    <Card
      kind={gem ? 'tower' : 'cell'}
      portrait={portrait}
      name={name ? `${title} · ${code(name)}` : title}
      badge={name ? String(isBasicGem(name) ? qualityOf(name) : mvpLevel) : undefined}
      badgeTitle={
        name
          ? isBasicGem(name)
            ? `${QUALITY[qualityOf(name)]}, tier ${qualityOf(name)} of 6`
            : `MVP level ${mvpLevel}`
          : undefined
      }
      subtitle={`${subtitle ? `${subtitle} · ` : ''}Cell ${cell.x}, ${cell.y}`}
      stats={stats}
      effects={gem && <Statuses data={sim.data} list={game.towerStatuses(gem)} />}
      abilities={cards.length > 0 && <AbilityList items={cards} />}
      actions={actions}
      bars={
        gem && !isTablet(gem.name)
          ? [
              {
                label: 'Damage share',
                kind: 'hp',
                value: game.damageThisWave[gem.id] ?? 0,
                max: waveTotal,
                text: `${waveTotal ? Math.round(((game.damageThisWave[gem.id] ?? 0) / waveTotal) * 100) : 0}% of wave damage`,
              },
              {
                label: 'MVP level',
                kind: 'mana',
                value: mvpLevel,
                max: 10,
                text: `MVP ${mvpLevel} / 10`,
              },
            ]
          : undefined
      }
    >
      {aim}
      {detail && <p>{detail}</p>}
      {pending.value && (
        <p>Select an empty cell for {displayName(sim.data, pending.value.result)}.</p>
      )}
    </Card>
  );
}

export function CommandCard({
  sim,
  send,
  tick,
  openHero,
}: {
  sim: Sim;
  send: (cmd: Cmd) => void;
  tick: number;
  openHero: () => void;
}) {
  if (selectedCreep.value !== null)
    return <CreepCard sim={sim} id={selectedCreep.value} tick={tick} />;
  const cell = selected.value;
  if (cell) return <CellCard sim={sim} send={send} cell={cell} tick={tick} />;
  return WIP && sim.game.hero.selected ? (
    <HeroCard sim={sim} send={send} openHero={openHero} tick={tick} />
  ) : null;
}
