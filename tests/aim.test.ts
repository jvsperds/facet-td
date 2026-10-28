import * as THREE from 'three';
import { expect, test } from 'vitest';
import { createGemTower } from '../docs/art/model-study/models.js';
import { createAimer, turnToward } from '../src/world/aim';

// Issue #14: tower heads turn smoothly instead of snapping.

const yawOf = (tower: THREE.Object3D, x: number, z: number) => {
  // The pose aimAt snaps to, for comparison.
  (tower.userData.aimAt as (x: number, z: number) => void)(x, z);
  const values: number[] = [];
  tower.traverse((o) => values.push(o.rotation.y));
  return values;
};

test('turnToward takes the short way round and caps the turn speed', () => {
  expect(turnToward(3, -3, 0.016)).toBeGreaterThan(3); // through pi, not back through zero
  expect(Math.abs(turnToward(0, 3, 0.016))).toBeLessThanOrEqual(7 * 0.016 + 1e-9);
  let a = 0;
  for (let i = 0; i < 120; i++) a = turnToward(a, 2, 1 / 60);
  expect(a).toBeCloseTo(2, 3);
});

test('a tower head eases onto its target, then onto the next, and rests', () => {
  const scene = new THREE.Scene();
  // quality is accepted at runtime but missing from the factory's inferred JS types.
  const options = { x: 0, z: 0, quality: 3, seed: 1 } as Parameters<typeof createGemTower>[1];
  const tower = createGemTower('R', options);
  scene.add(tower);
  const aimer = createAimer(tower);
  expect(aimer.parts).toBeGreaterThan(0);
  const snapped = yawOf(tower, 0, 5);
  (tower.userData.aimAt as () => void)();

  const yaws = () => {
    const values: number[] = [];
    tower.traverse((o) => values.push(o.rotation.y));
    return values;
  };
  const distance = (a: number[], b: number[]) =>
    a.reduce((sum, v, i) => sum + Math.abs(Math.atan2(Math.sin(v - b[i]), Math.cos(v - b[i]))), 0);

  aimer.update(0, 5, 1 / 60);
  const first = distance(yaws(), snapped);
  expect(first).toBeGreaterThan(0.05); // one frame in, still turning
  for (let i = 0; i < 90; i++) aimer.update(0, 5, 1 / 60);
  expect(distance(yaws(), snapped)).toBeLessThan(0.01);

  // Switching to a target behind it turns smoothly again rather than jumping.
  const next = yawOf(tower, 0, -5);
  aimer.update(0, 5, 0); // restore the eased pose
  aimer.update(0, -5, 1 / 60);
  expect(distance(yaws(), next)).toBeGreaterThan(0.5);
  for (let i = 0; i < 90; i++) aimer.update(0, -5, 1 / 60);
  expect(distance(yaws(), next)).toBeLessThan(0.01);

  // Reduced motion snaps straight to the pose.
  aimer.update(5, 0, 1 / 60, true);
  expect(distance(yaws(), yawOf(tower, 5, 0))).toBeLessThan(1e-9);
});

test('towers without an aiming head are left alone', () => {
  const plain = new THREE.Group();
  plain.userData.aimAt = () => {};
  const aimer = createAimer(plain);
  expect(aimer.parts).toBe(0);
  aimer.update(1, 1, 0.1);
});
