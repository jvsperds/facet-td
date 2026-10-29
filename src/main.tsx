import { effect, signal } from '@preact/signals';
import { render } from 'preact';
import { createAudio } from './audio';
import { loadData, type Mode } from './data';
import { Hud } from './hud/Hud';
import { pinned, pinnedIngredients } from './hud/RecipeBook';
import { prewarmIcons } from './hud/TowerIcon';
import { readRecipes } from './sim/progression';
import type { Cell } from './sim/board';
import { createFeedback } from './hud/feedback';
import { createCameraInput, cursor, hovered, selected, selectedCreep } from './input/camera';
import { Sim, TICK_HZ, type Cmd } from './sim/sim';
import { createWorld } from './world/world';
import { prewarmTowers } from './world/pieces';
import './style.css';

const mode: Mode = 'classic';
const params = new URLSearchParams(location.search);
// `?title` shows the title screen over an idle board instead of a run.
const title = params.has('title');
// The seed is the only outside input; `?seed=` replays a game.
const seed = Number(params.get('seed')) || Date.now() >>> 0;
const sim = new Sim(loadData(mode), seed);
const board = sim.board;
const world = createWorld(board, sim.game);
document.body.prepend(world.canvas);
const send = (cmd: Cmd) => sim.send(0, cmd);
const actions = createCameraInput(world, board, send, (cell) => sim.game.canBuild(cell).ok);
/** Bumped after sim steps so the HUD re-reads sim state. */
const ticked = signal(0);
const paused = signal(title);
/** Game speed: sim ticks per real tick (1x, 2x, 4x). */
const speed = signal(1);
const routeVisible = signal(false);
/** Tower aura rings on the board; a per-browser preference. */
const aurasVisible = signal(
  (() => {
    try {
      return localStorage.getItem('facet-td:auras') !== 'off';
    } catch {
      return true;
    }
  })(),
);
const feedback = createFeedback(sim.game);
const audio = createAudio();
addEventListener('pointerdown', () => audio.unlock());
addEventListener('keydown', () => audio.unlock());

const hudRoot = document.getElementById('hud')!;
render(
  <Hud
    sim={sim}
    ticked={ticked}
    paused={paused}
    speed={speed}
    send={send}
    actions={actions}
    mode={mode}
    feedback={feedback}
    audio={audio}
    routeVisible={routeVisible}
    aurasVisible={aurasVisible}
    title={title}
  />,
  hudRoot,
);

// Camera fit avoids every HUD panel, re-measured whenever the window or a panel changes size.
const measure = () => {
  world.resize(innerWidth, innerHeight);
  world.setPanels(
    [...hudRoot.querySelectorAll('[data-exclude]')].map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    }),
  );
};
const panelObserver = new ResizeObserver(measure);
new MutationObserver(() => {
  hudRoot.querySelectorAll('[data-exclude]').forEach((el) => panelObserver.observe(el));
  measure(); // panels that appear or disappear change the fit
}).observe(hudRoot, {
  childList: true,
  subtree: true,
});
hudRoot.querySelectorAll('[data-exclude]').forEach((el) => panelObserver.observe(el));
addEventListener('resize', measure);
measure();

effect(() => world.setMarks(selected.value, cursor.value));
effect(() => world.markCreep(selectedCreep.value));
// The last wave's MVP stays circled on the board through the build phase.
effect(() => {
  void ticked.value;
  const gem =
    sim.game.phase === 'build' ? sim.game.gems.find((g) => g.id === feedback.mvp.value) : undefined;
  world.setMvp(gem ? gem.cell : null);
});
// Row and column guides follow the pointer, else the keyboard cursor, else the selection.
effect(() => world.setGuides(hovered.value ?? cursor.value ?? selected.value));
// The selected tower's attack range, refreshed when the selection or the towers change.
effect(() => {
  void ticked.value;
  const cell = selected.value;
  const gem = cell ? sim.game.gemAt(cell) : undefined;
  world.setRange(gem ? gem.cell : null, gem ? sim.game.attackRange(gem) : 0);
});
effect(() => world.setRouteVisible(routeVisible.value));
effect(() => {
  world.setAurasVisible(aurasVisible.value);
  try {
    localStorage.setItem('facet-td:auras', aurasVisible.value ? 'on' : 'off');
  } catch {
    // Storage unavailable: the choice lasts for this session.
  }
});
// Towers that can combine glow gold; draft gems that keep as a better gem, and the ingredients of
// pinned recipes, glow blue.
effect(() => {
  void ticked.value;
  const g = sim.game;
  const pins = pinnedIngredients(sim.data, pinned.value);
  const combine: Cell[] = [];
  const better: Cell[] = [];
  for (const gem of g.gems) {
    if (g.combineOptions(gem.id).length) combine.push(gem.cell);
    else if (
      (g.draft.includes(gem.id) && (g.keepResult(gem.id, 1).ok || g.keepResult(gem.id, 2).ok)) ||
      pins.has(gem.name)
    )
      better.push(gem.cell);
  }
  world.setHighlights(combine, better);
});

// Fixed-rate sim clock. Pausing stops stepping; queued commands apply on resume.
world.afterStep();
let last = performance.now();
let acc = 0;
let lastShown = '';
setInterval(() => {
  const now = performance.now();
  acc += (Math.min(now - last, 250) / 1000) * speed.value;
  last = now;
  if (paused.value) acc = 0;
  let stepped = false;
  for (; acc >= 1 / TICK_HZ; acc -= 1 / TICK_HZ) {
    sim.step();
    world.afterStep();
    audio.play(feedback.afterStep());
    stepped = true;
  }
  // Re-render the HUD only when something it shows changed; build checks there run route searches.
  const g = sim.game;
  const shown = [
    g.phase,
    g.level,
    g.castleHp,
    g.enraged,
    g.gold,
    g.xp,
    g.creeps.length,
    g.draft.length,
    g.gems.length,
    g.stones.size,
    g.gems
      .map((gem) => `${gem.name}:${gem.level ?? 0}:${gem.aim ?? 0}:${gem.holdFire ?? 0}`)
      .join(),
    JSON.stringify(g.hero),
    // Once a second: the round clock and hero cooldowns.
    Math.floor(sim.tick / TICK_HZ),
  ].join();
  if (stepped && shown !== lastShown) {
    lastShown = shown;
    ticked.value++;
  }
}, 1000 / TICK_HZ);

// Every gem, recipe and pedal model and icon is built while the board idles, ahead of placement.
const towerNames = [
  ...'dbyrgpqe'
    .split('')
    .flatMap((t) => [1, 2, 3, 4, 5, 6].map((q) => `gemtd_${t}${'1'.repeat(q)}`)),
  ...readRecipes(sim.data).flatMap((r) => [r.result, ...r.ingredients]),
];
prewarmTowers(towerNames);
prewarmIcons(towerNames);

// Test hook for the Playwright smoke test (dev server only).
if (import.meta.env.DEV) Object.assign(window, { facet: { world, board, sim } });
