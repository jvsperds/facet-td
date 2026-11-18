import * as THREE from 'three';

const DESIGNS: Record<string, { color: string; sides: number; crown: number; height: number }> = {
  gemtd_manao: { color: '#dfa57b', sides: 8, crown: 2, height: 0.27 },
  gemtd_xiameishi: { color: '#eee0ab', sides: 6, crown: 3, height: 0.24 },
  gemtd_ranshaozhishi: { color: '#e78440', sides: 6, crown: 5, height: 0.29 },
  gemtd_geluanshi: { color: '#75aa95', sides: 5, crown: 4, height: 0.3 },
  gemtd_heiyaoshi: { color: '#292c36', sides: 4, crown: 4, height: 0.32 },
};

/** The five secret stones use the same masonry language as the other gem towers. */
export function secretTowerHead(name: string) {
  const spec = DESIGNS[name];
  if (!spec) return null;
  const head = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({
    color: '#686c6c',
    roughness: 0.9,
    flatShading: true,
  });
  const trim = new THREE.MeshStandardMaterial({
    color: '#92928b',
    roughness: 0.8,
    flatShading: true,
  });
  const gem = new THREE.MeshStandardMaterial({
    color: spec.color,
    roughness: 0.38,
    metalness: 0.08,
    flatShading: true,
  });
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, y: number) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = y;
    mesh.castShadow = mesh.receiveShadow = true;
    head.add(mesh);
    return mesh;
  };
  add(new THREE.CylinderGeometry(0.29, 0.31, 0.1, 8), stone, 0.17);
  add(new THREE.CylinderGeometry(0.14, 0.22, 0.42, spec.sides), stone, 0.43);
  add(new THREE.CylinderGeometry(0.23, 0.16, 0.1, spec.sides), trim, 0.69);
  const pivot = new THREE.Group();
  pivot.position.y = 0.75;
  head.add(pivot);
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(spec.height), gem);
  core.scale.set(0.75, 1, 0.75);
  core.position.y = spec.height * 0.65;
  core.castShadow = core.receiveShadow = true;
  pivot.add(core);
  for (let i = 0; i < spec.crown; i++) {
    const angle = (i * Math.PI * 2) / spec.crown;
    const prong = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.25, 4), trim);
    prong.position.set(Math.cos(angle) * 0.19, 0.12, Math.sin(angle) * 0.19);
    prong.castShadow = prong.receiveShadow = true;
    pivot.add(prong);
  }
  return { head, pivot };
}
