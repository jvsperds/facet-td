import * as THREE from 'three';

/**
 * Render repeated procedural models as instances while retaining their source objects for aiming,
 * interpolation and picking. Sources do not need to be attached to the scene; their shared
 * geometry and materials remain owned by the model-template cache.
 */
export function createInstanceBatch(roots: readonly THREE.Object3D[]) {
  const group = new THREE.Group();
  group.name = 'piece-instances';
  const batches = new Map<
    string,
    { source: THREE.Mesh; meshes: THREE.Mesh[]; object?: THREE.InstancedMesh }
  >();

  for (const root of roots) {
    root.updateWorldMatrix(true, true);
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || !object.visible || Array.isArray(object.material))
        return;
      const key = [
        object.geometry.uuid,
        object.material.uuid,
        object.castShadow ? 1 : 0,
        object.receiveShadow ? 1 : 0,
        object.renderOrder,
      ].join(':');
      const batch = batches.get(key) ?? { source: object, meshes: [] as THREE.Mesh[] };
      batch.meshes.push(object);
      batches.set(key, batch);
    });
  }

  for (const batch of batches.values()) {
    const { source, meshes } = batch;
    const object = new THREE.InstancedMesh(source.geometry, source.material, meshes.length);
    object.name = 'piece-instances';
    object.castShadow = source.castShadow;
    object.receiveShadow = source.receiveShadow;
    object.renderOrder = source.renderOrder;
    object.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    object.frustumCulled = false;
    batch.object = object;
    group.add(object);
  }

  const update = () => {
    for (const batch of batches.values()) {
      const object = batch.object!;
      batch.meshes.forEach((mesh, index) => {
        mesh.updateWorldMatrix(true, false);
        object.setMatrixAt(index, mesh.matrixWorld);
      });
      object.instanceMatrix.needsUpdate = true;
    }
  };
  update();

  return {
    group,
    update,
    get drawCalls() {
      return batches.size;
    },
    dispose() {
      group.removeFromParent();
      group.clear();
      batches.clear();
    },
  };
}
