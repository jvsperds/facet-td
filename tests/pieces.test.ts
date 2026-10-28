import * as THREE from 'three';
import { expect, test } from 'vitest';
import { loadData } from '../src/data';
import { Sim } from '../src/sim/sim';
import { createPieces } from '../src/world/pieces';

test('every combined tower, secret stone and tablet has a finite board model', () => {
  const data = loadData('classic'),
    game = new Sim(data, 1).game;
  const lua = data.files['lua/addon_game_mode.json'] as Record<
    string,
    { value: Record<string, unknown> }
  >;
  const names = [
    ...new Set([
      ...Object.keys(lua.gemtd_merge.value),
      ...Object.keys(lua.gemtd_merge_secret.value),
      ...Object.keys(lua.shiban_ability_list.value),
      'gemtd_zhenjiazhishi',
    ]),
  ];
  game.stones.clear();
  game.gems = names.map((name, i) => ({
    id: i + 1,
    name,
    cell: { x: (i % 30) + 2, y: Math.floor(i / 30) + 12 },
    cooldown: 0,
    target: null,
  }));
  const scene = new THREE.Scene(),
    pieces = createPieces(scene, game);
  pieces.afterStep();
  pieces.frame(1, 0);
  // One model per tower, plus a wall block under every tower that is not a floor pedal.
  const walls = names.filter((n) => !n.includes('shiban')).length;
  expect(pieces.objects()).toHaveLength(names.length + walls);
  scene.updateMatrixWorld(true);
  for (const object of pieces.objects())
    object.traverse((child) => {
      expect(child.matrixWorld.elements.every(Number.isFinite)).toBe(true);
      if (child instanceof THREE.Mesh)
        expect(child.geometry.getAttribute('position').array.every(Number.isFinite)).toBe(true);
    });
});

test('lethal shots retain their endpoints, burst, expire and reuse fixed instance buffers', () => {
  const game = new Sim(loadData('classic'), 1).game;
  game.stones.clear();
  // A diamond has no ability, so it fires the default shard and ring.
  game.gems.push({ id: 1, name: 'gemtd_d1', cell: { x: 12, y: 12 }, cooldown: 0, target: null });
  game.creeps.push({
    id: 2,
    name: 'test',
    hp: 10,
    maxHp: 10,
    armor: 0,
    speed: 0,
    x: 13,
    y: 12,
    step: 0,
    fly: false,
    boss: false,
    damage: 1,
  });
  const scene = new THREE.Scene();
  const pieces = createPieces(scene, game);
  pieces.afterStep();
  const shots = scene.getObjectByName('combat-projectiles') as THREE.InstancedMesh;
  const rings = scene.getObjectByName('combat-impacts') as THREE.InstancedMesh;
  const buffer = shots.instanceMatrix;
  game.creeps = [];
  game.events = [
    { type: 'attack', from: 1, to: 2, damage: 10, x: 13, y: 12, via: 'attack' },
    { type: 'kill', id: 2, gold: 5 },
  ];
  pieces.afterStep();
  pieces.frame(1, 0.06);
  expect(shots.count).toBe(1);
  expect(rings.count).toBe(0);
  const matrix = new THREE.Matrix4();
  shots.getMatrixAt(0, matrix);
  expect(new THREE.Vector3().setFromMatrixPosition(matrix).x).toBeCloseTo(-6.5);
  pieces.frame(1, 0.1);
  expect(shots.count).toBe(0);
  expect(rings.count).toBe(1);
  pieces.frame(1, 0.3);
  expect(rings.count).toBe(0);
  expect(shots.instanceMatrix).toBe(buffer);

  game.events = [
    { type: 'attack', from: 1, to: 99, damage: 10, x: 14, y: 12, via: 'attack' },
    { type: 'kill', id: 99, gold: 5 },
  ];
  pieces.afterStep();
  pieces.frame(1, 0.01);
  expect(shots.count).toBe(1); // even a creep killed before its first rendered tick gets an effect
  pieces.frame(1, 0.12);
  rings.getMatrixAt(0, matrix);
  expect(new THREE.Vector3().setFromMatrixPosition(matrix).x).toBe(-5);
  pieces.frame(1, 1);

  // A busy tick cannot grow the effect buffers or retain an unbounded backlog.
  game.creeps.push({
    id: 3,
    name: 'test',
    hp: 10,
    maxHp: 10,
    armor: 0,
    speed: 0,
    x: 13,
    y: 12,
    step: 0,
    fly: false,
    boss: false,
    damage: 1,
  });
  game.events = Array.from({ length: 300 }, () => ({
    type: 'attack',
    from: 1,
    to: 3,
    damage: 1,
    x: 13,
    y: 12,
    via: 'attack' as const,
  }));
  pieces.afterStep();
  pieces.frame(1, 0.01);
  expect(shots.count).toBe(128);
  pieces.frame(1, 1);
  expect(shots.count + rings.count).toBe(0);
  pieces.afterStep();
  pieces.frame(1, 0.01, true);
  expect(shots.count).toBe(0);
  expect(rings.count).toBe(128);
  rings.getMatrixAt(0, matrix);
  const before = matrix.clone();
  pieces.frame(1, 0.1, true);
  rings.getMatrixAt(0, matrix);
  expect(matrix.equals(before)).toBe(true);
});
