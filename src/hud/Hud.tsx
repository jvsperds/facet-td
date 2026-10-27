import { useSignal, type Signal } from '@preact/signals';
import type { ComponentChildren } from 'preact';
import type { Audio } from '../audio';
import type { Feedback } from './feedback';
import type { Cell } from '../sim/board';
import { DRAFT_SIZE, LAST_LEVEL, qualityOf, type Check, type Game } from '../sim/game';
import type { Cmd, Sim } from '../sim/sim';
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
const code = (name: string) => `${name[6].toUpperCase()}${qualityOf(name)}`;
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
  const v = view.value;
  const level = game.heroLevel;
  return (
    <>
      <header class="status" data-exclude>
        <strong>Facet TD</strong>
        <span>{mode === 'classic' ? 'Classic' : 'Facet'}</span>
        <span class="tabular">
          Wave {game.level}/{LAST_LEVEL}
        </span>
        <span>
          {paused.value
            ? 'Paused'
            : game.phase === 'build'
              ? 'Build'
              : game.phase === 'wave'
                ? 'Wave'
                : 'Game over'}
        </span>
        <span
          class={`tabular ${game.castleHp <= 25 ? 'danger' : ''}`}
          aria-label={`Castle ${game.castleHp} of 100 HP`}
        >
          Castle {game.castleHp}
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
      </header>

      <RoundSummary sim={sim} tick={tick} feedback={feedback} />
      <SelectionPanel sim={sim} send={send} tick={tick} />

      <div
        class="tools"
        data-exclude
        onKeyDown={(e) => e.key === 'Escape' && (flyout.value = false)}
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
            <small>Ground: solid · Flying: dashed</small>
            <button
              disabled={!audio.available.value}
              aria-pressed={audio.enabled.value}
              onClick={() => audio.toggle()}
            >
              {audio.available.value
                ? `Sound ${audio.enabled.value ? 'on' : 'off'}`
                : 'Sound unavailable'}
            </button>
          </div>
        )}
        <div class="strip panel" role="toolbar" aria-label="Tools">
          <Tool
            label={v.mode === 'iso' ? 'Switch to top view' : 'Switch to isometric view'}
            onClick={actions.toggleMode}
          >
            {v.mode === 'iso' ? (
              <path d="M12 3 21 8v8l-9 5-9-5V8z M3 8l9 5 9-5 M12 13v8" />
            ) : (
              <path d="M4 4h16v16H4z M4 12h16 M12 4v16" />
            )}
          </Tool>
          <Tool
            label="Rotate board: drag turns instead of pans"
            pressed={rotateMode.value}
            onClick={actions.toggleRotate}
          >
            {rotateMode.value ? (
              <path d="M20 12a8 8 0 1 1-3-6.2 M20 4v5h-5" />
            ) : (
              <path d="M7 11V8a5 5 0 0 1 10 0v3 M5 11h14v10H5z" />
            )}
          </Tool>
          <Tool
            label="Camera controls"
            expanded={flyout.value}
            onClick={() => (flyout.value = !flyout.value)}
          >
            <path d="M4 8h4l2-3h4l2 3h4v11H4z M12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7" />
          </Tool>
          <Tool
            label="Pause"
            pressed={paused.value}
            onClick={() => {
              paused.value = !paused.value;
              announcement.value = paused.value ? 'Paused' : 'Resumed';
            }}
          >
            {paused.value ? <path d="M7 5v14l12-7z" /> : <path d="M8 5v14 M16 5v14" />}
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

/** The five gems placed this round (IMPLEMENTATION.md "HUD and input"); a filled slot selects its gem. */
function RoundSummary({ sim, feedback }: { sim: Sim; tick: number; feedback: Feedback }) {
  const game = sim.game;
  const draft = game.draft.map((id) => game.gems.find((g) => g.id === id)!);
  return (
    <section class="panel summary" data-exclude aria-label="This round">
      {game.phase === 'wave' ? (
        <p class="tabular">
          Wave {game.level}: {game.creeps.length} creeps on the board
        </p>
      ) : (
        <div class="slots">
          {Array.from({ length: DRAFT_SIZE }, (_, i) => {
            const g = draft[i];
            if (!g)
              return <button class="slot" disabled aria-label={`Gem ${i + 1} of 5: not placed`} />;
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
                {code(g.name)}
              </button>
            );
          })}
        </div>
      )}
      <p
        class={`combat-notice ${feedback.notice.value.danger ? 'danger' : ''}`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {feedback.notice.value.text}
      </p>
      <p class="reward tabular" aria-label="Wave rewards">
        {feedback.reward.value.kills} kills · +{feedback.reward.value.gold} gold this wave
      </p>
    </section>
  );
}

function SelectionPanel({ sim, send }: { sim: Sim; send: (cmd: Cmd) => void; tick: number }) {
  const game = sim.game;
  const cell = selected.value;
  if (!cell)
    return (
      <section class="panel info" data-exclude aria-label="Selection">
        <p>
          {game.phase === 'build'
            ? `Select an open cell and place gem ${game.draft.length + 1} of 5.`
            : 'Click or tap a cell to inspect it.'}
        </p>
      </section>
    );
  const gem = game.gemAt(cell);
  const kind = sim.board.kind(cell);
  let title = 'Open cell';
  let detail = '';
  const buttons: [string, Check, Cmd][] = [];
  if (gem) {
    const u = game.unit(gem.name);
    title = displayName(sim, gem.name);
    detail = `${QUALITY[qualityOf(gem.name)]} · damage ${u.AttackDamageMin}–${u.AttackDamageMax} · every ${game.attackInterval(gem).toFixed(2)}s · range ${(Number(u.AttackRange) / 128).toFixed(1)} cells`;
    for (const a of game.abilities(gem.name)) {
      if (a.kind === 'slow') detail += ` · On hit: ${a.amount} movement speed for ${a.duration}s`;
      else if (a.kind === 'armor') detail += ` · On hit: ${a.amount} armor for ${a.duration}s`;
      else if (a.kind === 'speed') detail += ` · +${a.amount} attack speed`;
      else if (a.kind === 'aura')
        detail += ` · Aura: +${a.amount} attack speed within ${a.radius.toFixed(2)} cells`;
    }
    if (game.draft.includes(gem.id))
      for (const up of [0, 1, 2] as const) {
        const r = game.keepResult(gem.id, up);
        if (up === 0 || r.ok || game.draft.length === DRAFT_SIZE)
          buttons.push([up ? `Keep +${up}` : 'Keep', r, { type: 'keep', id: gem.id, upgrade: up }]);
        if (up && r.ok) detail += ` · Keep +${up} makes ${displayName(sim, r.name).toLowerCase()}`;
      }
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
  return (
    <section class="panel info" data-exclude aria-label="Selection">
      <h2>{title}</h2>
      <p class="muted tabular">
        Cell {cell.x}, {cell.y}
      </p>
      {detail && <p>{detail}</p>}
      {buttons.length > 0 && (
        <div class="actions">
          {buttons.map(([label, check, cmd]) => (
            <button disabled={!check.ok} onClick={() => send(cmd)}>
              {label}
            </button>
          ))}
        </div>
      )}
      {refusal && !refusal.ok && <p class="muted">{refusal.reason}</p>}
    </section>
  );
}

function EndCard({ game }: { game: Game; tick: number }) {
  const won = game.phase === 'won';
  return (
    <div class="end" role="dialog" aria-modal="true" aria-labelledby="end-title">
      <div class="panel end-card">
        <h2 id="end-title">{won ? 'Victory' : 'The castle fell'}</h2>
        <p>{won ? `All ${LAST_LEVEL} waves cleared.` : `Wave ${game.level} broke through.`}</p>
        <p class="tabular">
          Gold {game.gold} · Build level {game.heroLevel}
        </p>
        <button ref={(b) => b?.focus()} onClick={() => (location.href = location.pathname)}>
          Play again
        </button>
      </div>
    </div>
  );
}

function Tool(p: {
  label: string;
  pressed?: boolean;
  expanded?: boolean;
  onClick: () => void;
  children: ComponentChildren;
}) {
  return (
    <button
      class="tool"
      aria-label={p.label}
      title={p.label}
      aria-pressed={p.pressed}
      aria-expanded={p.expanded}
      onClick={p.onClick}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {p.children}
      </svg>
    </button>
  );
}
