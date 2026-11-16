import { effect, signal } from '@preact/signals';
import { render } from 'preact';
import { createAudio } from './audio';
import { loadData, type Mode } from './data';
import { Hud } from './hud/Hud';
import { pinned, pinnedIngredients } from './hud/RecipeBook';
import { prewarmIcons, setIconsBusy } from './hud/TowerIcon';
import { readRecipes } from './sim/progression';
import type { Cell } from './sim/board';
import { createFeedback } from './hud/feedback';
import {
  createCameraInput,
  cursor,
  hovered,
  rotateMode,
  selected,
  selectedCreep,
  view,
} from './input/camera';
import { Sim, TICK_HZ, type Cmd } from './sim/sim';
import { WIP } from './hud/flags';
import { completeProfileQuests, loadProfile, loadRunConfig } from './profile/profile';
import { loadSavedRun, recordRun, saveRun } from './profile/runs';
import { completedQuests } from './sim/quests';
import { createWorld } from './world/world';
import { prewarmTowers } from './world/pieces';
import { setupPreview } from './preview';
import { GUIDES, guideCells } from './world/guides';
import './style.css';
import './hud/slate.css';
import './hud/skin-a.css';

const mode: Mode = 'classic';
const params = new URLSearchParams(location.search);
// A bare launch (or `?title`) shows the title screen over an idle board; a run needs `?seed` or `?resume`.
const title = params.has('title') || !(params.has('seed') || params.has('resume'));
// The seed is the only outside input; `?seed=` replays a game.
const seed = Number(params.get('seed')) || Date.now() >>> 0;
// `?wip` keeps the free hero loadout (sandbox); a normal run's hero is fixed by its config.
const data = loadData(mode);
const restored = params.has('resume') ? loadSavedRun(data) : null;
const sim =
  restored ??
  new Sim(data, seed, WIP ? { ...loadRunConfig(data), sandbox: true } : loadRunConfig(data));
const board = sim.board;
const world = createWorld(board, sim.game);
document.body.prepend(world.canvas);
const send = (cmd: Cmd) => sim.send(0, cmd);
const actions = createCameraInput(world, board, send, (cell) => sim.game.canBuild(cell).ok);
/** Camera and speed outlive the page, so a restart or new run keeps them. */
const PREFS_KEY = 'facet-td:view';
const prefs = (() => {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null') as {
      view?: typeof view.value;
      rotate?: boolean;
      speed?: number;
    } | null;
  } catch {
    return null;
  }
})();
if (prefs?.view) {
  view.value = { ...view.value, ...prefs.view };
  world.setView(view.value, false);
}
if (prefs?.rotate) rotateMode.value = true;
/** Bumped after sim steps so the HUD re-reads sim state. */
const ticked = signal(0);
const paused = signal(title);
/** Game speed: sim ticks per real tick (1x, 2x, 4x). */
const speed = signal([1, 2, 4, 10].includes(prefs?.speed ?? 1) ? (prefs?.speed ?? 1) : 1);
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
/** The maze guide shown on the board (by name, '' for none); a per-browser preference. */
const mazeGuide = signal(
  (() => {
    try {
      return localStorage.getItem('facet-td:maze-guide') ?? '';
    } catch {
      return '';
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
    mazeGuide={mazeGuide}
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

effect(() => {
  const saved = { view: view.value, rotate: rotateMode.value, speed: speed.value };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(saved));
  } catch {
    // Storage unavailable: the settings last for this page.
  }
});
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
effect(() => {
  const guide = GUIDES.find((g) => g.name === mazeGuide.value);
  world.setMazeGuide(guide ? guideCells(guide.rows) : []);
  try {
    localStorage.setItem('facet-td:maze-guide', mazeGuide.value);
  } catch {
    // The guide still shows for this session.
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
let lastShown = NaN;
let savedLevel = sim.game.level;
let recordedEnd = false;
/** Small integer ids for strings the HUD signature mixes (gem names, aim modes, hero skills). */
const stringIds = new Map<string, number>();
const towerId = (text: string) => {
  let id = stringIds.get(text);
  if (id === undefined) stringIds.set(text, (id = stringIds.size + 1));
  return id;
};
setInterval(() => {
  const now = performance.now();
  acc += (Math.min(now - last, 250) / 1000) * speed.value;
  last = now;
  if (paused.value) acc = 0;
  let stepped = false;
  for (; acc >= 1 / TICK_HZ; acc -= 1 / TICK_HZ) {
    sim.step();
    world.afterStep();
    audio.step(sim.game, feedback.afterStep());
    stepped = true;
  }
  // Re-render the HUD only when something it shows changed; build checks there run route searches.
  const g = sim.game;
  // An integer mix of everything the HUD shows: no strings or arrays built per tick.
  let h = 0;
  const mix = (v: number) => (h = Math.imul(h ^ Math.round(v * 4096), 0x01000193));
  const mixText = (text: string) => {
    mix(text.length);
    for (let i = 0; i < text.length; i++) mix(text.charCodeAt(i));
  };
  mixText(g.phase);
  mix(g.level);
  mix(g.castleHp);
  mix(g.enraged ? 1 : 0);
  mix(g.gold);
  mix(g.xp);
  mix(g.creeps.length);
  mix(g.draft.length);
  mix(g.gems.length);
  mix(g.stones.size);
  for (const gem of g.gems) {
    mix(gem.id);
    mix(towerId(gem.name));
    mix(gem.level ?? 0);
    mix(gem.aim ?? 0);
    mix(gem.holdFire ? 1 : 0);
  }
  mixText(g.hero.selected);
  for (const k in g.hero.abilities) mix(towerId(k) * 31 + g.hero.abilities[k]);
  for (const k in g.hero.cooldowns) mix(towerId(k) * 31 + g.hero.cooldowns[k]);
  // Once a second: the round clock and hero cooldowns.
  mix(Math.floor(sim.tick / TICK_HZ));
  const shown = h;
  if (stepped && shown !== lastShown) {
    lastShown = shown;
    ticked.value++;
  }
  if (!title && stepped && g.level !== savedLevel && g.phase !== 'lost' && g.phase !== 'won') {
    savedLevel = g.level;
    saveRun(sim);
  }
  if (!title && !recordedEnd && (g.phase === 'lost' || g.phase === 'won')) {
    recordedEnd = true;
    const profile = loadProfile(data);
    completeProfileQuests(profile, completedQuests(g.stats, sim.config));
    recordRun(sim);
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
// Icons render only between waves, so the second WebGL context never competes with play.
setIconsBusy(() => sim.game.phase === 'wave');
prewarmIcons(towerNames);
if (params.get('preview') === 'all') setupPreview(sim, towerNames);

// Test hook for the Playwright smoke test (dev server only).
if (import.meta.env.DEV) Object.assign(window, { facet: { world, board, sim } });
