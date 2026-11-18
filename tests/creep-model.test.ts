import * as THREE from 'three';
import { expect, test } from 'vitest';
import { animateCreep, creepLimbs, creepModel } from '../src/world/creep-model';

test('creep silhouettes vary by wave and preserve ground clearance', () => {
  const names = [
    'gemtd_kuangbaoyezhu',
    'gemtd_kuaidiqingwatiaotiao',
    'gemtd_zhongchenggaoshanmaoniu',
  ];
  const models = names.map((name) => creepModel({ name }));
  const types = models.map((model) => {
    const body = model.children.find((child) => child instanceof THREE.Group)!;
    return JSON.stringify(
      ((body.children[0] as THREE.Mesh).geometry as THREE.BoxGeometry).parameters,
    );
  });
  expect(new Set(types).size).toBeGreaterThan(1);
  for (const model of models) {
    const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    expect(size.z).toBeLessThanOrEqual(0.36 * 0.7 * 1.04 + 1e-6);
  }
  const flying = creepModel({ name: 'gemtd_wuweizhihuan_fly', flying: true });
  expect(flying.userData.flying).toBe(true);
  for (const model of [models[0], flying]) {
    const limbs: THREE.Object3D[] = [];
    model.traverse((part) => {
      if (part.name.startsWith('creep-limb-')) limbs.push(part);
    });
    expect(limbs).toHaveLength(model === flying ? 2 : 4);
    animateCreep(limbs, 0.1, model === flying, true);
    expect(limbs.some((limb) => limb.rotation.x !== 0 || limb.rotation.z !== 0)).toBe(true);
    animateCreep(limbs, 0.1, model === flying, false);
    expect(limbs.every((limb) => limb.rotation.x === 0 && limb.rotation.z === 0)).toBe(true);
  }
});

test('each cave creature builds, fits the ground lane and has moving parts', () => {
  const cases = [
    ['gemtd_kuangbaoyezhu', false, false, 'burrower'],
    ['gemtd_mengzhu', false, false, 'crawler'],
    ['gemtd_cuihua', false, false, 'golem'],
    ['gemtd_feihuxia_fly', true, false, 'bat'],
    ['gemtd_ruxingshuimu_fly', true, false, 'wisp'],
    ['gemtd_buquzhanquan_boss', false, true, 'wyrm'],
    ['gemtd_roushan_boss_fly', true, true, 'wyrm'],
  ] as const;
  for (const [name, flying, boss, kind] of cases) {
    const model = creepModel({ name, flying, boss, immunity: 3 });
    expect(model.userData.kind).toBe(kind);
    expect(creepLimbs(model).length).toBeGreaterThanOrEqual(2);
    if (!flying) {
      const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
      expect(size.z).toBeLessThanOrEqual(0.36 * 0.7 * 1.04 + 1e-6);
    }
  }
});
