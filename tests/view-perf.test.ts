import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { loadData } from '../src/data';
import { Sim } from '../src/sim/sim';
import { createPieces } from '../src/world/pieces';

// GPU-free guard for the board's render cost: a fixed wave-30 maze (148 stones, 29 towers, saved
// from a bot run with seed 5) is built without a renderer, and visible meshes stand in for draw
// calls. Maze changes must touch only the wall chunks they reach, and nothing may grow over rounds.

const snapshot = JSON.parse(readFileSync('tests/fixtures/maze-wave30.json', 'utf8')) as {
  stones: [number, { x: number; y: number }][];
  gems: Sim['game']['gems'];
};

function setup() {
  const game = new Sim(loadData('classic'), 5).game;
  game.stones = new Map(snapshot.stones);
  game.gems = snapshot.gems.map((g) => ({ ...g, cell: { ...g.cell } }));
  game.creeps = [];
  game.events = [];
  const scene = new THREE.Scene();
  const pieces = createPieces(scene, game);
  pieces.afterStep();
  return { game, scene, pieces };
}
const visibleMeshes = (scene: THREE.Scene) => {
  let n = 0;
  scene.traverseVisible((o) => {
    if (o instanceof THREE.Mesh) n++;
  });
  return n;
};
const wallChunks = (scene: THREE.Scene) => scene.children.filter((o) => o.name === 'walls');

test('late-game board: bounded meshes, and no growth across repeated maze changes', () => {
  const { game, scene, pieces } = setup();
  const meshes = visibleMeshes(scene);
  const objects = scene.children.length;
  // Today ~154 visible meshes for this maze (towers are not instanced yet); keep it from creeping.
  expect(meshes).toBeLessThanOrEqual(170);
  expect(wallChunks(scene).length).toBeLessThanOrEqual(25);
  const free = { x: 20, y: 30 };
  const k = free.y * 64 + free.x;
  expect(game.stones.has(k)).toBe(false);
  for (let round = 0; round < 5; round++) {
    game.stones.set(k, free);
    pieces.afterStep();
    game.stones.delete(k);
    pieces.afterStep();
  }
  expect(visibleMeshes(scene)).toBe(meshes);
  expect(scene.children.length).toBe(objects);
});

test('a maze change re-merges only the wall chunks near it, and an idle tick touches nothing', () => {
  const { game, scene, pieces } = setup();
  const before = new Set(wallChunks(scene));
  const version = pieces.version;
  for (let i = 0; i < 20; i++) pieces.afterStep();
  expect(pieces.version).toBe(version);
  expect(new Set(wallChunks(scene))).toEqual(before);
  game.stones.set(30 * 64 + 20, { x: 20, y: 30 });
  pieces.afterStep();
  const after = wallChunks(scene);
  const rebuilt = after.filter((c) => !before.has(c));
  expect(rebuilt.length).toBeGreaterThan(0);
  expect(rebuilt.length).toBeLessThanOrEqual(4); // a 5x5 neighbourhood spans at most 2x2 chunks
});
