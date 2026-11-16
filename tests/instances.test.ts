import * as THREE from 'three';
import { expect, test } from 'vitest';
import { createInstanceBatch } from '../src/world/instances';

test('shared piece geometry renders as one dynamic instance batch', () => {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial();
  const a = new THREE.Mesh(geometry, material);
  const b = new THREE.Mesh(geometry, material);
  a.position.x = 2;
  b.position.x = 5;

  const batch = createInstanceBatch([a, b]);
  expect(batch.drawCalls).toBe(1);
  const mesh = batch.group.children[0] as THREE.InstancedMesh;
  expect(mesh.count).toBe(2);

  b.position.x = 9;
  batch.update();
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(1, matrix);
  expect(new THREE.Vector3().setFromMatrixPosition(matrix).x).toBe(9);
});

test('different shadow flags stay in separate batches', () => {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial();
  const a = new THREE.Mesh(geometry, material);
  const b = new THREE.Mesh(geometry, material);
  b.castShadow = true;
  expect(createInstanceBatch([a, b]).drawCalls).toBe(2);
});
