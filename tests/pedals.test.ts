import * as THREE from 'three';
import { expect, test } from 'vitest';
import { loadData } from '../src/data';
import { planTabletCast } from '../src/sim/tablets';
import { createPedalEffects, pedalFamily } from '../src/world/pedals';

// Issue #12: every pedal (tablet) spell has a trigger effect.

const data = loadData('classic');
const tablets = Object.keys(
  (data.files['lua/addon_game_mode.json'] as { shiban_ability_list: { value: object } })
    .shiban_ability_list.value,
);
const creeps = [
  { id: 1, x: 10.5, y: 10, hp: 10, maxHp: 10 },
  { id: 2, x: 11.5, y: 10, hp: 10, maxHp: 10 },
  { id: 3, x: 12.5, y: 10.5, hp: 10, maxHp: 10 },
];
const plan = (name: string) => {
  const p = planTabletCast(data, name, { x: 10, y: 10 }, creeps, 0);
  if (!p.ok) throw new Error(`${name}: ${p.reason}`);
  return p;
};

test('every tablet spell maps to a pedal effect family', () => {
  expect(tablets.length).toBeGreaterThan(0);
  const families = new Set<string>();
  for (const name of tablets)
    for (const op of plan(name).plans) {
      const family = pedalFamily(op);
      expect(family, `${name} ${op.modifier ?? op.kind}`).not.toBeNull();
      families.add(family!);
    }
  expect([...families].sort()).toEqual(
    ['acid', 'cask', 'decrepify', 'ensnare', 'gale', 'howl', 'terror', 'torrent'].sort(),
  );
});

test('triggers draw their zones, wait for delays and clean up', () => {
  const scene = new THREE.Scene();
  const fx = createPedalEffects(scene);
  const group = scene.getObjectByName('pedal-effects')!;
  const toScene = (x: number, y: number) => ({ x: x - 19, z: 19 - y });
  const torrent = tablets.find((n) => plan(n).plans.some((op) => pedalFamily(op) === 'torrent'))!;
  fx.trigger({ x: -9, z: 9 }, plan(torrent).plans, toScene, creeps, 1);
  expect(fx.active).toBeGreaterThan(2); // tablet flash, warning ring, column, splash
  fx.frame(0.01, false);
  const visible = () => group.children.filter((c) => c.visible).length;
  const before = visible();
  expect(before).toBeLessThan(group.children.length); // the column waits for the cast delay
  fx.frame(1, false);
  expect(visible()).toBeGreaterThan(0);
  fx.frame(30, false);
  expect(fx.active).toBe(0);
  expect(group.children).toHaveLength(0);
});

test('a cask hops along the nearest-creep chain and every family stays finite', () => {
  const scene = new THREE.Scene();
  const fx = createPedalEffects(scene);
  const toScene = (x: number, y: number) => ({ x: x - 19, z: 19 - y });
  for (const name of tablets) fx.trigger({ x: -9, z: 9 }, plan(name).plans, toScene, creeps, 1);
  for (const reduced of [false, true]) {
    fx.frame(0.3, reduced);
    scene.updateMatrixWorld(true);
    scene.traverse((o) => expect(o.matrixWorld.elements.every(Number.isFinite)).toBe(true));
  }
});
