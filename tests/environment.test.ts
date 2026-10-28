import * as THREE from 'three';
import { expect, test } from 'vitest';
import { loadData } from '../src/data';
import { Board } from '../src/sim/board';
import { ISO_ELEVATION } from '../src/world/view';
import { createEnvironment, distanceTo } from '../src/world/environment';

// The sunken voxel cave: clear approaches, structures on the floor, a cutaway that never hides
// the board, and a heart crystal that answers castle HP.

const board = new Board(loadData('classic'));
const spawn = board.waypoints[0].cell;
const exit = board.waypoints.at(-1)!.cell;
const make = () => {
  const scene = new THREE.Scene();
  return { scene, env: createEnvironment(scene, spawn, exit) };
};

test('rock never stands on the board, its floor ring or the approach lanes', () => {
  const { env } = make();
  const { columns, lanes } = env.debug;
  for (const c of columns) {
    expect(Math.max(Math.abs(c.x), Math.abs(c.z))).toBeGreaterThan(20);
    for (const { from, to } of lanes) {
      const [dx, dz] = [to[0] - from[0], to[1] - from[1]];
      const t = Math.max(
        0,
        Math.min(1, ((c.x - from[0]) * dx + (c.z - from[1]) * dz) / (dx * dx + dz * dz)),
      );
      expect(Math.hypot(c.x - from[0] - dx * t, c.z - from[1] - dz * t)).toBeGreaterThan(2.2);
    }
  }
});

test('the cave mouth is north of S and the vault east of E, both facing the board', () => {
  const { scene, env } = make();
  const mouth = scene.getObjectByName('cave-mouth')!;
  const fort = scene.getObjectByName('cave-fortress')!;
  expect(mouth.position.z).toBeLessThan(-18.5); // beyond the north edge
  expect(fort.position.x).toBeGreaterThan(18.5); // beyond the east edge
  // The vault's front (+z local) points west, toward E.
  const front = new THREE.Vector3(0, 0, 1).applyQuaternion(fort.quaternion);
  expect(front.x).toBeCloseTo(-1);
  expect(env.debug.vault.z).toBe(19 - exit.y);
});

test('distanceTo measures from a column back toward a ground rectangle', () => {
  const r = { x: 0, z: 0, hx: 2, hz: 2 };
  expect(distanceTo(r, 5, 0, 1, 0)).toBeCloseTo(3); // looking back along -x reaches x = 2
  expect(distanceTo(r, 5, 0, -1, 0)).toBe(Infinity); // the rectangle is behind the camera
  expect(distanceTo(r, 5, 10, 1, 0)).toBe(Infinity); // passes beside it
});

test('the cutaway keeps every rock column low enough not to hide the board', () => {
  const { scene, env } = make();
  const rock = scene.getObjectByName('cave-rock') as THREE.Mesh;
  for (const azimuth of [45, 135, 225, 315, 10]) {
    env.view(ISO_ELEVATION, azimuth);
    const a = (azimuth * Math.PI) / 180;
    const [dx, dz] = [Math.sin(a), Math.cos(a)];
    const slope = Math.tan((ISO_ELEVATION * Math.PI) / 180);
    const position = rock.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      const [x, y, z] = [position.getX(i), position.getY(i), position.getZ(i)];
      const t = distanceTo({ x: 0, z: 0, hx: 18.5, hz: 18.5 }, x, z, dx, dz);
      // Vertices sit on cell corners; allow the half-cell column footprint.
      expect(y).toBeLessThanOrEqual(Math.max(0.5, (t + 0.75) * slope) + 1e-6);
    }
  }
  // Top view hides nothing, so the terraces stand at full height.
  env.view(90, 0);
  rock.geometry.computeBoundingBox();
  expect(rock.geometry.boundingBox!.max.y).toBeGreaterThan(4);
});

test('the heart crystal dims with castle HP and flashes on a leak', () => {
  const { scene, env } = make();
  const fort = scene.getObjectByName('cave-fortress')!;
  const heart = fort.children.find(
    (c) => c instanceof THREE.Mesh && c.geometry instanceof THREE.OctahedronGeometry,
  ) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  env.castle(1, 0);
  env.frame(0.1, true);
  const full = heart.material.emissiveIntensity;
  env.castle(0.3, 0);
  env.frame(0.1, true);
  expect(heart.material.emissiveIntensity).toBeLessThan(full);
  expect(heart.scale.x).toBeLessThan(1);
  env.castle(0.3, 5);
  env.frame(0.01, true);
  expect(heart.material.emissive.r).toBeGreaterThan(0.5); // red flash
  env.frame(2, true);
  expect(heart.material.emissive.r).toBeLessThan(0.5);
});
