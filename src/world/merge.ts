import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Draw-call reduction: the art-study models are built from many small meshes (a tower is 12 to 22,
// a creep about 10). Each frame pays per mesh, so models are merged into one mesh per material
// once they are posed. Nodes that move on their own (a tower's turning head) stay separate: the
// meshes under each are merged into it, so the node still carries them as it turns.

/** Geometry of `mesh` in `space`'s local frame, non-indexed, with only the given attributes. */
function inSpace(mesh: THREE.Mesh, space: THREE.Matrix4, keep: string[]) {
  const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  for (const name of Object.keys(g.attributes)) if (!keep.includes(name)) g.deleteAttribute(name);
  g.morphAttributes = {};
  g.clearGroups();
  return g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(space, mesh.matrixWorld));
}

/** Merge `meshes`, all inside `anchor`, into one new mesh per material under `anchor`. */
export function mergeInto(anchor: THREE.Object3D, meshes: THREE.Mesh[]) {
  anchor.updateWorldMatrix(true, true);
  const space = anchor.matrixWorld.clone().invert();
  const byMaterial = new Map<THREE.Material, THREE.Mesh[]>();
  for (const m of meshes) {
    // Multi-material meshes stay whole, moved under the anchor in case their parent is merged away.
    if (Array.isArray(m.material)) {
      anchor.attach(m);
      continue;
    }
    const list = byMaterial.get(m.material) ?? [];
    list.push(m);
    byMaterial.set(m.material, list);
  }
  const made: THREE.Mesh[] = [];
  for (const [material, list] of byMaterial) {
    if (list.length < 2) {
      anchor.attach(list[0]); // alone in its material: kept, but no longer under a merged parent
      continue;
    }
    // Only attributes every mesh has can be merged.
    const keep = ['position', 'normal', 'uv', 'color'].filter((name) =>
      list.every((m) => m.geometry.getAttribute(name)),
    );
    const merged = mergeGeometries(list.map((m) => inSpace(m, space, keep)));
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = list.some((m) => m.castShadow);
    mesh.receiveShadow = list.some((m) => m.receiveShadow);
    mesh.userData.sharedMaterial = list.some((m) => m.userData.sharedMaterial);
    mesh.userData.merged = true;
    anchor.add(mesh);
    made.push(mesh);
    for (const m of list) {
      m.removeFromParent();
      m.geometry.dispose();
    }
  }
  return made;
}

/**
 * Merge every mesh under `root` into one mesh per material, except inside `moving` nodes, whose
 * own meshes are merged into them instead. A mesh with a moving node below it stays as it is.
 */
export function mergeStatic(root: THREE.Object3D, moving: THREE.Object3D[] = []) {
  const anchors = new Set<THREE.Object3D>([root, ...moving]);
  const holdsAnchor = new Set<THREE.Object3D>();
  for (const a of moving) for (let p = a.parent; p && p !== root; p = p.parent) holdsAnchor.add(p);
  const groups = new Map<THREE.Object3D, THREE.Mesh[]>();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || anchors.has(o) || holdsAnchor.has(o)) return;
    let anchor = o.parent!;
    while (!anchors.has(anchor)) anchor = anchor.parent!;
    const list = groups.get(anchor) ?? [];
    list.push(o);
    groups.set(anchor, list);
  });
  for (const [anchor, list] of groups) mergeInto(anchor, list);
}

const worldCopies = new WeakMap<
  THREE.Mesh,
  { keep: string; source: THREE.BufferGeometry; geometry: THREE.BufferGeometry }
>();

/** One new world-space mesh of `meshes` (all of `material`), leaving the originals in place. */
export function mergedCopy(meshes: THREE.Mesh[], material: THREE.Material) {
  const keep = ['position', 'normal', 'uv', 'color'].filter((name) =>
    meshes.every((m) => m.geometry.getAttribute(name)),
  );
  const identity = new THREE.Matrix4();
  // Each mesh's world-space copy is kept: batches like the walls are rebuilt from mostly the same
  // blocks, so a rebuild only concatenates. Meshes in a batch must not move.
  const world = (m: THREE.Mesh) => {
    const id = keep.join();
    let hit = worldCopies.get(m);
    if (hit?.keep !== id || hit.source !== m.geometry) {
      m.updateWorldMatrix(true, false);
      hit = { keep: id, source: m.geometry, geometry: inSpace(m, identity, keep) };
      worldCopies.set(m, hit);
    }
    return hit.geometry;
  };
  const geometry = meshes.length ? mergeGeometries(meshes.map(world)) : new THREE.BufferGeometry();
  return new THREE.Mesh(geometry ?? new THREE.BufferGeometry(), material);
}

/**
 * New meshes, one per material, holding `meshes` in `space`'s local frame; the originals stay
 * where they are. For batches that are rebuilt as their members change.
 */
export function mergedIn(space: THREE.Object3D, meshes: THREE.Mesh[]) {
  space.updateWorldMatrix(true, true);
  const inverse = space.matrixWorld.clone().invert();
  const byMaterial = new Map<THREE.Material, THREE.Mesh[]>();
  for (const m of meshes) {
    if (Array.isArray(m.material)) continue;
    byMaterial.set(m.material, [...(byMaterial.get(m.material) ?? []), m]);
  }
  return [...byMaterial].flatMap(([material, list]) => {
    const keep = ['position', 'normal', 'uv', 'color'].filter((name) =>
      list.every((m) => m.geometry.getAttribute(name)),
    );
    const geometry = mergeGeometries(list.map((m) => inSpace(m, inverse, keep)));
    if (!geometry) return [];
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = list.some((m) => m.castShadow);
    mesh.receiveShadow = list.some((m) => m.receiveShadow);
    return [mesh];
  });
}
