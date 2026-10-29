import { useSignal, type Signal } from '@preact/signals';
import type { ComponentChildren, Ref } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { Audio } from '../audio';
import type { Feedback } from './feedback';
import type { Cell } from '../sim/board';
import { DRAFT_SIZE, LAST_LEVEL, isBasicGem, qualityOf, type Check, type Game } from '../sim/game';
import type { RecipeKind } from '../sim/progression';
import type { Cmd, Sim } from '../sim/sim';
import { DamageMeter } from './DamageMeter';
import { HeroPanel } from './HeroPanel';
import { GemGlyph, GlyphDefs, ICONS, Icon } from './icons';
import { QUALITY, code, compact, displayName, gemType, isTablet, roleOf } from './names';
import { Ingredient, RecipeBook, recipesUsing } from './RecipeBook';
import { announcement, rotateMode, selected, view, type CameraActions } from '../input/camera';

// DOM overlay on the full-screen arena (references: the user's Facet prototype and GemTD):
// - top bar: wave with a preview of the next wave, castle HP, gold, build level and XP;
// - top left: the phase card with the five gems placed this round;
// - lower left: the inspector (stat tiles, "builds into" recipes, actions with key hints);
// - lower right: grouped toolbar (pause and speed, panels, camera) with the camera flyout;
// - right: recipe book drawer and this wave's damage meter.
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
};

const same = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;
const typing = (e: KeyboardEvent) =>
  e.target instanceof HTMLInputElement ||
  e.target instanceof HTMLSelectElement ||
  e.target instanceof HTMLTextAreaElement;

export function Hud(props: Props) {
  const { sim, ticked, paused, speed, send, actions, mode, feedback, audio, routeVisible } = props;
  // Passed down as a prop: signal-aware components skip re-renders when only their parent's signals change.
  const tick = ticked.value;
  const game = sim.game;
  const flyout = useSignal(false);
  const heroOpen = useSignal(false);
  const recipesOpen = useSignal(false);
  const meterOpen = useSignal(matchMedia('(min-width: 1101px)').matches);
  const cameraButton = useRef<HTMLButtonElement>(null);
  const heroButton = useRef<HTMLButtonElement>(null);
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
      else if (k === 'escape' && recipesOpen.value) recipesOpen.value = false;
      else if (k === 'k' || k === 'c') {
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

  return (
    <>
      <GlyphDefs />
      <TopBar sim={sim} paused={paused.value} mode={mode} />
      <PhaseCard sim={sim} tick={tick} feedback={feedback} paused={paused.value} />
      <Inspector sim={sim} send={send} tick={tick} />
      {recipesOpen.value ? (
        <RecipeBook data={sim.data} game={game} close={() => (recipesOpen.value = false)} />
      ) : (
        meterOpen.value &&
        (game.phase === 'wave' || Object.keys(game.damageThisWave).length > 0) && (
          <DamageMeter data={sim.data} game={game} />
        )
      )}
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
          <div class="group">
            <Tool label="Pause" hint="P" pressed={paused.value} onClick={togglePause}>
              {paused.value ? ICONS.play : ICONS.pause}
            </Tool>
            {SPEEDS.map(([s, label], i) => (
              <button
                class="speed tabular"
                aria-label={label}
                aria-keyshortcuts={`${i + 1}`}
                data-tip={`${label} (${i + 1})`}
                aria-pressed={speed.value === s}
                onClick={() => setSpeed(s, label)}
              >
                {s}×
              </button>
            ))}
          </div>
          <div class="group">
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
              label="Hero"
              hint="H"
              haspopup="dialog"
              ref={heroButton}
              onClick={() => (heroOpen.value = true)}
            >
              {ICONS.hero}
            </Tool>
            <Tool
              label="Routes"
              pressed={routeVisible.value}
              onClick={() => (routeVisible.value = !routeVisible.value)}
            >
              {ICONS.route}
            </Tool>
          </div>
          <div class="group">
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
          </div>
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

function TopBar({ sim, paused, mode }: { sim: Sim; paused: boolean; mode: string }) {
  const game = sim.game;
  const hp = Math.max(0, game.castleHp);
  const level = game.heroLevel;
  const [from, to] = [XP_LEVELS[level - 1] ?? 0, XP_LEVELS[level]];
  const xpShare = to ? Math.min(1, (game.xp - from) / (to - from)) : 1;
  const wave = game.wavePreview;
  const creep = wave.names.map((n) => displayName(sim.data, n)).join(' or ');
  return (
    <header class="status" data-exclude>
      <div class="status-row">
        <strong class="brand">Facet TD</strong>
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
          <span class={`phase ${game.enraged && !paused ? 'danger' : ''}`}>
            {paused ? 'Paused' : 'Enraged'}
          </span>
        )}
      </div>
      <div class="status-row resources">
        <span
          class={`castle tabular ${hp <= 25 ? 'danger' : ''}`}
          aria-label={`Castle ${game.castleHp} of ${CASTLE_MAX} HP`}
        >
          <Icon name="heart" />
          <span class="meter" aria-hidden="true">
            <span style={{ width: `${Math.min(100, (hp / CASTLE_MAX) * 100)}%` }} />
          </span>
          Castle {game.castleHp}
        </span>
        <span class="gold tabular">
          <Icon name="coin" />
          Gold {game.gold}
        </span>
        <span
          class="level tabular"
          title={
            level < 5 ? `${game.xp} of ${to} XP to the next build level` : 'Highest build level'
          }
        >
          Build Lv {level}
          <span class="meter xp" aria-hidden="true">
            <span style={{ width: `${xpShare * 100}%` }} />
          </span>
        </span>
      </div>
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
                <GemGlyph type={gemType(g.name)} />
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

/** The headline ability as a stat tile: label, value, detail. */
function abilityTile(game: Game, name: string): [string, string, string] | null {
  for (const a of game.abilities(name)) {
    if (a.kind === 'poison')
      return ['Poison', `${a.amount / a.interval}/s`, `${a.duration}s, stacks`];
    if (a.kind === 'slow') return ['Slow', `${a.amount}`, `${a.duration}s on hit`];
    if (a.kind === 'splash')
      return ['Splash', `${a.amount * 100}%`, `${a.radius.toFixed(1)} tiles`];
    if (a.kind === 'split') return ['Targets', `+${a.count}`, 'per attack'];
    if (a.kind === 'armor') return ['Armour', `${a.amount}`, `${a.duration}s on hit`];
    if (a.kind === 'aura') return ['Aura', `+${a.amount}`, `${a.radius.toFixed(1)} tiles`];
    if (a.kind === 'speed') return ['Speed', `+${a.amount}`, 'attack speed'];
    if (a.kind === 'critical') return ['Critical', `×${a.multiplier}`, `${a.chance}% chance`];
  }
  return null;
}

function Inspector({ sim, send }: { sim: Sim; send: (cmd: Cmd) => void; tick: number }) {
  const game = sim.game;
  const pending = useSignal<{ id: number; kind: RecipeKind; result: string } | null>(null);
  // Short phones start with the sheet collapsed to its title and actions so the board keeps room.
  const collapsed = useSignal(matchMedia('(max-width: 600px) and (max-height: 700px)').matches);
  const cell = selected.value;
  const toggle = (
    <button
      class="icon-button collapse"
      aria-label={collapsed.value ? 'Show details' : 'Hide details'}
      aria-expanded={!collapsed.value}
      aria-controls="info-body"
      onClick={() => (collapsed.value = !collapsed.value)}
    >
      <Icon name={collapsed.value ? 'chevronUp' : 'chevronDown'} />
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
          <p class="muted keys">
            <kbd>P</kbd> pause · <kbd>1</kbd>–<kbd>3</kbd> speed · <kbd>R</kbd> recipes ·{' '}
            <kbd>D</kbd> damage
          </p>
        </div>
      </section>
    );
  const gem = game.gemAt(cell);
  const kind = sim.board.kind(cell);
  let title = 'Open cell';
  let subtitle = '';
  let detail = '';
  const tiles: [string, string, string?][] = [];
  let special: [string, string, string] | null = null;
  const notes: string[] = [];
  const buttons: [string, Check, Cmd, string?][] = [];
  const name = gem?.name;
  if (gem && name) {
    const u = game.unit(name);
    title = displayName(sim.data, name);
    const draftGem = game.draft.includes(gem.id);
    subtitle = [
      isTablet(name) ? 'Pedal' : isBasicGem(name) ? 'Gem' : 'Combined tower',
      roleOf(game.abilities(name)),
      ...(draftGem ? ['this round'] : []),
    ].join(' · ');
    const interval = game.attackInterval(gem);
    tiles.push(
      ['Damage', `${u.AttackDamageMin ?? 0}–${u.AttackDamageMax ?? 0}`],
      [
        'Attacks/s',
        interval > 0 ? (1 / interval).toFixed(1) : '—',
        `every ${interval.toFixed(2)}s`,
      ],
      ['Range', `${game.attackRange(gem).toFixed(1)} tiles`],
    );
    special = abilityTile(game, name);
    notes.push(...abilityNotes(game, name));
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
          notes.push(`Keep +${up} makes ${displayName(sim.data, r.name).toLowerCase()}`);
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
  if (!gem && kind !== 'waypoint' && kind !== 'no-build')
    buttons.unshift(['Place gem', game.canBuild(cell), { type: 'build', cell }, 'B']);
  const refusal = buttons.find(([, check]) => !check.ok)?.[1];
  const combines = gem ? game.combineOptions(gem.id) : [];
  const onBoard = game.gems.map((g) => g.name);
  const buildsInto =
    name && !isTablet(name) ? recipesUsing(sim.data, name, onBoard).slice(0, 3) : [];
  // The first enabled command is the primary action and takes the accent fill.
  const primary = combines.length ? -1 : buttons.findIndex(([, check]) => check.ok);
  const type = name ? gemType(name) : undefined;
  return (
    <section class={cls} data-exclude aria-label="Selection">
      <div class="info-head">
        {name && (
          <span class={`swatch ${type ? `gem-${type}` : ''}`}>
            <GemGlyph type={type} />
            <span class="badge tabular">{code(name)}</span>
          </span>
        )}
        <div class="info-title">
          <h2>
            {name && isBasicGem(name) && (
              <span
                class="quality tabular"
                title={`${QUALITY[qualityOf(name)]}, tier ${qualityOf(name)} of 6`}
              >
                {qualityOf(name)}
              </span>
            )}
            {title}
          </h2>
          <p class="muted tabular">
            {subtitle && `${subtitle} · `}Cell {cell.x}, {cell.y}
          </p>
        </div>
        {toggle}
        <button
          class="icon-button"
          aria-label="Deselect"
          onClick={() => {
            selected.value = null;
            pending.value = null;
            announcement.value = 'Selection cleared';
            document.querySelector('canvas')?.focus();
          }}
        >
          <Icon name="close" />
        </button>
      </div>
      <div class="info-body" id="info-body">
        {detail && <p>{detail}</p>}
        {tiles.length > 0 && (
          <dl class="tiles tabular">
            {tiles.map(([k, val, sub]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{val}</dd>
                {sub && <dd class="sub">{sub}</dd>}
              </div>
            ))}
            {special && (
              <div class="special">
                <dt>{special[0]}</dt>
                <dd>{special[1]}</dd>
                <dd class="sub">{special[2]}</dd>
              </div>
            )}
          </dl>
        )}
        {notes.length > 0 && (
          <ul class="notes">
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
        {buildsInto.length > 0 && (
          <>
            <h3 class="section-label">Builds into</h3>
            <ul class="builds" role="list">
              {buildsInto.map(({ recipe, have }) => (
                <li key={recipe.result}>
                  <span class="recipe-name">
                    {displayName(sim.data, recipe.result)}
                    {recipe.kind === 'secret' && <span class="chip secret">Secret</span>}
                    <span class="progress tabular">
                      {have.filter(Boolean).length}/{have.length}
                    </span>
                  </span>
                  <span class="chips">
                    {recipe.ingredients.map((n, i) => (
                      <Ingredient data={sim.data} name={n} have={have[i]} />
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        {refusal && !refusal.ok && <p class="muted reason">{refusal.reason}</p>}
      </div>
      {pending.value && (
        <div class="actions">
          <p>Select an empty cell for {displayName(sim.data, pending.value.result)}.</p>
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
      {(combines.length > 0 || buttons.length > 0) && (
        <div class="actions">
          {combines.map((p, i) => (
            <button
              class={i === 0 ? 'primary' : undefined}
              aria-keyshortcuts={i === 0 && p.placement !== 'separate' ? 'C' : undefined}
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
              Combine: {displayName(sim.data, p.result)}
              {i === 0 && p.placement !== 'separate' && <kbd aria-hidden="true">C</kbd>}
            </button>
          ))}
          {buttons.map(([label, check, cmd, key], i) => (
            <button
              class={i === primary ? 'primary' : undefined}
              disabled={!check.ok}
              aria-keyshortcuts={key}
              onClick={() => send(cmd)}
            >
              {label}
              {key && <kbd aria-hidden="true">{key}</kbd>}
            </button>
          ))}
        </div>
      )}
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
