import type { Sim } from './sim/sim';

// `?preview=all`: a showroom for checking art and HUD changes in the real game. Every tower is
// placed on the board in a sparse grid (one tower every third cell, so the creep route always
// stays open) and an endless wave keeps every attack, splash, aura and burn field firing. The
// castle never falls and the castle rage never starts. Click any tower to inspect its card.
// shortcut: reaches into private Game state (startWave, toSpawn, waveTicks); dev/preview only.

const LEVEL = 20;

export function setupPreview(sim: Sim, towerNames: readonly string[]) {
  const g = sim.game;
  // Private wave state, typed here instead of widening Game's public API for a dev view.
  const wave = g as unknown as {
    startWave(): void;
    findRoute(): typeof g.route | null;
    toSpawn: number;
    waveTicks: number;
  };
  const names = [...new Set(towerNames)];
  const cells: { x: number; y: number }[] = [];
  for (let y = 2; y <= sim.board.size; y += 3)
    for (let x = 2; x <= sim.board.size; x += 3)
      if (sim.board.kind({ x, y }) === 'open' && !g.stoneAt({ x, y })) cells.push({ x, y });
  g.gems = [];
  g.draft = [];
  names.slice(0, cells.length).forEach((name, i) => {
    g.gems.push({ id: 10_000 + i, name, cell: cells[i], cooldown: 0, target: null });
  });
  if (names.length > cells.length)
    console.warn(`preview: ${names.length - cells.length} towers did not fit on the board`);
  g.route = wave.findRoute() ?? g.route;
  g.level = LEVEL;
  const keepAlive = () => {
    g.castleHp = Math.max(g.castleHp, 100);
    if (g.phase !== 'wave') {
      g.level = LEVEL; // the same creeps every wave
      wave.startWave();
    }
    wave.toSpawn = Math.max(wave.toSpawn, 10);
    wave.waveTicks = 0; // never reach the castle rage
  };
  keepAlive();
  setInterval(keepAlive, 500);
}
