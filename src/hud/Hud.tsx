import { useSignal, type Signal } from '@preact/signals';
import type { ComponentChildren, Ref } from 'preact';
import { useRef } from 'preact/hooks';
import type { Audio } from '../audio';
import type { Feedback } from './feedback';
import type { Cell } from '../sim/board';
import { DRAFT_SIZE, LAST_LEVEL, isBasicGem, qualityOf, type Check, type Game } from '../sim/game';
import type { RecipeKind } from '../sim/progression';
import type { Cmd, Sim } from '../sim/sim';
import { HeroPanel } from './HeroPanel';
import { GemGlyph, ICONS } from './icons';
import { announcement, rotateMode, selected, view, type CameraActions } from '../input/camera';

// DOM overlay: status bar, top-left round summary, lower-left selection info with actions,
// lower-right icon toolstrip with camera flyout, end-of-game card.
// Panels marked data-exclude are measured and kept clear of playable cells by the camera fit.

const WAYPOINT_NAMES = [
  'Spawn (S)',
  'Checkpoint 1',
  'Checkpoint 2',
  'Checkpoint 3',
  'Checkpoint 4',
  'Checkpoint 5',
  'Castle exit (E)',
];
const QUALITY = ['', 'Chipped', 'Flawed', 'Normal', 'Flawless', 'Perfect', 'Huge'];
const XP_NEXT = [250, 650, 1200, 1900];
const CASTLE_MAX = 100;

type Props = {
  sim: Sim;
  ticked: Signal<number>;
  paused: Signal<boolean>;
  send: (cmd: Cmd) => void;
  actions: CameraActions;
  mode: string;
  feedback: Feedback;
  audio: Audio;
  routeVisible: Signal<boolean>;
};

/** English display name from the original localization, e.g. "chipped sapphire/B1" -> "Chipped sapphire". */
function displayName(sim: Sim, unit: string) {
  const tokens = (
    sim.data.files['localization/english.json'] as { lang: { Tokens: Record<string, string> } }
  ).lang.Tokens;
  const text = (tokens[unit] ?? unit).split('/')[0];
  return text.charAt(0).toUpperCase() + text.slice(1);
}
const code = (name: string) =>
  isBasicGem(name) ? `${name[6].toUpperCase()}${qualityOf(name)}` : '★';
const gemType = (name: string) => (isBasicGem(name) ? name[6] : undefined);
const same = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;

export function Hud({
  sim,
  ticked,
  paused,
  send,
  actions,
  mode,
  feedback,
  audio,
  routeVisible,
}: Props) {
  // Passed down as a prop: signal-aware components skip re-renders when only their parent's signals change.
  const tick = ticked.value;
  const game = sim.game;
  const flyout = useSignal(false);
  const heroOpen = useSignal(false);
  const cameraButton = useRef<HTMLButtonElement>(null);
  const heroButton = useRef<HTMLButtonElement>(null);
  const v = view.value;
  const level = game.heroLevel;
  const phase = paused.value
    ? 'Paused'
    : game.phase === 'build'
      ? 'Build'
      : game.phase === 'wave'
        ? game.enraged
          ? 'Wave · Enraged'
          : 'Wave'
        : 'Game over';
  const hp = Math.max(0, game.castleHp);
  const closeFlyout = () => {
    flyout.value = false;
    cameraButton.current?.focus();
  };
  return (
    <>
      <header class="status" data-exclude>
        <div class="status-row">
          <strong class="brand">Facet TD</strong>
          <span class="tag">{mode === 'classic' ? 'Classic' : 'Facet'}</span>
          <span class="tabular">
            {game.level > LAST_LEVEL
              ? `Endless wave ${game.level}`
              : `Wave ${game.level}/${LAST_LEVEL}`}
          </span>
          <span class={`phase ${game.enraged && !paused.value ? 'danger' : ''}`}>{phase}</span>
        </div>
        <div class="status-row resources">
          <span
            class={`castle tabular ${hp <= 25 ? 'danger' : ''}`}
            aria-label={`Castle ${game.castleHp} of ${CASTLE_MAX} HP`}
          >
            Castle {game.castleHp}
            <span class="meter" aria-hidden="true">
              <span style={{ width: `${Math.min(100, (hp / CASTLE_MAX) * 100)}%` }} />
            </span>
          </span>
          <span class="tabular">Gold {game.gold}</span>
          <span
            class="tabular"
            title={
              level < 5
                ? `${game.xp} of ${XP_NEXT[level - 1]} XP to the next build level`
                : 'Highest build level'
            }
          >
            Build Lv {level}
          </span>
        </div>
      </header>

      <RoundSummary sim={sim} tick={tick} feedback={feedback} />
      <SelectionPanel sim={sim} send={send} tick={tick} />
      {heroOpen.value && (
        <HeroPanel
          sim={sim}
          send={send}
          close={() => {
            heroOpen.value = false;
            heroButton.current?.focus();
          }}
        />
      )}

      <div
        class="tools"
        data-exclude
        onKeyDown={(e) => {
          if (e.key === 'Escape' && flyout.value) {
            e.stopPropagation();
            closeFlyout();
          }
        }}
      >
        {flyout.value && (
          <div class="panel flyout" id="camera-flyout" role="group" aria-label="Camera">
            <button onClick={() => actions.turn(-90)}>Turn left</button>
            <button onClick={() => actions.turn(90)}>Turn right</button>
            <button onClick={() => actions.zoomBy(1.25)}>Zoom in</button>
            <button onClick={() => actions.zoomBy(1 / 1.25)}>Zoom out</button>
            <button onClick={actions.reset}>Reset view</button>
            <button
              aria-pressed={routeVisible.value}
              onClick={() => (routeVisible.value = !routeVisible.value)}
            >
              Show routes
            </button>
            <button
              disabled={!audio.available.value}
              aria-pressed={audio.enabled.value}
              onClick={() => audio.toggle()}
            >
              {audio.available.value
                ? `Sound ${audio.enabled.value ? 'on' : 'off'}`
                : 'Sound unavailable'}
            </button>
            <small class="muted legend">Routes: ground solid · flying dashed</small>
          </div>
        )}
        <div class="strip panel" role="toolbar" aria-label="Tools" onKeyDown={rovingFocus}>
          <Tool
            label={v.mode === 'iso' ? 'Switch to top view' : 'Switch to isometric view'}
            onClick={actions.toggleMode}
          >
            {v.mode === 'iso' ? ICONS.iso : ICONS.top}
          </Tool>
          <Tool
            label="Rotate board: drag turns instead of pans"
            pressed={rotateMode.value}
            onClick={actions.toggleRotate}
          >
            {rotateMode.value ? ICONS.rotate : ICONS.lock}
          </Tool>
          <Tool
            label="Camera controls"
            expanded={flyout.value}
            controls="camera-flyout"
            ref={cameraButton}
            onClick={() => (flyout.value = !flyout.value)}
          >
            {ICONS.camera}
          </Tool>
          <Tool
            label="Hero"
            haspopup="dialog"
            ref={heroButton}
            onClick={() => (heroOpen.value = true)}
          >
            {ICONS.hero}
          </Tool>
          <Tool
            label="Pause"
            pressed={paused.value}
            onClick={() => {
              paused.value = !paused.value;
              announcement.value = paused.value ? 'Paused' : 'Resumed';
            }}
          >
            {paused.value ? ICONS.play : ICONS.pause}
          </Tool>
        </div>
      </div>

      {(game.phase === 'lost' || game.phase === 'won') && <EndCard game={game} tick={tick} />}

      <div class="sr-only" aria-live="polite">
        {announcement.value}
      </div>
    </>
  );
}

/** Arrow keys move focus along the toolbar (WAI-ARIA toolbar pattern); Tab leaves it. */
function rovingFocus(e: KeyboardEvent) {
  const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
  if (!step) return;
  const buttons = [...(e.currentTarget as HTMLElement).querySelectorAll('button')];
  const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
  if (i < 0) return;
  buttons[(i + step + buttons.length) % buttons.length].focus();
  e.preventDefault();
}

/** The five gems placed this round (IMPLEMENTATION.md "HUD and input"); a filled slot selects its gem. */
function RoundSummary({ sim, feedback }: { sim: Sim; tick: number; feedback: Feedback }) {
  const game = sim.game;
  const draft = game.draft.map((id) => game.gems.find((g) => g.id === id)!);
  const reward = feedback.reward.value;
  return (
    <section class="panel summary" data-exclude aria-label="This round">
      <div class="panel-head">
        <h2 class="panel-title">
          {game.phase === 'wave' ? (
            `Wave ${game.level}`
          ) : (
            <>
              Place gems <span class="tabular">({draft.length}/5)</span>
            </>
          )}
        </h2>
        <p class="reward tabular" aria-label="Wave rewards" title="Kills and gold this wave">
          {reward.kills} kills · +{reward.gold} gold
        </p>
      </div>
      {game.phase === 'wave' ? (
        <p class="wave-line tabular">
          {game.creeps.length} {game.creeps.length === 1 ? 'creep' : 'creeps'} on the board
        </p>
      ) : (
        <div class="slots">
          {Array.from({ length: DRAFT_SIZE }, (_, i) => {
            const g = draft[i];
            if (!g)
              return (
                <button class="slot" disabled aria-label={`Gem ${i + 1} of 5: not placed`}>
                  <span class="slot-n">{i + 1}</span>
                  <span class="slot-code">—</span>
                </button>
              );
            const label = `Gem ${i + 1} of 5: ${displayName(sim, g.name)}, cell ${g.cell.x}, ${g.cell.y}`;
            const active = selected.value !== null && same(selected.value, g.cell);
            return (
              <button
                class={`slot gem-${g.name[6]}`}
                aria-label={label}
                title={label}
                aria-pressed={active}
                onClick={() => {
                  selected.value = { ...g.cell };
                  announcement.value = `Selected ${displayName(sim, g.name)}`;
                }}
              >
                <span class="slot-n">{i + 1}</span>
                <GemGlyph type={gemType(g.name)} />
                <span class="slot-code">{code(g.name)}</span>
              </button>
            );
          })}
        </div>
      )}
      <p
        class={`notice ${feedback.notice.value.danger ? 'danger' : ''}`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {feedback.notice.value.text}
      </p>
    </section>
  );
}

function abilityNotes(game: Game, name: string) {
  const notes: string[] = [];
  for (const a of game.abilities(name)) {
    if (a.kind === 'slow') notes.push(`On hit: ${a.amount} movement speed for ${a.duration}s`);
    else if (a.kind === 'armor') notes.push(`On hit: ${a.amount} armor for ${a.duration}s`);
    else if (a.kind === 'speed') notes.push(`+${a.amount} attack speed`);
    else if (a.kind === 'aura')
      notes.push(`Aura: +${a.amount} attack speed within ${a.radius.toFixed(2)} cells`);
    else if (a.kind === 'damage') notes.push(`+${a.amount}% base attack damage`);
    else if (a.kind === 'split') notes.push(`${a.count} additional targets`);
    else if (a.kind === 'splash')
      notes.push(`${a.amount * 100}% pure splash within ${a.radius.toFixed(2)} cells`);
    else if (a.kind === 'poison')
      notes.push(
        `Stacking poison: ${a.amount} magic damage every ${a.interval}s for ${a.duration}s`,
      );
  }
  return notes;
}

function SelectionPanel({ sim, send }: { sim: Sim; send: (cmd: Cmd) => void; tick: number }) {
  const game = sim.game;
  const pending = useSignal<{ id: number; kind: RecipeKind; result: string } | null>(null);
  // Short phones start with the sheet collapsed to its title and actions so the board keeps room.
  const collapsed = useSignal(matchMedia('(max-width: 600px) and (max-height: 700px)').matches);
  const cell = selected.value;
  const toggle = (
    <button
      class="tool collapse"
      aria-label={collapsed.value ? 'Show details' : 'Hide details'}
      aria-expanded={!collapsed.value}
      aria-controls="info-body"
      onClick={() => (collapsed.value = !collapsed.value)}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {collapsed.value ? ICONS.chevronUp : ICONS.chevronDown}
      </svg>
    </button>
  );
  const cls = `panel info ${collapsed.value ? 'collapsed' : ''}`;
  if (!cell)
    return (
      <section class={cls} data-exclude aria-label="Selection">
        <div class="info-head">
          <div class="info-title">
            <h2>{game.phase === 'build' ? 'Build' : 'Inspect'}</h2>
          </div>
          {toggle}
        </div>
        <div class="info-body" id="info-body">
          <p>
            {game.phase === 'build'
              ? `Select an open cell and place gem ${game.draft.length + 1} of 5.`
              : 'Click or tap a cell to inspect it.'}
          </p>
          <p class="muted">
            Double-click a cell to place a gem. Arrow keys move the cursor; Enter selects.
          </p>
        </div>
      </section>
    );
  const gem = game.gemAt(cell);
  const kind = sim.board.kind(cell);
  let title = 'Open cell';
  let subtitle = '';
  let detail = '';
  const stats: [string, string][] = [];
  const notes: string[] = [];
  const buttons: [string, Check, Cmd][] = [];
  if (gem) {
    const u = game.unit(gem.name);
    title = displayName(sim, gem.name);
    subtitle = isBasicGem(gem.name)
      ? `${code(gem.name)} · ${QUALITY[qualityOf(gem.name)]} ${qualityOf(gem.name)}/6`
      : 'Combined';
    stats.push(
      ['Damage', `${u.AttackDamageMin ?? 0}–${u.AttackDamageMax ?? 0}`],
      ['Attack', `every ${game.attackInterval(gem).toFixed(2)}s`],
      ['Range', `${(Number(u.AttackRange ?? 0) / 128).toFixed(1)} cells`],
    );
    notes.push(...abilityNotes(game, gem.name));
    if (game.draft.includes(gem.id))
      for (const up of [0, 1, 2] as const) {
        const r = game.keepResult(gem.id, up);
        if (up === 0 || r.ok || game.draft.length === DRAFT_SIZE)
          buttons.push([up ? `Keep +${up}` : 'Keep', r, { type: 'keep', id: gem.id, upgrade: up }]);
        if (up && r.ok) notes.push(`Keep +${up} makes ${displayName(sim, r.name).toLowerCase()}`);
      }
    if (game.draft.includes(gem.id) && qualityOf(gem.name) > 1)
      buttons.push([
        'Downgrade and keep',
        game.canDowngrade(gem.id),
        { type: 'downgrade', id: gem.id },
      ]);
    if (game.draft.includes(gem.id) && game.hero.abilities.gemtd_hero_fengbaozhichui)
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
  if (!gem && kind !== 'waypoint' && kind !== 'no-build')
    buttons.unshift(['Place gem', game.canBuild(cell), { type: 'build', cell }]);
  const refusal = buttons.find(([, check]) => !check.ok)?.[1];
  const combines = gem ? game.combineOptions(gem.id) : [];
  // The first enabled command is the primary action and takes the pale action fill.
  const primary = buttons.findIndex(([, check]) => check.ok);
  return (
    <section class={cls} data-exclude aria-label="Selection">
      <div class="info-head">
        {gem && (
          <span class={`swatch ${gemType(gem.name) ? `gem-${gemType(gem.name)}` : ''}`}>
            <GemGlyph type={gemType(gem.name)} />
          </span>
        )}
        <div class="info-title">
          <h2>{title}</h2>
          <p class="muted tabular">
            {subtitle && `${subtitle} · `}Cell {cell.x}, {cell.y}
          </p>
        </div>
        {toggle}
      </div>
      <div class="info-body" id="info-body">
        {detail && <p>{detail}</p>}
        {stats.length > 0 && (
          <dl class="stats tabular">
            {stats.map(([k, val]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{val}</dd>
              </div>
            ))}
          </dl>
        )}
        {notes.length > 0 && (
          <ul class="notes">
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
        {refusal && !refusal.ok && <p class="muted reason">{refusal.reason}</p>}
      </div>
      {pending.value && (
        <div class="actions">
          <p>Select an empty cell for {displayName(sim, pending.value.result)}.</p>
          <button
            class="primary"
            disabled={
              !game.canCombine(pending.value.id, pending.value.kind, pending.value.result, cell).ok
            }
            onClick={() => {
              const p = pending.value!;
              send({ type: 'combine', ...p, cell });
              pending.value = null;
            }}
          >
            Place tablet here
          </button>
          <button onClick={() => (pending.value = null)}>Cancel tablet placement</button>
        </div>
      )}
      <div class="actions">
        {combines.map((p) => (
          <button
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
          >
            Combine: {displayName(sim, p.result)}
          </button>
        ))}
        {buttons.map(([label, check, cmd], i) => (
          <button
            class={i === primary ? 'primary' : undefined}
            disabled={!check.ok}
            onClick={() => send(cmd)}
          >
            {label}
          </button>
        ))}
        <button
          onClick={() => {
            selected.value = null;
            pending.value = null;
            announcement.value = 'Selection cleared';
            document.querySelector('canvas')?.focus();
          }}
        >
          Deselect
        </button>
      </div>
    </section>
  );
}

function EndCard({ game }: { game: Game; tick: number }) {
  const won = game.phase === 'won';
  return (
    <div class="end" role="dialog" aria-modal="true" aria-labelledby="end-title">
      <div class="panel end-card">
        <h2 id="end-title">{won ? 'Victory' : 'The castle fell'}</h2>
        <p>
          {!won
            ? `Wave ${game.level} broke through.`
            : game.level > LAST_LEVEL
              ? `All ${LAST_LEVEL} waves cleared; the castle held until endless wave ${game.level}.`
              : `All ${LAST_LEVEL} waves cleared.`}
        </p>
        <p class="tabular">
          Gold {game.gold} · Build level {game.heroLevel}
        </p>
        <div class="actions">
          <button
            class="primary"
            ref={(b) => b?.focus()}
            onClick={() => (location.href = location.pathname)}
          >
            Play again
          </button>
        </div>
      </div>
    </div>
  );
}

function Tool(p: {
  label: string;
  pressed?: boolean;
  expanded?: boolean;
  controls?: string;
  haspopup?: 'dialog';
  ref?: Ref<HTMLButtonElement>;
  onClick: () => void;
  children: ComponentChildren;
}) {
  return (
    <button
      ref={p.ref}
      class="tool"
      aria-label={p.label}
      data-tip={p.label}
      aria-pressed={p.pressed}
      aria-expanded={p.expanded}
      aria-controls={p.expanded ? p.controls : undefined}
      aria-haspopup={p.haspopup}
      onClick={p.onClick}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {p.children}
      </svg>
    </button>
  );
}
