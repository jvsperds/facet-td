import * as THREE from 'three';
import { expect, test } from 'vitest';
import { loadData } from '../src/data';
import { Sim } from '../src/sim/sim';
import { createAimer } from '../src/world/aim';
import { createPieces, placedTower, towerModel } from '../src/world/pieces';
import { creepModel } from '../src/world/creep-model';

test('creep immunity skins are distinct and flying bosses animate their wings', () => {
  const colors = [0, 1, 2, 3].map((immunity) => {
    const model = creepModel({ name: 'test', immunity });
    const body = model.children.find((child) => child instanceof THREE.Group)!;
    return ((body.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial).color.getHex();
  });
  expect(new Set(colors).size).toBe(4);
  const boss = creepModel({ name: 'boss', boss: true, flying: true, immunity: 3 });
  for (const name of ['creep-limb-0', 'creep-limb-1']) {
    const wing = boss.getObjectByName(name)!;
    expect(wing.getObjectByName('wing-tip')).toBeDefined();
  }
});

test('resistance and boss models have distinct voxel features', () => {
  const normal = creepModel({ name: 'test' });
  const armored = creepModel({ name: 'test', immunity: 1 });
  const magicalBoss = creepModel({ name: 'boss', immunity: 2, boss: true });
  expect(normal.getObjectByName('creep-muzzle')).toBeDefined();
  expect(normal.getObjectByName('creep-armor')).toBeUndefined();
  expect(armored.getObjectByName('creep-armor')).toBeDefined();
  expect(magicalBoss.getObjectByName('creep-crystal')).toBeDefined();
  expect(magicalBoss.getObjectByName('creep-tusk')).toBeDefined();
});

test('dead creeps burst outward, fall, and disappear', () => {
  const game = new Sim(loadData('classic'), 1).game;
  game.creeps.push({
    id: 42,
    name: 'test',
    hp: 10,
    maxHp: 10,
    armor: 0,
    speed: 0,
    x: 20,
    y: 20,
    step: 1,
    fly: false,
    boss: false,
    damage: 1,
  });
  const scene = new THREE.Scene();
  const pieces = createPieces(scene, game);
  pieces.afterStep();
  game.creeps = [];
  game.events = [{ type: 'kill', id: 42, gold: 5 }];
  pieces.afterStep();
  const death = scene.getObjectByName('creep-death') as THREE.InstancedMesh;
  pieces.frame(1, 0.01);
  expect(death.count).toBe(12);
  const first = new THREE.Matrix4(),
    second = new THREE.Matrix4();
  death.getMatrixAt(0, first);
  death.getMatrixAt(1, second);
  expect(first.elements[12]).not.toBe(second.elements[12]);
  const initialX = first.elements[12],
    initialZ = first.elements[14];
  const initialHeight = first.elements[13];
  pieces.frame(1, 0.2);
  death.getMatrixAt(0, first);
  expect(Math.hypot(first.elements[12] - initialX, first.elements[14] - initialZ)).toBeGreaterThan(
    0.1,
  );
  expect(first.elements[13]).toBeGreaterThan(initialHeight);
  const peakHeight = first.elements[13];
  pieces.frame(1, 0.45);
  death.getMatrixAt(0, first);
  expect(first.elements[13]).toBeLessThan(peakHeight);
  expect(first.elements[13]).toBeGreaterThan(0);
  pieces.frame(1, 0.4);
  expect(death.count).toBe(0);
});

test('leaked creeps continue visually to the castle and disappear after striking', () => {
  const game = new Sim(loadData('classic'), 1).game;
  game.creeps.push({
    id: 42,
    name: 'test',
    hp: 10,
    maxHp: 10,
    armor: 0,
    speed: 0,
    x: 20,
    y: 20,
    step: 1,
    fly: false,
    boss: false,
    damage: 1,
  });
  const scene = new THREE.Scene();
  const pieces = createPieces(scene, game, undefined, { x: 5, z: 0 });
  pieces.afterStep();
  game.creeps = [];
  game.events = [{ type: 'leak', id: 42, damage: 1 }];
  pieces.afterStep();
  const attacker = scene.getObjectByName('castle-attacker')!;
  expect(attacker).toBeDefined();
  pieces.frame(1, 0.8);
  expect(attacker.position.x).toBeCloseTo(5);
  pieces.frame(1, 0.5);
  expect(scene.getObjectByName('castle-attacker')).toBeUndefined();
});

test('secret stones have distinct tower models with aiming heads', () => {
  const names = [
    'gemtd_manao',
    'gemtd_xiameishi',
    'gemtd_ranshaozhishi',
    'gemtd_geluanshi',
    'gemtd_heiyaoshi',
  ];
  const silhouettes = names.map((name) => {
    const model = towerModel(name);
    const aimer = createAimer(model);
    expect(aimer.parts).toBeGreaterThan(0);
    const head = model.children.at(-1)!;
    const meshes: THREE.Mesh[] = [];
    head.traverse((o) => {
      if (o instanceof THREE.Mesh) meshes.push(o);
    });
    expect(meshes.length).toBeGreaterThan(5);
    return meshes
      .map((m) => {
        const geometry = m.geometry.toJSON();
        geometry.uuid = '';
        return JSON.stringify(geometry);
      })
      .join(',');
  });
  expect(new Set(silhouettes).size).toBe(names.length);
});

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
  expect(shots.count).toBe(160);
  pieces.frame(1, 1);
  expect(shots.count + rings.count).toBe(0);
  pieces.afterStep();
  pieces.frame(1, 0.01, true);
  expect(shots.count).toBe(0);
  expect(rings.count).toBe(160);
  rings.getMatrixAt(0, matrix);
  const before = matrix.clone();
  pieces.frame(1, 0.1, true);
  rings.getMatrixAt(0, matrix);
  expect(matrix.equals(before)).toBe(true);
});

test('placed towers are copies of one cached model that still aim on their own', () => {
  const a = placedTower('gemtd_r111', false);
  const b = placedTower('gemtd_r111', false);
  const meshes = (o: THREE.Object3D) => {
    const list: THREE.Mesh[] = [];
    o.traverse((m) => m instanceof THREE.Mesh && list.push(m));
    return list;
  };
  // Shared geometry and materials: nothing is built twice.
  expect(meshes(a).map((m) => m.geometry)).toEqual(meshes(b).map((m) => m.geometry));
  a.position.set(5, 0, 0);
  b.position.set(-5, 0, 0);
  const aimA = createAimer(a);
  const aimB = createAimer(b);
  expect(aimA.parts).toBeGreaterThan(0);
  // Each aims at a point east of itself, then north of itself: the same turn for both.
  aimA.update(15, 0, 1, true);
  aimB.update(-5, -10, 1, true);
  const heads = (o: THREE.Object3D) =>
    meshes(o).map((m) => m.getWorldQuaternion(new THREE.Quaternion()).y);
  expect(heads(a)).not.toEqual(heads(b));
  aimB.update(-5 + 10, 0, 1, true);
  heads(a).forEach((y, i) => expect(y).toBeCloseTo(heads(b)[i], 5));
});
