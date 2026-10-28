import { effect, signal } from '@preact/signals';
import { render } from 'preact';
import { createAudio } from './audio';
import { loadData, type Mode } from './data';
import { Hud } from './hud/Hud';
import { createFeedback } from './hud/feedback';
import { createCameraInput, cursor, selected } from './input/camera';
import { Sim, TICK_HZ, type Cmd } from './sim/sim';
import { createWorld } from './world/world';
import './style.css';

const mode: Mode = 'classic';
// The seed is the only outside input; `?seed=` replays a game.
const seed = Number(new URLSearchParams(location.search).get('seed')) || Date.now() >>> 0;
const sim = new Sim(loadData(mode), seed);
const board = sim.board;
const world = createWorld(board, sim.game);
document.body.prepend(world.canvas);
const send = (cmd: Cmd) => sim.send(0, cmd);
const actions = createCameraInput(world, board, send, (cell) => sim.game.canBuild(cell).ok);
/** Bumped after sim steps so the HUD re-reads sim state. */
const ticked = signal(0);
const paused = signal(false);
const routeVisible = signal(false);
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
    send={send}
    actions={actions}
    mode={mode}
    feedback={feedback}
    audio={audio}
    routeVisible={routeVisible}
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
effect(() => world.setRouteVisible(routeVisible.value));

// Fixed-rate sim clock. Pausing stops stepping; queued commands apply on resume.
world.afterStep();
let last = performance.now();
let acc = 0;
let lastShown = '';
setInterval(() => {
  const now = performance.now();
  acc += Math.min(now - last, 250) / 1000;
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
    g.gems.map((gem) => `${gem.name}:${gem.level ?? 0}`).join(),
    JSON.stringify(g.hero),
    g.hero.selected ? Math.floor(sim.tick / 30) : 0,
  ].join();
  if (stepped && shown !== lastShown) {
    lastShown = shown;
    ticked.value++;
  }
}, 1000 / TICK_HZ);

// Test hook for the Playwright smoke test (dev server only).
if (import.meta.env.DEV) Object.assign(window, { facet: { world, board, sim } });
