import { expect, test } from 'vitest';
import { loadData } from '../src/data';
import { AIM_BOSS } from '../src/sim/game';
import { Sim } from '../src/sim/sim';

// Aim modes: Closest (the original's acquisition) by default; others re-aim before each attack.

const data = loadData('classic');

/** A kept tower and three creeps standing in its range with different health. */
function setup() {
  const sim = new Sim(data, 3);
  const game = sim.game;
  for (const x of [20, 22, 24, 26, 28]) sim.send(0, { type: 'build', cell: { x, y: 30 } });
  sim.step();
  sim.send(0, { type: 'keep', id: game.draft[0], upgrade: 0 });
  sim.step();
  while (game.creeps.length < 3) sim.step();
  const gem = game.gems[0];
  const creeps = game.creeps.slice(0, 3);
  // Nearest first; health rising with distance, then the far one the weakest by share.
  creeps.forEach((c, i) => {
    [c.x, c.y] = [gem.cell.x + 0.5 + i, gem.cell.y];
    c.speed = 0;
  });
  creeps[0].hp = creeps[0].maxHp * 0.9;
  creeps[1].hp = creeps[1].maxHp;
  creeps[2].hp = creeps[2].maxHp * 0.2;
  return { sim, game, gem, creeps };
}

test('a tower aims at the closest creep by default and keeps it', () => {
  const { sim, gem, creeps } = setup();
  sim.step();
  expect(gem.target).toBe(creeps[0].id);
  expect(gem.aim).toBeUndefined();
});

test('aim modes pick by health and spawn order, and boss first wins over the mode', () => {
  const { sim, game, gem, creeps } = setup();
  const aimAt = (mode: number) => {
    expect(game.setAim(gem.id, mode).ok).toBe(true);
    gem.cooldown = 0;
    sim.step();
    return gem.target;
  };
  expect(aimAt(2)).toBe(creeps[2].id); // lowest HP
  expect(aimAt(1)).toBe(Math.min(...creeps.map((c) => c.id))); // first to exit: spawned first
  creeps[1].boss = true;
  expect(aimAt(2 + AIM_BOSS)).toBe(creeps[1].id);
  expect(game.setAim(gem.id, 7).ok).toBe(false);
  expect(game.setAim(gem.id, 0).ok).toBe(true);
  expect(gem.aim).toBeUndefined(); // Closest is stored as the original's default
});

test('a tower lists its MVP level as an effect', () => {
  const { game, gem } = setup();
  gem.level = 3;
  expect(game.towerStatuses(gem)).toContainEqual(
    expect.objectContaining({ key: 'mvp', count: 3, effects: ['+30% damage'] }),
  );
});

test('a tower told to hold fire attacks nothing until it resumes', () => {
  const { sim, game, gem, creeps } = setup();
  expect(game.setHold(gem.id, true).ok).toBe(true);
  for (let i = 0; i < 30; i++) sim.step();
  expect(gem.target).toBeNull();
  expect(game.damageThisWave[gem.id] ?? 0).toBe(0);
  expect(game.towerStatuses(gem).some((s) => s.key === 'hold')).toBe(true);
  game.setHold(gem.id, false);
  sim.step();
  expect(gem.target).toBe(creeps[0].id);
});
