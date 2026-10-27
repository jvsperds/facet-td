import { effect } from '@preact/signals';
import { render } from 'preact';
import { loadData, type Mode } from './data';
import { Hud } from './hud/Hud';
import { createCameraInput, cursor, selected } from './input/camera';
import { Board } from './sim/board';
import { Sim, TICK_HZ } from './sim/sim';
import { createWorld } from './world/world';
import './style.css';

const mode: Mode = 'classic';
const sim = new Sim(loadData(mode), 1);
const board = new Board(sim.data);
const world = createWorld(board);
document.body.prepend(world.canvas);
const actions = createCameraInput(world, board);

const hudRoot = document.getElementById('hud')!;
render(<Hud board={board} actions={actions} mode={mode} version={sim.data.version} />, hudRoot);

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
new MutationObserver(() =>
  hudRoot.querySelectorAll('[data-exclude]').forEach((el) => panelObserver.observe(el)),
).observe(hudRoot, {
  childList: true,
  subtree: true,
});
hudRoot.querySelectorAll('[data-exclude]').forEach((el) => panelObserver.observe(el));
addEventListener('resize', measure);
measure();

effect(() => world.setMarks(selected.value, cursor.value));

// Fixed-rate sim clock; nothing is simulated on the board yet.
let last = performance.now();
let acc = 0;
setInterval(() => {
  const now = performance.now();
  acc += Math.min(now - last, 250) / 1000;
  last = now;
  for (; acc >= 1 / TICK_HZ; acc -= 1 / TICK_HZ) sim.step();
}, 1000 / TICK_HZ);

// Test hook for the Playwright smoke test (dev server only).
if (import.meta.env.DEV) Object.assign(window, { facet: { world, board } });
