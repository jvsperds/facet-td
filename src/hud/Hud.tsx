import { useSignal, type Signal } from '@preact/signals';
import type { ComponentChildren, Ref } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { Audio } from '../audio';
import type { Feedback } from './feedback';
import type { Cell } from '../sim/board';
import { DRAFT_SIZE, LAST_LEVEL, type Game } from '../sim/game';
import type { RecipeKind } from '../sim/progression';
import type { Cmd, Sim } from '../sim/sim';
import { CommandCard, SKILL_KEYS, heroTarget } from './CommandCard';
import { DamageMeter } from './DamageMeter';
import { HeroPanel } from './HeroPanel';
import { GlyphDefs, ICONS, Icon } from './icons';
import { GameMenu, TitleScreen } from './Menu';
import { TowerIcon } from './TowerIcon';
import { code, compact, displayName } from './names';
import { PinnedRecipes, RecipeBook } from './RecipeBook';
import {
  announcement,
  rotateMode,
  selected,
  selectedCreep,
  view,
  type CameraActions,
} from '../input/camera';

// DOM overlay on the full-screen cave, laid out after GemTD's HUD:
// - top bar: wave and the coming creep, castle HP, gold, build level and XP, and the menu;
// - top left: this round's five gems, compact;
// - bottom centre: the command card (hero and skills, or the selection) with its hotkeys;
// - right edge: a small vertical tool strip; beside it pinned recipes, the recipe book and the
//   damage meter.
// Panels marked data-exclude are measured and kept clear of playable cells by the camera fit.

const XP_LEVELS = [0, 250, 650, 1200, 1900];
const CASTLE_MAX = 100;
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
      } else if (k === 'r') recipesOpen.value = !recipesOpen.value;
      else if (k === 'd') meterOpen.value = !meterOpen.value;
      else if (k === 'h') heroOpen.value = true;
      else if (k === 't') actions.toggleMode();
      else if (k === 'a') {
        aurasVisible.value = !aurasVisible.value;
        announcement.value = aurasVisible.value ? 'Auras shown' : 'Auras hidden';
      } else if (k === 'escape') {
        // Close the book, else drop the selection, else open the menu (GemTD's Esc).
        if (recipesOpen.value) recipesOpen.value = false;
        else if (selected.value || selectedCreep.value !== null) {
          selected.value = null;
          selectedCreep.value = null;
          announcement.value = 'Selection cleared';
        } else openMenu();
      } else if (SKILL_KEYS.includes(e.key.toUpperCase())) {
        const g = sim.game;
        const skill = g.heroActions().filter((a) => a.supported)[
          SKILL_KEYS.indexOf(e.key.toUpperCase())
        ];
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
      <TopBar
        sim={sim}
        paused={paused.value}
        mode={mode}
        menuButton={menuButton}
        openMenu={openMenu}
      />
      <PhaseCard sim={sim} tick={tick} feedback={feedback} paused={paused.value} />
      <CommandCard sim={sim} send={send} tick={tick} openHero={() => (heroOpen.value = true)} />
      <div class="side">
        <PinnedRecipes data={sim.data} game={game} />
        {recipesOpen.value ? (
          <RecipeBook data={sim.data} game={game} close={() => (recipesOpen.value = false)} />
        ) : (
          meterOpen.value &&
          (game.phase === 'wave' || Object.keys(game.damageThisWave).length > 0) && (
            <DamageMeter data={sim.data} game={game} />
          )
        )}
      </div>
      {heroOpen.value && <HeroPanel sim={sim} send={send} close={() => (heroOpen.value = false)} />}
      {menuOpen.value && (
        <GameMenu
          seed={sim.seed}
          close={() => {
            menuOpen.value = false;
            paused.value = false;
            menuButton.current?.focus();
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
              aria-pressed={aurasVisible.value}
              aria-keyshortcuts="A"
              onClick={() => (aurasVisible.value = !aurasVisible.value)}
            >
              Show auras <kbd aria-hidden="true">A</kbd>
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
        <div
          class="strip panel"
          role="toolbar"
          aria-label="Tools"
          aria-orientation="vertical"
          onKeyDown={rovingFocus}
        >
          <Tool label="Pause" hint="P" pressed={paused.value} onClick={togglePause}>
            {paused.value ? ICONS.play : ICONS.pause}
          </Tool>
          {SPEEDS.map(([s, label], i) => (
            <button
              class="tool speed tabular"
              aria-label={label}
              aria-keyshortcuts={`${i + 1}`}
              data-tip={`${label} (${i + 1})`}
              aria-pressed={speed.value === s}
              onClick={() => setSpeed(s, label)}
            >
              {s}×
            </button>
          ))}
          <span class="sep" aria-hidden="true" />
          <Tool
            label="Recipes"
            hint="R"
            pressed={recipesOpen.value}
            onClick={() => (recipesOpen.value = !recipesOpen.value)}
          >
            {ICONS.book}
          </Tool>
          <Tool
            label="Damage"
            hint="D"
            pressed={meterOpen.value && !recipesOpen.value}
            onClick={() => {
              recipesOpen.value = false;
              meterOpen.value = !meterOpen.value;
            }}
          >
            {ICONS.meter}
          </Tool>
          <Tool
            label="Routes"
            pressed={routeVisible.value}
            onClick={() => (routeVisible.value = !routeVisible.value)}
          >
            {ICONS.route}
          </Tool>
          <span class="sep" aria-hidden="true" />
          <Tool
            label={v.mode === 'iso' ? 'Switch to top view' : 'Switch to isometric view'}
            hint="T"
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
        </div>
      </div>

      {(game.phase === 'lost' || game.phase === 'won') && <EndCard game={game} tick={tick} />}

      <div class="sr-only" aria-live="polite">
        {announcement.value}
      </div>
    </>
  );
}

function rovingFocus(e: KeyboardEvent) {
  const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
  if (!step) return;
  const buttons = [...(e.currentTarget as HTMLElement).querySelectorAll('button')];
  const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
  if (i < 0) return;
  buttons[(i + step + buttons.length) % buttons.length].focus();
  e.preventDefault();
}

function TopBar({
  sim,
  paused,
  mode,
  menuButton,
  openMenu,
}: {
  sim: Sim;
  paused: boolean;
  mode: string;
  menuButton: Ref<HTMLButtonElement>;
  openMenu: () => void;
}) {
  const game = sim.game;
  const hp = Math.max(0, game.castleHp);
  const level = game.heroLevel;
  const [from, to] = [XP_LEVELS[level - 1] ?? 0, XP_LEVELS[level]];
  const xpShare = to ? Math.min(1, (game.xp - from) / (to - from)) : 1;
  const wave = game.wavePreview;
  const creep = wave.names.map((n) => displayName(sim.data, n)).join(' or ');
  return (
    <header class="topbar" data-exclude>
      <strong class="brand">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2.5 20 8l-3 11.5H7L4 8z M4 8h16 M12 2.5 9 8l3 11.5L15 8z" />
        </svg>
        Facet TD
      </strong>
      <span class="tag">{mode === 'classic' ? 'Classic' : 'Facet'}</span>
      <span class="wave tabular">
        <span class="label">Wave</span>
        <b>{game.level > LAST_LEVEL ? `∞${game.level}` : game.level}</b>
        {game.level <= LAST_LEVEL && <span class="of">/{LAST_LEVEL}</span>}
      </span>
      <span class="next" title={creep}>
        <span class="label">{game.phase === 'wave' ? 'Now' : 'Next'}</span>
        <span class="next-name">{creep}</span>
        <span class="tabular muted">×{wave.count}</span>
      </span>
      {(paused || game.enraged) && (
        <span class={`flag ${game.enraged && !paused ? 'danger' : ''}`}>
          {paused ? 'Paused' : 'Enraged'}
        </span>
      )}
      <span class="spacer" />
      <span
        class={`castle tabular ${hp <= 25 ? 'danger' : ''}`}
        aria-label={`Castle ${game.castleHp} of ${CASTLE_MAX} HP`}
      >
        <Icon name="heart" />
        <span class="blocks" aria-hidden="true">
          {Array.from({ length: 10 }, (_, i) => (
            <i class={hp > i * 10 ? (hp >= (i + 1) * 10 ? 'on' : 'part') : ''} />
          ))}
        </span>
        {game.castleHp}
      </span>
      <span class="gold tabular" aria-label={`Gold ${game.gold}`}>
        <Icon name="coin" />
        {compact(game.gold)}
      </span>
      <span
        class="level tabular"
        title={level < 5 ? `${game.xp} of ${to} XP to the next build level` : 'Highest build level'}
      >
        <span class="label">Lv</span>
        <b>{level}</b>
        <span class="meter xp" aria-hidden="true">
          <span style={{ width: `${xpShare * 100}%` }} />
        </span>
      </span>
      <button
        class="menu-button"
        ref={menuButton}
        aria-haspopup="dialog"
        aria-keyshortcuts="Escape"
        onClick={openMenu}
      >
        <Icon name="menu" />
        Menu
        <kbd aria-hidden="true">Esc</kbd>
      </button>
    </header>
  );
}

/** The five gems placed this round (IMPLEMENTATION.md "HUD and input"); a filled slot selects its gem. */
function PhaseCard({
  sim,
  feedback,
  paused,
}: {
  sim: Sim;
  tick: number;
  feedback: Feedback;
  paused: boolean;
}) {
  const game = sim.game;
  const draft = game.draft.map((id) => game.gems.find((g) => g.id === id)!);
  const reward = feedback.reward.value;
  const picking = game.phase === 'build' && draft.length === DRAFT_SIZE;
  const chip = paused
    ? 'Paused'
    : game.phase === 'wave'
      ? 'Wave'
      : picking
        ? 'Picking'
        : game.phase === 'build'
          ? 'Building'
          : 'Over';
  return (
    <section class="panel summary" data-exclude aria-label="This round">
      <div class="panel-head">
        <span class={`chip phase-chip ${game.phase === 'wave' ? 'wave' : ''}`}>{chip}</span>
        <p class="reward tabular" aria-label="Wave rewards" title="Kills and gold this wave">
          {reward.kills} kills · +{reward.gold} gold
        </p>
      </div>
      <h2 class="panel-title">
        {game.phase === 'wave' ? (
          `Wave ${game.level}`
        ) : picking ? (
          'Keep one gem or combine'
        ) : (
          <>
            Place gems <span class="tabular">({draft.length}/5)</span>
          </>
        )}
      </h2>
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

function Tool(p: {
  label: string;
  /** Keyboard shortcut, shown in the tooltip and exposed to assistive technology. */
  hint?: string;
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
      aria-keyshortcuts={p.hint}
      data-tip={p.hint ? `${p.label} (${p.hint})` : p.label}
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
