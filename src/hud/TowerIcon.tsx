import * as THREE from 'three';
import { signal } from '@preact/signals';
import { createCreep } from '../../docs/art/model-study/models.js';
import { towerModel } from '../world/pieces';
import { gemType } from './names';
import { GemGlyph } from './icons';

// HUD icons rendered from the actual 3D tower models (the same art-study factories the board uses),
// so a slot, chip or combine button shows the tower you will get. Each name is rendered once, in
// an isometric three-quarter view on a transparent background, and cached as an image. Rendering
// is queued and spread across frames; until an icon is ready, or where WebGL is unavailable, the
// faceted SVG glyph stands in at the same size.

const SIZE = 128; // px: crisp at the largest HUD size (48 px swatch) on 2x screens
const cache = new Map<string, string>();
const queue: string[] = [];
/** Bumped when icons finish rendering, so components waiting on them redraw. */
const ready = signal(0);
let studio:
  | { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.OrthographicCamera }
  | null
  | undefined;
let scheduled = false;

function setup() {
  try {
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(SIZE, SIZE, false);
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    // The board's lighting: warm sky, slate ground bounce, a sun from the upper left.
    scene.add(new THREE.HemisphereLight('#f6f3e9', '#56616a', 1.9));
    const sun = new THREE.DirectionalLight('#fff1da', 2.2);
    sun.position.set(-12, 30, 18);
    // A cool rim from behind lifts the silhouette off the dark HUD panels.
    const rim = new THREE.DirectionalLight('#cfe2ff', 1.4);
    rim.position.set(-10, 8, -14);
    scene.add(sun, rim);
    return { renderer, scene, camera: new THREE.OrthographicCamera() };
  } catch {
    return null;
  }
}

/** The board's default isometric view direction (azimuth 45°, elevation 35°), toward the camera. */
const VIEW = new THREE.Vector3(1, Math.SQRT2 * Math.tan((35.264 * Math.PI) / 180), 1).normalize();

function render(name: string) {
  const { renderer, scene, camera } = studio!;
  // `creep:<unit>` draws that creep whole; any other name is a tower.
  const creep = name.startsWith('creep:') ? name.slice(6) : null;
  // The tower without its stone footing: on the board it rises from a wall turret instead.
  const subject = creep
    ? createCreep({ modelScale: 1, flying: creep.includes('fly'), boss: creep.includes('boss') })
    : towerModel(name).children.at(-1)!;
  const holder = new THREE.Group().add(subject);
  subject.position.set(0, 0, 0);
  scene.add(holder);
  holder.updateMatrixWorld(true);
  // Frame the head (the gem and its setting): every part centred in the upper half of the tower.
  // The shaft and plinth below are the same on every tower and would shrink the gem to a speck.
  const whole = new THREE.Box3().setFromObject(holder);
  const waist = whole.min.y + 0.45 * (whole.max.y - whole.min.y);
  const box = new THREE.Box3();
  const part = new THREE.Box3();
  holder.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    part.setFromObject(o);
    if ((part.min.y + part.max.y) / 2 > waist) box.union(part);
  });
  if (box.isEmpty() || creep) box.copy(whole);
  const centre = box.getCenter(new THREE.Vector3());
  camera.position.copy(centre).addScaledVector(VIEW, 20);
  camera.up.set(0, 1, 0);
  camera.lookAt(centre);
  camera.updateMatrixWorld();
  const inverse = camera.matrixWorldInverse;
  let half = 0;
  for (let i = 0; i < 8; i++) {
    const p = new THREE.Vector3(
      i & 1 ? box.max.x : box.min.x,
      i & 2 ? box.max.y : box.min.y,
      i & 4 ? box.max.z : box.min.z,
    ).applyMatrix4(inverse);
    half = Math.max(half, Math.abs(p.x), Math.abs(p.y));
  }
  half *= 1.06;
  Object.assign(camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 60 });
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  scene.remove(holder);
  holder.traverse((o) => {
    if (o instanceof THREE.Mesh) o.geometry.dispose();
  });
  return url;
}

function drain() {
  scheduled = false;
  const start = performance.now();
  // A few icons per frame, so opening the recipe book never stalls the board.
  while (queue.length && performance.now() - start < 12) {
    const name = queue.shift()!;
    try {
      cache.set(name, render(name));
    } catch {
      cache.set(name, '');
    }
  }
  ready.value++;
  if (queue.length) schedule();
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(drain);
}

/** The cached icon for a tower name: a data URL, '' if it cannot be drawn, undefined while queued. */
export function iconOf(name: string): string | undefined {
  const hit = cache.get(name);
  if (hit !== undefined) return hit;
  if (studio === undefined) studio = typeof document === 'undefined' ? null : setup();
  if (!studio) return '';
  if (!queue.includes(name)) queue.push(name);
  schedule();
  return undefined;
}

/** A gem or tower icon drawn from its 3D model; the SVG glyph until (or unless) that is ready. */
export function TowerIcon({ name, class: cls = 'glyph' }: { name: string; class?: string }) {
  void ready.value; // redraw when queued icons arrive
  const url = iconOf(name);
  if (url)
    return <img class={`${cls} model`} src={url} alt="" aria-hidden="true" draggable={false} />;
  return <GemGlyph type={gemType(name)} class={cls} />;
}

/** A creep's portrait from its 3D model; a dot until it is ready. */
export function CreepIcon({ name, class: cls = 'glyph' }: { name: string; class?: string }) {
  void ready.value;
  const url = iconOf(`creep:${name}`);
  if (url)
    return <img class={`${cls} model`} src={url} alt="" aria-hidden="true" draggable={false} />;
  return <span class={`${cls} creep-dot`} aria-hidden="true" />;
}
