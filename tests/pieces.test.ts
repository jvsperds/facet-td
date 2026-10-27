import * as THREE from 'three';
import { expect, test } from 'vitest';
import { loadData } from '../src/data';
import { Sim } from '../src/sim/sim';
import { createPieces } from '../src/world/pieces';

test('lethal shots retain their endpoints, burst, expire and reuse fixed instance buffers', () => {
  const game = new Sim(loadData('classic'), 1).game;
  game.stones.clear();
  game.gems.push({ id: 1, name: 'gemtd_b1', cell: { x: 12, y: 12 }, cooldown: 0, target: null });
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
    { type: 'attack', from: 1, to: 2, damage: 10 },
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
    { type: 'attack', from: 1, to: 99, damage: 10 },
    { type: 'kill', id: 99, gold: 5 },
  ];
  pieces.afterStep();
  pieces.frame(1, 0.01);
  expect(shots.count).toBe(1); // even a creep killed before its first rendered tick gets an effect
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
  game.events = Array.from({ length: 300 }, () => ({ type: 'attack', from: 1, to: 3, damage: 1 }));
  pieces.afterStep();
  pieces.frame(1, 0.01);
  expect(shots.count).toBe(128);
  pieces.frame(1, 1);
  expect(shots.count + rings.count).toBe(0);
});
