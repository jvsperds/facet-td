import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** World-space rendering copy of the procedural models; source models retain their APIs.
 * Attach group directly to an identity scene. Rebuild after static transforms or visibility change.
 * Dispose this copy before disposing source geometry/materials. Materials are borrowed, never owned.
 */
export function createModelBatch(source, { dynamicRoots = [] } = {}) {
  const group = new THREE.Group();
  const roots = new Set(dynamicRoots);
  const entries = new Map(dynamicRoots.map((root) => [root, []]));
  const staticBatches = new Map();
  const movingBatches = new Map();
  const normalized = new Map();
  const shapeKeys = new Map();
  const materialKeys = new Map();
  const owned = new Set();
  const materialKey = (material) => {
    if (!materialKeys.has(material)) {
      const { uuid, name, metadata, ...properties } = material.toJSON();
      materialKeys.set(material, JSON.stringify(properties));
    }
    return materialKeys.get(material);
  };
  const geometryOf = (original) => {
    if (!normalized.has(original)) {
      const geometry = original.index
        ? original.toNonIndexed()
        : original.clone();
      for (const name of Object.keys(geometry.attributes))
        if (!["position", "normal", "color"].includes(name))
          geometry.deleteAttribute(name);
      if (!geometry.attributes.color)
        geometry.setAttribute(
          "color",
          new THREE.Float32BufferAttribute(
            new Float32Array(geometry.attributes.position.count * 3).fill(1),
            3,
          ),
        );
      normalized.set(original, geometry);
      owned.add(geometry);
    }
    return normalized.get(original);
  };
  source.updateWorldMatrix(true, true);
  source.traverseVisible((mesh) => {
    if (!mesh.isMesh) return;
    const material = mesh.material;
    if (
      Array.isArray(material) ||
      material.map ||
      Object.keys(mesh.geometry.morphAttributes).length
    )
      throw new TypeError(
        "Model batches require untextured, single-material procedural meshes",
      );
    let movingRoot = mesh;
    while (movingRoot && !roots.has(movingRoot)) movingRoot = movingRoot.parent;
    // Transparent shadows stay separate so three.js can sort them normally.
    if (material.transparent) {
      const copy = new THREE.Mesh(mesh.geometry, material);
      copy.matrixAutoUpdate = false;
      copy.matrix.copy(mesh.matrixWorld);
      copy.castShadow = mesh.castShadow;
      copy.receiveShadow = mesh.receiveShadow;
      copy.renderOrder = mesh.renderOrder;
      group.add(copy);
      if (movingRoot) entries.get(movingRoot).push({ mesh, copy });
      return;
    }
    const key = `${materialKey(material)}:${mesh.castShadow}:${mesh.receiveShadow}:${mesh.renderOrder}`;
    const geometry = geometryOf(mesh.geometry);
    if (!movingRoot) {
      if (!staticBatches.has(key))
        staticBatches.set(key, { material, meshes: [], source: mesh });
      const baked = geometry.clone().applyMatrix4(mesh.matrixWorld);
      staticBatches.get(key).meshes.push(baked);
    } else {
      if (!shapeKeys.has(geometry))
        shapeKeys.set(
          geometry,
          ["position", "normal", "color"]
            .map((name) => geometry.attributes[name].array.join(","))
            .join(";"),
        );
      const shape = shapeKeys.get(geometry);
      const movingKey = `${key}:${shape}`;
      if (!movingBatches.has(movingKey))
        movingBatches.set(movingKey, {
          material,
          geometry,
          meshes: [],
          source: mesh,
        });
      const batch = movingBatches.get(movingKey);
      const index = batch.meshes.length;
      batch.meshes.push(mesh);
      entries.get(movingRoot).push({ mesh, batch, index });
    }
  });
  const flags = (copy, mesh) => {
    copy.castShadow = mesh.castShadow;
    copy.receiveShadow = mesh.receiveShadow;
    copy.renderOrder = mesh.renderOrder;
    copy.matrixAutoUpdate = false;
    group.add(copy);
  };
  for (const batch of staticBatches.values()) {
    const geometry = mergeGeometries(batch.meshes);
    owned.add(geometry);
    batch.meshes.forEach((geometry) => geometry.dispose());
    flags(new THREE.Mesh(geometry, batch.material), batch.source);
  }
  for (const batch of movingBatches.values()) {
    batch.object = new THREE.InstancedMesh(
      batch.geometry,
      batch.material,
      batch.meshes.length,
    );
    batch.object.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    batch.object.frustumCulled = false; // Moving heads/creeps can leave the initial instance bounds.
    batch.meshes.forEach((mesh, i) =>
      batch.object.setMatrixAt(i, mesh.matrixWorld),
    );
    flags(batch.object, batch.source);
  }
  const retained = new Set(
    [...movingBatches.values()].map((batch) => batch.geometry),
  );
  for (const geometry of normalized.values())
    if (!retained.has(geometry)) {
      geometry.dispose();
      owned.delete(geometry);
    }
  normalized.clear();
  shapeKeys.clear();
  materialKeys.clear();
  staticBatches.clear();
  return {
    group,
    update(changedRoots = dynamicRoots) {
      const touched = new Set();
      for (const root of new Set(changedRoots)) {
        const list = entries.get(root);
        if (!list?.length) continue;
        root.updateWorldMatrix(true, true);
        for (const { mesh, batch, index, copy } of list) {
          if (copy) {
            copy.matrix.copy(mesh.matrixWorld);
            copy.matrixWorldNeedsUpdate = true;
          } else {
            batch.object.setMatrixAt(index, mesh.matrixWorld);
            batch.object.instanceMatrix.addUpdateRange(index * 16, 16);
            touched.add(batch.object);
          }
        }
      }
      for (const mesh of touched) mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      for (const batch of movingBatches.values()) batch.object.dispose();
      for (const geometry of owned) geometry.dispose();
      group.clear();
      entries.clear();
    },
  };
}
