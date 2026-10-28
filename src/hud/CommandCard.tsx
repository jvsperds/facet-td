import { signal, useSignal } from '@preact/signals';
import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
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
import { announcement, selected, selectedCreep } from '../input/camera';
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
import { Statuses } from './Statuses';
import { CreepIcon, TowerIcon } from './TowerIcon';

// The command card (GemTD's bottom panel, after Dota's): a portrait, a stats column, ability and
// effect cards, and a grid of square commands with their hotkeys. It shows the hero and its
// skills when nothing is selected, and otherwise the selected cell, gem, tower or creep.

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
/** Hero skill hotkeys, in skill order. */
export const SKILL_KEYS = ['Q', 'W', 'E', 'F', 'G'];
const same = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;
/** A tablet waiting for its cell: it stays pending while the player selects where to put it. */
const pending = signal<{ id: number; kind: RecipeKind; result: string } | null>(null);

/** What a hero skill cast at the current selection aims at: a gem, a stone, or a point. */
export function heroTarget(game: Game) {
  const point = selected.value ?? undefined;
  const target = point
    ? (game.gemAt(point)?.id ?? (game.stoneAt(point) ? -(point.y * 64 + point.x) : undefined))
    : undefined;
  return { point, target };
}

/** A square command: label under an optional icon, the hotkey in its corner. */
function Command(p: {
  label: string;
  hint?: string;
  check?: Check;
  primary?: boolean;
  glow?: boolean;
  wide?: boolean;
  icon?: ComponentChildren;
  /** A small line above the label, e.g. "Combine". */
  caption?: string;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={p.caption ? `${p.caption}: ${p.label}` : undefined}
      class={`cmd ${p.primary ? 'primary' : ''} ${p.glow ? 'glow' : ''} ${p.wide ? 'wide' : ''}`}
      disabled={p.check ? !p.check.ok : false}
      title={p.title ?? (p.check && !p.check.ok ? p.check.reason : undefined)}
      aria-keyshortcuts={p.hint}
      onClick={p.onClick}
    >
      {p.hint && (
        <kbd class="cmd-key" aria-hidden="true">
          {p.hint}
        </kbd>
      )}
      {p.icon && <span class="cmd-icon">{p.icon}</span>}
      <span class="cmd-text">
        {p.caption && <span class="cmd-caption">{p.caption}</span>}
        <span class="cmd-label">{p.label}</span>
      </span>
    </button>
  );
}

/** The card's frame: portrait, title, body and commands, collapsible on small screens. */
function Card(p: {
  portrait: ComponentChildren;
  badge?: string;
  title: ComponentChildren;
  subtitle?: string;
  deselect?: () => void;
  stats?: [string, ComponentChildren, string?][];
  children?: ComponentChildren;
  commands?: ComponentChildren;
  kind?: string;
}) {
  // Short screens start with the card collapsed to its title and commands so the board keeps room.
  const collapsed = useSignal(
    matchMedia('(max-width: 600px) and (max-height: 700px), (max-height: 500px)').matches,
  );
  return (
    <section
      class={`panel card ${p.kind ?? ''} ${collapsed.value ? 'collapsed' : ''}`}
      data-exclude
      aria-label="Selection"
    >
      <div class="card-portrait">
        {p.portrait}
        {p.badge && <span class="badge tabular">{p.badge}</span>}
      </div>
      <div class="card-main">
        <div class="card-head">
          <div class="card-title">
            <h2>{p.title}</h2>
            {p.subtitle && <p class="muted tabular">{p.subtitle}</p>}
          </div>
          <button
            class="icon-button collapse"
            aria-label={collapsed.value ? 'Show details' : 'Hide details'}
            aria-expanded={!collapsed.value}
            aria-controls="info-body"
            onClick={() => (collapsed.value = !collapsed.value)}
          >
            <Icon name={collapsed.value ? 'chevronUp' : 'chevronDown'} />
          </button>
          {p.deselect && (
            <button class="icon-button" aria-label="Deselect" onClick={p.deselect}>
              <Icon name="close" />
            </button>
          )}
        </div>
        <div class="card-body" id="info-body">
          {p.stats && p.stats.length > 0 && (
            <dl class="stats tabular">
              {p.stats.map(([k, v, sub]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                  {sub && <dd class="sub">{sub}</dd>}
                </div>
              ))}
            </dl>
          )}
          {p.children}
        </div>
      </div>
      {p.commands && (
        <div class="card-commands" role="group" aria-label="Commands">
          {p.commands}
        </div>
      )}
    </section>
  );
}

const clearSelection = () => {
  selected.value = null;
  selectedCreep.value = null;
  announcement.value = 'Selection cleared';
  document.querySelector('canvas')?.focus();
};

/** Ability cards for a tower: a short name, then the ability in full. */
function abilityCards(game: Game, name: string): [string, string][] {
  const cards: [string, string][] = [];
  for (const a of game.abilities(name)) {
    if (a.kind === 'slow')
      cards.push(['Slow', `On hit: ${a.amount} movement speed for ${a.duration}s`]);
    else if (a.kind === 'armor')
      cards.push(['Shred', `On hit: ${a.amount} armor for ${a.duration}s`]);
    else if (a.kind === 'speed') cards.push(['Swift', `+${a.amount} attack speed`]);
    else if (a.kind === 'aura')
      cards.push(['Aura', `Aura: +${a.amount} attack speed within ${a.radius.toFixed(2)} cells`]);
    else if (a.kind === 'damage') cards.push(['Might', `+${a.amount}% base attack damage`]);
    else if (a.kind === 'split') cards.push(['Split', `${a.count} additional targets`]);
    else if (a.kind === 'splash')
      cards.push(['Splash', `${a.amount * 100}% pure splash within ${a.radius.toFixed(2)} cells`]);
    else if (a.kind === 'poison')
      cards.push([
        'Poison',
        `Stacking poison: ${a.amount} magic damage every ${a.interval}s for ${a.duration}s`,
      ]);
    else if (a.kind === 'critical')
      cards.push(['Critical', `${a.chance}% chance of ×${a.multiplier} damage`]);
  }
  return cards;
}

/** Hero skill commands, cast at the current selection. */
function HeroSkills({ sim, send }: { sim: Sim; send: (cmd: Cmd) => void }) {
  const game = sim.game;
  if (!game.hero.selected) return null;
  const { point, target } = heroTarget(game);
  return (
    <>
      {game
        .heroActions()
        .filter((a) => a.supported)
        .slice(0, SKILL_KEYS.length)
        .map((a, i) => {
          const check = game.canHeroAction(a.name, target, point, sim.tick);
          const left = Math.max(0, Math.ceil(((game.hero.cooldowns[a.name] ?? 0) - sim.tick) / 30));
          return (
            <Command
              key={a.name}
              label={left ? `${skillName(sim.data, a.name)} ${left}s` : skillName(sim.data, a.name)}
              hint={SKILL_KEYS[i]}
              check={check}
              title={`${skillName(sim.data, a.name)}, level ${a.level}. ${skillText(sim.data, a.name)}${check.ok ? '' : ` (${check.reason})`}`}
              onClick={() => send({ type: 'hero-cast', action: a.name, target, point })}
            />
          );
        })}
    </>
  );
}

/** Nothing selected: the hero, the build level and the hero's skills (GemTD's idle card). */
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
  const name = unit ? skillName(sim.data, unit).replace(/^Npc dota hero /i, '') : 'No hero';
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
      title={name}
      subtitle={
        game.phase === 'build'
          ? `Place gem ${Math.min(game.draft.length + 1, DRAFT_SIZE)} of 5 · double-click a cell`
          : 'Select a tower or creep to inspect it'
      }
      stats={[
        ['Build lv', String(level), next ? `${game.xp}/${next} XP` : 'max'],
        ['Gold', compact(game.gold)],
        ['Towers', String(game.gems.length)],
        ['Stones', String(game.stones.size)],
      ]}
      commands={
        <>
          <HeroSkills sim={sim} send={send} />
          <button class="cmd wide" aria-label="Hero" aria-haspopup="dialog" onClick={openHero}>
            <kbd class="cmd-key" aria-hidden="true">
              H
            </kbd>
            <span class="cmd-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                {ICONS.hero}
              </svg>
            </span>
            <span class="cmd-label">{game.hero.selected ? 'Hero & skills' : 'Choose hero'}</span>
          </button>
        </>
      }
    >
      {!game.hero.selected && (
        <p class="muted">
          Pick an offline hero for build-phase skills. Keys: <kbd>P</kbd> pause, <kbd>T</kbd> view,{' '}
          <kbd>R</kbd> recipes.
        </p>
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
  const share = Math.max(0, creep.hp / creep.maxHp);
  const speed = Math.round(stats.speed * CELL_UNITS * TICK_HZ);
  const baseSpeed = Math.round(creep.speed * CELL_UNITS * TICK_HZ);
  const skills = game.creepSkills(creep);
  return (
    <Card
      kind="creep"
      portrait={<CreepIcon name={creep.name} />}
      title={`${creep.elite ? 'Elite ' : ''}${displayName(sim.data, creep.name)}`}
      subtitle={[
        creep.boss ? 'Boss' : 'Creep',
        creep.fly ? 'Flying' : 'Ground',
        `wave ${game.level}`,
      ].join(' · ')}
      deselect={clearSelection}
      stats={[
        [
          'Armor',
          String(+stats.armor.toFixed(1)),
          stats.armor !== creep.armor ? `base ${creep.armor}` : undefined,
        ],
        ['Magic res.', `${Math.round(stats.magicResist)}%`],
        ['Speed', String(speed), speed !== baseSpeed ? `base ${baseSpeed}` : undefined],
        [
          'Castle dmg',
          creep.boss ? `${Math.ceil(share * 100)}` : String(creep.damage),
          'if it arrives',
        ],
      ]}
    >
      <div
        class="hp"
        role="meter"
        aria-label="Health"
        aria-valuemin={0}
        aria-valuemax={creep.maxHp}
        aria-valuenow={Math.ceil(creep.hp)}
      >
        <i style={{ width: `${share * 100}%` }} class={share < 0.3 ? 'low' : ''} />
        <span class="tabular">
          {compact(Math.ceil(creep.hp))} / {compact(creep.maxHp)} HP
        </span>
      </div>
      {skills.length > 0 && (
        <ul class="ability-cards" role="list" aria-label="Abilities">
          {skills.map((k) => (
            <li key={k} title={skillText(sim.data, k)}>
              <b>{skillName(sim.data, k)}</b>
              <span>{skillText(sim.data, k) || 'Creep ability'}</span>
            </li>
          ))}
        </ul>
      )}
      <Statuses data={sim.data} list={game.creepStatuses(creep)} />
    </Card>
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
  const tab = useSignal<'commands' | 'aim'>('commands');
  const gem = game.gemAt(cell);
  const kind = sim.board.kind(cell);
  let title = 'Open cell';
  let subtitle = '';
  let detail = '';
  const stats: [string, string, string?][] = [];
  const cards: [string, string][] = [];
  const buttons: [string, Check, Cmd, string?][] = [];
  const name = gem?.name;
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
    stats.push(
      ['Damage', `${u.AttackDamageMin ?? 0}–${u.AttackDamageMax ?? 0}`],
      [
        'Attacks/s',
        interval > 0 ? (1 / interval).toFixed(1) : '—',
        interval > 0 ? `every ${interval.toFixed(2)}s` : undefined,
      ],
      ['Range', game.attackRange(gem).toFixed(1), 'tiles'],
      ['Dealt', compact(dealt), 'this wave'],
    );
    cards.push(...abilityCards(game, name));
    if (draftGem)
      for (const up of [0, 1, 2] as const) {
        const r = game.keepResult(gem.id, up);
        if (up === 0 || r.ok || game.draft.length === DRAFT_SIZE)
          buttons.push([
            up ? `Keep +${up}` : 'Keep',
            r,
            { type: 'keep', id: gem.id, upgrade: up },
            up ? undefined : 'K',
          ]);
        if (up && r.ok)
          cards.push([`Keep +${up}`, `becomes ${displayName(sim.data, r.name).toLowerCase()}`]);
      }
    if (draftGem && qualityOf(name) > 1)
      buttons.push([
        'Downgrade and keep',
        game.canDowngrade(gem.id),
        { type: 'downgrade', id: gem.id },
      ]);
    if (draftGem && game.hero.abilities.gemtd_hero_fengbaozhichui)
      buttons.push([
        'Hammer: −1 level and keep',
        game.canHammer(gem.id),
        { type: 'downgrade', id: gem.id, hammer: true },
      ]);
  } else if (game.stoneAt(cell)) {
    title = 'Stone';
    detail = 'Blocks the creep route. A gem can be built over it.';
    buttons.push(['Remove stone', game.canRemove(cell), { type: 'remove', cell }]);
  } else if (kind === 'waypoint') {
    title = WAYPOINT_NAMES[sim.board.waypoints.findIndex((w) => same(w.cell, cell))];
    detail = 'Creep route waypoint. Cannot build here.';
  } else if (kind === 'no-build') {
    title = 'No-build zone';
    detail = cell.x <= 9 ? 'Reserved around the spawn.' : 'Reserved around the castle.';
  }
  if (!gem && kind !== 'waypoint' && kind !== 'no-build') {
    buttons.unshift(['Place gem', game.canBuild(cell), { type: 'build', cell }, 'B']);
    if (!detail) detail = 'Open floor. Place a gem here, or double-click the cell.';
  }
  const refusal = buttons.find(([, check]) => !check.ok)?.[1];
  const combines = gem ? game.combineOptions(gem.id) : [];
  // The first enabled command is the primary action and takes the accent fill.
  const primary = combines.length ? -1 : buttons.findIndex(([, check]) => check.ok);
  const aims = !!gem && !!name && !isTablet(name);
  const portrait = name ? (
    <TowerIcon name={name} />
  ) : (
    <svg class="cell-mark" viewBox="0 0 24 24" aria-hidden="true">
      {game.stoneAt(cell) ? ICONS.stone : kind === 'waypoint' ? ICONS.route : ICONS.top}
    </svg>
  );
  const commands = pending.value ? (
    <>
      <Command
        label="Place tablet here"
        primary
        check={game.canCombine(pending.value.id, pending.value.kind, pending.value.result, cell)}
        icon={<TowerIcon name={pending.value.result} class="glyph" />}
        onClick={() => {
          send({ type: 'combine', ...pending.value!, cell });
          pending.value = null;
        }}
      />
      <Command label="Cancel tablet placement" onClick={() => (pending.value = null)} />
    </>
  ) : tab.value === 'aim' && gem ? (
    <>
      {AIM.map((label, i) => (
        <Command
          key={label}
          label={label}
          primary={(gem.aim ?? 0) % AIM_BOSS === i}
          onClick={() =>
            send({ type: 'aim', id: gem.id, mode: i + ((gem.aim ?? 0) >= AIM_BOSS ? AIM_BOSS : 0) })
          }
        />
      ))}
      <button
        class="cmd boss"
        aria-pressed={(gem.aim ?? 0) >= AIM_BOSS}
        title="Bosses and elite creeps are targeted first"
        onClick={() =>
          send({ type: 'aim', id: gem.id, mode: ((gem.aim ?? 0) + AIM_BOSS) % (2 * AIM_BOSS) })
        }
      >
        <span class="cmd-label">Boss first</span>
      </button>
    </>
  ) : (
    <>
      {combines.map((p, i) => (
        <Command
          key={p.result}
          caption="Combine"
          label={displayName(sim.data, p.result)}
          hint={i === 0 && p.placement !== 'separate' ? 'C' : undefined}
          primary={i === 0}
          glow
          wide
          icon={<TowerIcon name={p.result} class="glyph" />}
          onClick={() => {
            if (p.placement === 'separate') {
              pending.value = { id: gem!.id, kind: p.kind as RecipeKind, result: p.result };
              announcement.value = 'Select an empty cell to place the tablet.';
            } else
              send({ type: 'combine', id: gem!.id, kind: p.kind as RecipeKind, result: p.result });
          }}
        />
      ))}
      {buttons.map(([label, check, cmd, key], i) => (
        <Command
          key={label}
          label={label}
          hint={key}
          check={check}
          primary={i === primary}
          onClick={() => send(cmd)}
        />
      ))}
      <HeroSkills sim={sim} send={send} />
    </>
  );
  return (
    <Card
      kind={gem ? 'tower' : 'cell'}
      portrait={portrait}
      badge={name ? code(name) : undefined}
      title={
        <>
          {name && isBasicGem(name) && (
            <span
              class="quality tabular"
              title={`${QUALITY[qualityOf(name)]}, tier ${qualityOf(name)} of 6`}
            >
              {qualityOf(name)}
            </span>
          )}
          {title}
        </>
      }
      subtitle={`${subtitle ? `${subtitle} · ` : ''}Cell ${cell.x}, ${cell.y}`}
      deselect={clearSelection}
      stats={stats}
      commands={
        <>
          {aims && !pending.value && (
            <div class="card-tabs" role="tablist" aria-label="Command set">
              <button
                role="tab"
                aria-selected={tab.value === 'commands'}
                onClick={() => (tab.value = 'commands')}
              >
                Actions
              </button>
              <button
                role="tab"
                aria-selected={tab.value === 'aim'}
                onClick={() => (tab.value = 'aim')}
              >
                Targeting
              </button>
            </div>
          )}
          <div class="cmd-grid">{commands}</div>
        </>
      }
    >
      {detail && <p>{detail}</p>}
      {pending.value && (
        <p>Select an empty cell for {displayName(sim.data, pending.value.result)}.</p>
      )}
      {cards.length > 0 && (
        <ul class="ability-cards" role="list" aria-label="Abilities">
          {cards.map(([k, v]) => (
            <li key={k}>
              <b>{k}</b>
              <span>{v}</span>
            </li>
          ))}
        </ul>
      )}
      {gem && <Statuses data={sim.data} list={game.towerStatuses(gem)} />}
      {refusal && !refusal.ok && <p class="muted reason">{refusal.reason}</p>}
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
  return <HeroCard sim={sim} send={send} openHero={openHero} tick={tick} />;
}
