import { expect, test } from 'vitest';
import { loadData } from '../src/data';
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
    c.maxHp = 100000;
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

test('aim modes pick by health and remaining route', () => {
  const { sim, game, gem, creeps } = setup();
  const aimAt = (mode: number) => {
    expect(game.setAim(gem.id, mode).ok).toBe(true);
    gem.cooldown = 0;
    sim.step();
    return gem.target;
  };
  expect(aimAt(2)).toBe(creeps[2].id); // lowest HP
  const next = game.route[creeps[0].step];
  creeps.forEach((c) => (c.step = creeps[0].step));
  creeps[0].x = next.x + 1;
  creeps[0].y = next.y;
  creeps[1].x = next.x + 0.1;
  creeps[1].y = next.y;
  creeps[2].x = next.x + 0.5;
  creeps[2].y = next.y;
  gem.cell = { ...next };
  expect(aimAt(1)).toBe(creeps[1].id); // a later spawn has overtaken the first
  creeps[1].hp = creeps[1].maxHp * 10;
  expect(aimAt(3)).toBe(creeps[1].id); // highest HP
  expect(aimAt(4)).toBe(creeps[2].id); // lowest HP percentage
  expect(aimAt(5)).toBe(creeps[1].id); // highest HP percentage
  expect(game.setAim(gem.id, 8).ok).toBe(false);
  expect(game.setAim(gem.id, 7).ok).toBe(false);
  expect(game.setAim(gem.id, 0).ok).toBe(true);
  expect(gem.aim).toBeUndefined(); // Closest is stored as the original's default
});

test('absolute and percentage health modes rank independently and reselect before firing', () => {
  const { sim, game, gem, creeps } = setup();
  creeps[0].maxHp = 100000;
  creeps[0].hp = 20000;
  creeps[1].maxHp = 1000000;
  creeps[1].hp = 100000;
  creeps[2].maxHp = 100000;
  creeps[2].hp = 50000;
  const target = (mode: number) => {
    game.setAim(gem.id, mode);
    gem.cooldown = 0;
    sim.step();
    return gem.target;
  };
  expect(target(2)).toBe(creeps[0].id);
  expect(target(3)).toBe(creeps[1].id);
  expect(target(4)).toBe(creeps[1].id);
  expect(target(5)).toBe(creeps[2].id);
  creeps[2].hp = 1000;
  expect(target(4)).toBe(creeps[2].id);
});

test('first-to-exit targets follow ground and flying routes across ticks and route changes', () => {
  const { sim, game, gem, creeps } = setup();
  const second = { ...gem, id: 9999, cell: { ...gem.cell }, aim: 1, cooldown: 0, target: null };
  game.gems.push(second);
  gem.aim = 1;
  const origin = { ...gem.cell };
  game.route = [origin, { x: origin.x + 2, y: origin.y }];
  game.flyRoute = [origin, { x: origin.x + 3, y: origin.y }];
  creeps.forEach((c, i) => {
    c.x = origin.x + i * 0.5;
    c.y = origin.y;
    c.step = 1;
    c.fly = i === 2;
  });
  const check = () => {
    gem.cooldown = second.cooldown = 0;
    sim.step();
    const remaining = (c: (typeof creeps)[number]) => {
      const route = c.fly ? game.flyRoute : game.route;
      let distance = 0;
      let previous = { x: c.x, y: c.y };
      for (const point of route.slice(c.step)) {
        distance += Math.sqrt((point.x - previous.x) ** 2 + (point.y - previous.y) ** 2);
        previous = point;
      }
      return distance;
    };
    const expected = [...creeps].sort((a, b) => remaining(a) - remaining(b))[0].id;
    expect(gem.target).toBe(expected);
    expect(second.target).toBe(expected);
  };
  check();
  game.route[1] = { x: origin.x + 4, y: origin.y };
  check();
  creeps[2].x = origin.x + 2;
  check();
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
