import { useSignal, type Signal } from '@preact/signals';
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { Audio } from '../audio';
import type { Feedback } from './feedback';
import type { Cell } from '../sim/board';
import { DRAFT_SIZE, LAST_LEVEL, TICK_HZ, type Game } from '../sim/game';
import type { RecipeKind } from '../sim/progression';
import type { Cmd, Sim } from '../sim/sim';
import { CommandCard, SKILL_KEYS, arm, heroSkills, heroTarget } from './CommandCard';
import { DamageMeter } from './DamageMeter';
import { HeroPanel } from './HeroPanel';
import { GlyphDefs, ICONS, Icon } from './icons';
import { WIP } from './flags';
import { GameMenu, TitleScreen } from './Menu';
import { TowerIcon } from './TowerIcon';
import { code, compact, displayName } from './names';
import { PinnedRecipes, RecipeBook } from './RecipeBook';
import { Showcase } from './Showcase';
import {
  announcement,
  rotateMode,
  selected,
  selectedCreep,
  targeting,
  view,
  type CameraActions,
} from '../input/camera';

// DOM overlay on the full-screen cave, laid out after Gem TD's Dota 2 HUD:
// - top left: one hamburger menu holding every setting, and the DPS list (the round's status
//   line is announced to assistive technology only);
// - top centre: the round, its clock and the creeps left;
// - top right: the run's stats (mode, kills/misses, maze length, enemies, progress);
// - bottom centre: the command card (hero and skills, or the selection) with its hotkeys;
// - bottom right: the showcase (Showcase.tsx), a live model of the wave's creep or the MVP tower,
//   over castle HP and gold;
// - floating above the command card while placing: this round's five gems.
// Pinned recipes and the recipe book open on the right, under the stats.
// Panels marked data-exclude are measured and kept clear of playable cells by the camera fit.

const SPEEDS = [
  [1, 'Normal speed'],
  [2, 'Double speed'],
  [4, 'Quadruple speed'],
] as const;

type Props = {
  sim: Sim;
  ticked: Signal<number>;
  paused: Signal<boolean>;
  speed: Signal<number>;
  send: (cmd: Cmd) => void;
  actions: CameraActions;
  mode: string;
  feedback: Feedback;
  audio: Audio;
  routeVisible: Signal<boolean>;
  aurasVisible: Signal<boolean>;
  /** The title screen instead of a run. */
  title?: boolean;
};

const same = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;
const typing = (e: KeyboardEvent) =>
  e.target instanceof HTMLInputElement ||
  e.target instanceof HTMLSelectElement ||
  e.target instanceof HTMLTextAreaElement;

export function Hud(props: Props) {
  const { sim, ticked, paused, speed, send, actions, mode, feedback, audio, routeVisible } = props;
  const aurasVisible = props.aurasVisible;
  // Passed down as a prop: signal-aware components skip re-renders when only their parent's signals change.
  const tick = ticked.value;
  const game = sim.game;
  const flyout = useSignal(false);
  const heroOpen = useSignal(false);
  const menuOpen = useSignal(false);
  const recipesOpen = useSignal(false);
  const meterOpen = useSignal(matchMedia('(min-width: 1101px)').matches);
  const cameraButton = useRef<HTMLButtonElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const v = view.value;
  const closeFlyout = () => {
    flyout.value = false;
    cameraButton.current?.focus();
  };
  const togglePause = () => {
    paused.value = !paused.value;
    announcement.value = paused.value ? 'Paused' : 'Resumed';
  };
  const setSpeed = (s: number, label: string) => {
    speed.value = s;
    announcement.value = label;
  };
  const openMenu = () => {
    menuOpen.value = true;
    paused.value = true;
  };

  // A press outside the settings closes them.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (flyout.value && !toolsRef.current?.contains(e.target as Node)) flyout.value = false;
    };
    addEventListener('pointerdown', onDown, true);
    return () => removeEventListener('pointerdown', onDown, true);
  }, []);

  // Global shortcuts; the board canvas keeps its own arrows, Enter, B and zoom keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e) || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]'))
        return;
      const k = e.key.toLowerCase();
      if (k === 'p') togglePause();
      else if (k === '1' || k === '2' || k === '3') {
        const [s, label] = SPEEDS[Number(k) - 1];
        setSpeed(s, label);
      } else if (k === 'g') recipesOpen.value = !recipesOpen.value;
      else if (k === 'm') meterOpen.value = !meterOpen.value;
      else if (k === 'q') arm('build');
      else if (k === 'w') arm('remove');
      else if (k === 'h' && WIP) heroOpen.value = true;
      else if (k === 't') actions.toggleMode();
      else if (k === 'a') {
        aurasVisible.value = !aurasVisible.value;
        announcement.value = aurasVisible.value ? 'Auras shown' : 'Auras hidden';
      } else if (k === 'escape') {
        // Cancel targeting, else close the settings or the book, else drop the selection, else open
        // the menu.
        if (targeting.value) {
          targeting.value = null;
          announcement.value = 'Cancelled';
        } else if (flyout.value) {
          closeFlyout();
        } else if (recipesOpen.value) recipesOpen.value = false;
        else if (selected.value || selectedCreep.value !== null) {
          selected.value = null;
          selectedCreep.value = null;
          announcement.value = 'Selection cleared';
        } else openMenu();
      } else if (WIP && SKILL_KEYS.includes(e.key.toUpperCase())) {
        const g = sim.game;
        const skill = heroSkills(g)[SKILL_KEYS.indexOf(e.key.toUpperCase())];
        if (!skill) return;
        const { point, target } = heroTarget(g);
        send({ type: 'hero-cast', action: skill.name, target, point });
      } else if (k === 's') {
        // Hold fire / resume on the selected tower (Dota's stop and attack).
        const gem = selected.value && sim.game.gemAt(selected.value);
        if (!gem || gem.name.includes('shiban')) return;
        send({ type: 'hold', id: gem.id, hold: !gem.holdFire });
      } else if (k === 'k' || k === 'c') {
        const gem = selected.value && sim.game.gemAt(selected.value);
        if (!gem) return;
        if (k === 'k' && sim.game.keepResult(gem.id, 0).ok)
          send({ type: 'keep', id: gem.id, upgrade: 0 });
        const option = sim.game.combineOptions(gem.id)[0];
        if (k === 'c' && option && option.placement !== 'separate')
          send({
            type: 'combine',
            id: gem.id,
            kind: option.kind as RecipeKind,
            result: option.result,
          });
      } else return;
      e.preventDefault();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  if (props.title) return <TitleScreen />;
  return (
    <>
      <GlyphDefs />
      <div class="top-left">
        <div
          class="tools"
          data-exclude
          ref={toolsRef}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && flyout.value) {
              e.stopPropagation();
              closeFlyout();
            }
          }}
        >
          <button
            class="tool menu-button"
            ref={cameraButton}
            aria-label="Menu"
            aria-expanded={flyout.value}
            aria-controls="settings"
            onClick={() => (flyout.value = !flyout.value)}
          >
            <Icon name="menu" />
          </button>
          {flyout.value && (
            <div class="panel settings" id="settings" role="group" aria-label="Settings">
              <p class="section-label">Game</p>
              <div class="settings-row">
                <MenuToggle label="Pause" hint="P" pressed={paused.value} onClick={togglePause}>
                  {paused.value ? ICONS.play : ICONS.pause}
                </MenuToggle>
                <div class="segmented" role="group" aria-label="Game speed">
                  {SPEEDS.map(([s, label], i) => (
                    <button
                      class="tabular"
                      aria-label={label}
                      aria-keyshortcuts={`${i + 1}`}
                      title={`${label} (${i + 1})`}
                      aria-pressed={speed.value === s}
                      onClick={() => setSpeed(s, label)}
                    >
                      {s}×
                    </button>
                  ))}
                </div>
              </div>
              <p class="section-label">Camera</p>
              <div class="settings-grid">
                <MenuToggle
                  label={v.mode === 'iso' ? 'Switch to top view' : 'Switch to isometric view'}
                  text={v.mode === 'iso' ? 'Top view' : 'Isometric view'}
                  hint="T"
                  onClick={actions.toggleMode}
                >
                  {v.mode === 'iso' ? ICONS.top : ICONS.iso}
                </MenuToggle>
                <MenuToggle
                  label="Rotate board: drag turns instead of pans"
                  text="Drag rotates"
                  pressed={rotateMode.value}
                  onClick={actions.toggleRotate}
                >
                  {rotateMode.value ? ICONS.rotate : ICONS.lock}
                </MenuToggle>
                <button onClick={() => actions.turn(-90)}>Turn left</button>
                <button onClick={() => actions.turn(90)}>Turn right</button>
                <button onClick={() => actions.zoomBy(1.25)}>Zoom in</button>
                <button onClick={() => actions.zoomBy(1 / 1.25)}>Zoom out</button>
                <button onClick={actions.reset}>Reset view</button>
              </div>
              <p class="section-label">Show</p>
              <div class="settings-grid">
                <MenuToggle
                  label="Recipes"
                  hint="G"
                  pressed={recipesOpen.value}
                  onClick={() => (recipesOpen.value = !recipesOpen.value)}
                >
                  {ICONS.book}
                </MenuToggle>
                <MenuToggle
                  label="Damage"
                  text="DPS list"
                  hint="M"
                  pressed={meterOpen.value}
                  onClick={() => (meterOpen.value = !meterOpen.value)}
                >
                  {ICONS.meter}
                </MenuToggle>
                <MenuToggle
                  label="Show routes"
                  text="Routes"
                  pressed={routeVisible.value}
                  onClick={() => (routeVisible.value = !routeVisible.value)}
                >
                  {ICONS.route}
                </MenuToggle>
                <MenuToggle
                  label="Show auras"
                  text="Auras"
                  hint="A"
                  pressed={aurasVisible.value}
                  onClick={() => (aurasVisible.value = !aurasVisible.value)}
                >
                  {ICONS.target}
                </MenuToggle>
                <button
                  disabled={!audio.available.value}
                  aria-pressed={audio.enabled.value}
                  onClick={() => audio.toggle()}
                >
                  {audio.available.value
                    ? `Sound ${audio.enabled.value ? 'on' : 'off'}`
                    : 'Sound unavailable'}
                </button>
                {WIP && (
                  <button aria-haspopup="dialog" onClick={() => (heroOpen.value = true)}>
                    Hero loadout <kbd aria-hidden="true">H</kbd>
                  </button>
                )}
              </div>
              <small class="muted legend">Routes: ground solid · flying dashed</small>
              <button
                class="run-button"
                ref={menuButton}
                aria-haspopup="dialog"
                aria-keyshortcuts="Escape"
                onClick={openMenu}
              >
                New run, restart or exit <kbd aria-hidden="true">Esc</kbd>
              </button>
            </div>
          )}
        </div>
        <Quest game={game} feedback={feedback} tick={tick} />
        {game.phase === 'build' && <DraftSlots sim={sim} tick={tick} />}
        {meterOpen.value &&
          (game.phase === 'wave' || Object.keys(game.damageThisWave).length > 0) && (
            <DamageMeter data={sim.data} game={game} />
          )}
      </div>
      <RoundClock sim={sim} feedback={feedback} paused={paused.value} tick={tick} />
      <StatsPanel sim={sim} mode={mode} feedback={feedback} tick={tick} />
      <div class="side">
        <PinnedRecipes data={sim.data} game={game} />
        {recipesOpen.value && (
          <RecipeBook data={sim.data} game={game} close={() => (recipesOpen.value = false)} />
        )}
      </div>
      {targeting.value && (
        <p class="targeting">
          {targeting.value === 'build' ? 'Place gem: pick a cell' : 'Remove stone: pick a stone'}
          <span class="muted"> · Shift keeps it · Esc cancels</span>
        </p>
      )}
      <CommandCard sim={sim} send={send} tick={tick} openHero={() => (heroOpen.value = true)} />
      <Showcase sim={sim} feedback={feedback} tick={tick} />
      {heroOpen.value && <HeroPanel sim={sim} send={send} close={() => (heroOpen.value = false)} />}
      {menuOpen.value && (
        <GameMenu
          seed={sim.seed}
          close={() => {
            menuOpen.value = false;
            paused.value = false;
            (menuButton.current ?? cameraButton.current)?.focus();
          }}
        />
      )}

      {(game.phase === 'lost' || game.phase === 'won') && <EndCard game={game} tick={tick} />}

      <div class="sr-only" aria-live="polite">
        {announcement.value}
      </div>
    </>
  );
}

/** m:ss, or h:mm:ss past an hour. */
function clock(seconds: number) {
  const t = Math.max(0, Math.floor(seconds));
  const [h, m, sec] = [Math.floor(t / 3600), Math.floor((t % 3600) / 60), t % 60];
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/** Creeps still to come this wave: on the board plus those yet to spawn. */
function creepsLeft(game: Game) {
  if (game.phase !== 'wave') return game.wavePreview.count;
  return game.creeps.length + (game.spawning?.count ?? 0);
}

/** Top centre: the round, the run's clock over the round's clock, and the creeps left. */
function RoundClock({
  sim,
  feedback,
  paused,
}: {
  sim: Sim;
  feedback: Feedback;
  paused: boolean;
  tick: number;
}) {
  const game = sim.game;
  const wave = game.wavePreview;
  const creep = wave.names.map((n) => displayName(sim.data, n)).join(' or ');
  const round = (feedback.ticks - feedback.roundStart.value) / TICK_HZ;
  const left = creepsLeft(game);
  return (
    <section class="round-clock" data-exclude aria-label="Round">
      <span class="clock-cell">
        <span class="label">Round</span>
        <span class="clock-value tabular">
          <Icon name="flag" />
          {game.level > LAST_LEVEL ? `∞${game.level}` : game.level}
        </span>
      </span>
      <span class="clock-cell clock-main">
        <span class="label tabular" title="Run time">
          {clock(sim.tick / TICK_HZ)}
        </span>
        <span class="clock-value big tabular" title="Round time">
          {clock(round)}
        </span>
      </span>
      <span class="clock-cell next" title={creep}>
        <span class="label">{game.phase === 'wave' ? 'Left' : 'Next'}</span>
        <span class="clock-value tabular">
          <Icon name="paw" />×{left}
        </span>
      </span>
      <span class="next-name">{creep}</span>
      {(paused || game.enraged) && (
        <span class={`flag ${game.enraged && !paused ? 'danger' : ''}`}>
          {paused ? 'Paused' : 'Enraged'}
        </span>
      )}
    </section>
  );
}

/** Top left, under the tools: the round's status line and, during a wave, its rewards. */
function Quest({ game, feedback }: { game: Game; feedback: Feedback; tick: number }) {
  const reward = feedback.reward.value;
  return (
    <div class="quest sr-only">
      <p
        class={`notice ${feedback.notice.value.danger ? 'danger' : ''}`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {feedback.notice.value.text}
      </p>
      {(game.phase === 'wave' || reward.kills > 0) && (
        <p class="reward tabular" aria-label="Wave rewards" title="Kills and gold this wave">
          {reward.kills} kills · +{reward.gold} gold
        </p>
      )}
    </div>
  );
}

/** Top right: the run's numbers. */
function StatsPanel({
  sim,
  mode,
  feedback,
}: {
  sim: Sim;
  mode: string;
  feedback: Feedback;
  tick: number;
}) {
  const game = sim.game;
  const totals = feedback.totals.value;
  const count = game.wavePreview.count;
  const progress =
    game.phase === 'wave' && count ? Math.round(((count - creepsLeft(game)) / count) * 100) : 0;
  return (
    <section class="stats-panel" data-exclude aria-label="Game stats">
      <dl class="run-stats tabular">
        <div>
          <dt>Mode</dt>
          <dd>{mode === 'classic' ? 'Classic' : 'Facet'}</dd>
        </div>
        <div title="Creeps killed / creeps that reached the castle">
          <dt>K/M</dt>
          <dd>
            {totals.kills} / {totals.leaks}
          </dd>
        </div>
        <div title="Ground route length in cells">
          <dt>Length</dt>
          <dd>{Math.max(0, game.route.length - 1)}</dd>
        </div>
        <div>
          <dt>Enemy</dt>
          <dd>{game.creeps.length}</dd>
        </div>
        <div title="Share of this wave's creeps dealt with">
          <dt>Progress</dt>
          <dd>{progress}%</dd>
        </div>
      </dl>
    </section>
  );
}

/** The five gems placed this round, floating over the command card while placing; a filled slot selects its gem. */
function DraftSlots({ sim }: { sim: Sim; tick: number }) {
  const game = sim.game;
  const draft = game.draft.map((id) => game.gems.find((g) => g.id === id)!);
  const picking = draft.length === DRAFT_SIZE;
  return (
    <section class="draft" aria-label="This round">
      <h2 class="draft-title">
        {picking ? (
          'Keep one gem or combine'
        ) : (
          <>
            Place gems <span class="tabular">({draft.length}/5)</span>
          </>
        )}
      </h2>
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
          const name = displayName(sim.data, g.name);
          const label = `Gem ${i + 1} of 5: ${name}, cell ${g.cell.x}, ${g.cell.y}`;
          const active = selected.value !== null && same(selected.value, g.cell);
          const combines = game.combineOptions(g.id).length > 0;
          return (
            <button
              class={`slot gem-${g.name[6]}`}
              aria-label={label}
              title={combines ? `${label}. Can combine.` : label}
              aria-pressed={active}
              onClick={() => {
                selected.value = { ...g.cell };
                announcement.value = `Selected ${name}`;
              }}
            >
              <span class="slot-n">{i + 1}</span>
              <TowerIcon name={g.name} />
              <span class="slot-code">{code(g.name)}</span>
              {combines && <span class="combine-dot" aria-hidden="true" />}
            </button>
          );
        })}
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
          Gold {compact(game.gold)} · Build level {game.heroLevel}
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

/** A settings button with its icon, name and shortcut; pressed when it toggles something on. */
function MenuToggle(p: {
  label: string;
  /** Visible text when shorter than the accessible label. */
  text?: string;
  /** Keyboard shortcut, shown and exposed to assistive technology. */
  hint?: string;
  pressed?: boolean;
  onClick: () => void;
  children: ComponentChildren;
}) {
  return (
    <button
      class="menu-toggle"
      aria-label={p.label}
      aria-keyshortcuts={p.hint}
      aria-pressed={p.pressed}
      onClick={p.onClick}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {p.children}
      </svg>
      <span>{p.text ?? p.label}</span>
      {p.hint && <kbd aria-hidden="true">{p.hint}</kbd>}
    </button>
  );
}
