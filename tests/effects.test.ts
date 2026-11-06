import * as THREE from 'three';
import { expect, test } from 'vitest';
import { loadData } from '../src/data';
import { Sim } from '../src/sim/sim';
import {
  attackOf,
  auraRings,
  fieldCells,
  fieldLevel,
  fieldTexturePixels,
  createEffects,
  shotStyle,
  splashRadius,
} from '../src/world/effects';

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
  // Enemy fields are drawn on the ground (fieldCells), not as rings.
  expect(auraRings(abilities('gemtd_xingcaihongbaoshi'))).toEqual([]);
  expect(auraRings(abilities('gemtd_huangcailanbaoshi'))).toEqual([]);
  expect(auraRings(abilities('gemtd_palayibabixi'))).toEqual([]);
  expect(auraRings(abilities('gemtd_b1'))).toEqual([]);
  // Red Coral has two identical attack-speed auras; they share one ring.
  const coral = auraRings(abilities('gemtd_hongshanhu'));
  expect(coral.filter((r) => r.family === 'support' && r.radius > 5)).toHaveLength(1);
});

test('enemy fields tint the board cells in reach by family, stronger for a higher level', () => {
  const at = (name: string, x = 0, z = 0) => ({ x, z, abilities: abilities(name) });
  const one = fieldCells([at('gemtd_xingcaihongbaoshi')]); // tower_huiyao, radius 3.9
  expect(
    one.every((c) => c.family === 'burn' && c.level === 1 && c.x * c.x + c.z * c.z <= 3.91 ** 2),
  ).toBe(true);
  expect(one).toContainEqual({ family: 'burn', x: 3, z: 0, level: 1 });
  expect(one).not.toContainEqual(expect.objectContaining({ x: 3, z: 3 }));
  // Overlap with a level-3 burn keeps the stronger level.
  const both = fieldCells([at('gemtd_xingcaihongbaoshi'), at('gemtd_ranshaozhishi')]);
  expect(both.find((c) => c.x === 0 && c.z === 0)?.level).toBe(3);
  // Yellow sapphire's slow field is frost; Paraiba's armor field is shred.
  expect(fieldCells([at('gemtd_huangcailanbaoshi')])[0].family).toBe('frost');
  expect(fieldCells([at('gemtd_palayibabixi')])[0].family).toBe('shred');
  expect(fieldLevel('tower_huiyao2')).toBe(2);
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

test('lightning strikes instantly; poison ticks puff; reduced motion skips travel', () => {
  const scene = new THREE.Scene();
  const fx = createEffects(scene);
  const strokes = scene.getObjectByName('combat-strokes') as THREE.Mesh;
  fx.hit('attack', tower('gemtd_jixueshi'), from, to, false);
  fx.hit('dot', tower('gemtd_g1'), to, to, false);
  fx.frame(0.02, false);
  expect(strokes.geometry.drawRange.count).toBeGreaterThan(0);
  expect(mesh(scene, 'combat-impacts-puff').count).toBe(1);
  fx.frame(1, false);
  expect(strokes.geometry.drawRange.count).toBe(0);

  fx.hit('attack', tower('gemtd_b1'), from, to, false);
  fx.frame(0.02, true);
  expect(mesh(scene, 'combat-projectiles-frost').count).toBe(0);
  expect(mesh(scene, 'combat-impacts-flake').count).toBe(1);
});

const named = (name: string, id = 1) => ({ ...tower(name), id, name });

test('combined towers attack in their GemTD style and colour', () => {
  expect(attackOf('gemtd_jixueshi')).toEqual(['zap', '#ff5a4a']); // Bloodstone
  expect(attackOf('gemtd_baiyin')?.[0]).toBe('line'); // Silver
  expect(attackOf('gemtd_jingangshikulinan')?.[0]).toBe('ray'); // Diamond Cullinan
  expect(attackOf('gemtd_d1')).toBeNull();
  const scene = new THREE.Scene();
  const fx = createEffects(scene);
  const strokes = scene.getObjectByName('combat-strokes') as THREE.Mesh;
  // A Volcano lobs a glob (the shared projectile mesh) that pops as a ring.
  fx.hit('attack', named('gemtd_xuehonghuoshan'), from, to, false);
  fx.frame(0.05, false);
  expect(mesh(scene, 'combat-projectiles-venom').count).toBe(1);
  expect(fx.strokeCount).toBeGreaterThan(0); // its trail and glow
  fx.frame(0.2, false);
  expect(mesh(scene, 'combat-projectiles-venom').count).toBe(0);
  expect(mesh(scene, 'combat-impacts').count).toBe(1);
  fx.frame(1, false);
  expect(strokes.geometry.drawRange.count).toBe(0);
});

test('one tower draws at most one attack per gap; zaps hold still under reduced motion', () => {
  const scene = new THREE.Scene();
  const fx = createEffects(scene);
  const pink = named('gemtd_fenhongzuanshi');
  fx.hit('attack', pink, from, to, false);
  fx.hit('split', pink, from, to.clone().setZ(1), false); // same tick: part of the volley
  fx.frame(0.02, true);
  const volley = fx.strokeCount;
  fx.hit('attack', pink, from, to, false); // 20 ms later: skipped
  fx.frame(0.001, true);
  expect(fx.strokeCount).toBe(volley);
  const strokes = scene.getObjectByName('combat-strokes') as THREE.Mesh;
  const shape = () =>
    Array.from((strokes.geometry.attributes.position.array as Float32Array).slice(0, 36));
  const before = shape();
  fx.frame(0.001, true);
  expect(shape()).toEqual(before);
});

test('aura rings follow the tower set, are instanced, and stay still under reduced motion', () => {
  const scene = new THREE.Scene();
  const fx = createEffects(scene);
  fx.setTowers([tower('gemtd_e1'), { ...tower('gemtd_b1'), id: 2 }]);
  expect(fx.auraCount).toBe(1);
  const group = scene.getObjectByName('tower-auras')!;
  // One instanced disc, rim and pulse per family; only the opal's support family is drawn.
  const shown = () => group.children.filter((c) => c.visible) as THREE.InstancedMesh[];
  expect(shown()).toHaveLength(3);
  expect(shown().every((m) => m.count === 1)).toBe(true);
  const pulse = shown()[2];
  const size = () => {
    const m = new THREE.Matrix4();
    pulse.getMatrixAt(0, m);
    return new THREE.Vector3().setFromMatrixScale(m).x;
  };
  fx.frame(0.5, false);
  expect(size()).toBeGreaterThan(0);
  fx.frame(0.5, true);
  expect(size()).toBe(0); // reduced motion: no travelling pulse
  fx.setAurasVisible(false);
  expect(group.visible).toBe(false);
  fx.setTowers([]);
  expect(shown()).toHaveLength(0);
});

test('field ground effects are textured per family and stay when auras are hidden', () => {
  for (const f of ['burn', 'frost', 'shred'] as const) {
    const px = fieldTexturePixels(f);
    expect(px).toHaveLength(16 * 16 * 4);
    // A pattern, not a flat fill: alpha varies across the cell.
    expect(new Set(px.filter((_, i) => i % 4 === 3)).size).toBeGreaterThanOrEqual(4);
  }
  // Burn is red-to-yellow only: no dark pixels.
  const burn = fieldTexturePixels('burn');
  expect(burn.filter((_, i) => i % 4 === 0).every((r) => r >= 200)).toBe(true);
  const scene = new THREE.Scene();
  const fx = createEffects(scene);
  fx.setTowers([{ ...tower('gemtd_xingcaihongbaoshi'), x: 0, z: 0 }], [{ x: 1, z: 0 }]);
  const ground = scene.getObjectByName('field-ground')!;
  expect((scene.getObjectByName('field-tiles-burn') as THREE.InstancedMesh).count).toBeGreaterThan(
    0,
  );
  // A lone blocked cell gets the octagonal turret band.
  expect((scene.getObjectByName('field-turret-burn') as THREE.InstancedMesh).count).toBe(1);
  fx.setAurasVisible(false);
  expect(ground.visible).toBe(true);
});
