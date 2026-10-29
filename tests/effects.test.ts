import * as THREE from 'three';
import { expect, test } from 'vitest';
import { loadData } from '../src/data';
import { Sim } from '../src/sim/sim';
import { auraRings, createEffects, shotStyle, splashRadius } from '../src/world/effects';

// Issue #10: per-family projectiles and impacts, splash shockwaves and aura rings.

const game = new Sim(loadData('classic'), 1).game;
const abilities = (name: string) => game.abilities(name);

test('each basic gem family has its own projectile', () => {
  expect(
    Object.fromEntries(
      ['d1', 'b1', 'y1', 'r1', 'g1', 'q1', 'p1', 'e1'].map((n) => [
        n,
        shotStyle(abilities(`gemtd_${n}`)),
      ]),
    ),
  ).toEqual({
    d1: 'shard',
    b1: 'frost',
    y1: 'arrow',
    r1: 'heavy',
    g1: 'venom',
    q1: 'shard',
    p1: 'shred',
    e1: 'shard',
  });
  expect(shotStyle(abilities('gemtd_jixueshi'))).toBe('bolt'); // Bloodstone chain lightning
});

test('aura and field towers draw rings coloured by what the field does', () => {
  expect(auraRings(abilities('gemtd_e1'))).toEqual([
    { family: 'support', radius: expect.closeTo(5.2, 1) },
  ]);
  expect(auraRings(abilities('gemtd_xingcaihongbaoshi')).map((r) => r.family)).toEqual(['burn']);
  expect(auraRings(abilities('gemtd_huangcailanbaoshi')).map((r) => r.family)).toEqual(['frost']);
  expect(auraRings(abilities('gemtd_palayibabixi')).map((r) => r.family)).toEqual(['shred']);
  expect(auraRings(abilities('gemtd_b1'))).toEqual([]);
  // Red Coral has two identical attack-speed auras; they share one ring.
  const coral = auraRings(abilities('gemtd_hongshanhu'));
  expect(coral.filter((r) => r.family === 'support' && r.radius > 5)).toHaveLength(1);
});

const tower = (name: string) => ({
  id: 1,
  x: 0,
  z: 0,
  color: '#ce4059',
  abilities: abilities(name),
});
const from = new THREE.Vector3(0, 1.2, 0);
const to = new THREE.Vector3(2, 0.5, 0);
const mesh = (scene: THREE.Scene, name: string) =>
  scene.getObjectByName(name) as THREE.InstancedMesh;

test('a splash attack lands a shell, then a shockwave sized to the splash radius', () => {
  const scene = new THREE.Scene();
  const fx = createEffects(scene);
  fx.hit('attack', tower('gemtd_r1'), from, to, false);
  fx.hit('splash', tower('gemtd_r1'), from, to, false); // victims add nothing over the wave
  fx.frame(0.1, false);
  expect(mesh(scene, 'combat-projectiles-heavy').count).toBe(1);
  expect(mesh(scene, 'combat-impacts-wave').count).toBe(0);
  fx.frame(0.3, false);
  const wave = mesh(scene, 'combat-impacts-wave');
  expect(wave.count).toBe(1);
  const m = new THREE.Matrix4();
  wave.getMatrixAt(0, m);
  const scale = new THREE.Vector3().setFromMatrixScale(m).x;
  expect(scale).toBeGreaterThan(0.2 * splashRadius(abilities('gemtd_r1')));
  expect(scale).toBeLessThanOrEqual(splashRadius(abilities('gemtd_r1')));
  fx.frame(1, false);
  expect(wave.count).toBe(0);
});

test('lightning strikes instantly; poison ticks puff; reduced motion skips travel and bolts', () => {
  const scene = new THREE.Scene();
  const fx = createEffects(scene);
  const bolts = scene.getObjectByName('combat-bolts') as THREE.LineSegments;
  fx.hit('attack', tower('gemtd_jixueshi'), from, to, false);
  fx.hit('dot', tower('gemtd_g1'), to, to, false);
  fx.frame(0.02, false);
  expect(bolts.geometry.drawRange.count).toBeGreaterThan(0);
  expect(mesh(scene, 'combat-impacts-puff').count).toBe(1);
  fx.frame(1, false);
  expect(bolts.geometry.drawRange.count).toBe(0);

  fx.hit('attack', tower('gemtd_jixueshi'), from, to, false);
  fx.hit('attack', tower('gemtd_b1'), from, to, false);
  fx.frame(0.02, true);
  expect(bolts.geometry.drawRange.count).toBe(0);
  expect(mesh(scene, 'combat-projectiles-frost').count).toBe(0);
  expect(mesh(scene, 'combat-impacts-flake').count).toBe(1);
});

test('aura rings follow the tower set and stay still under reduced motion', () => {
  const scene = new THREE.Scene();
  const fx = createEffects(scene);
  fx.setTowers([tower('gemtd_e1'), { ...tower('gemtd_b1'), id: 2 }]);
  expect(fx.auraCount).toBe(1);
  const group = scene.getObjectByName('tower-auras')!;
  expect(group.children).toHaveLength(3); // disc, ring, pulse
  fx.frame(0.5, false);
  const pulse = group.children[2] as THREE.Mesh;
  expect((pulse.material as THREE.MeshBasicMaterial).opacity).toBeGreaterThan(0);
  fx.frame(0.5, true);
  expect((pulse.material as THREE.MeshBasicMaterial).opacity).toBe(0);
  fx.setTowers([]);
  expect(group.children).toHaveLength(0);
});
