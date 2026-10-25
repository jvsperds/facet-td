import { render } from 'preact';
import { signal } from '@preact/signals';
import * as THREE from 'three';
import { loadData, type Mode } from './data';
import { Sim, TICK_HZ } from './sim/sim';
import './style.css';

// Phase 1 placeholder: proves the stack wires together. The board comes in phase 2.
const mode: Mode = 'classic';
const sim = new Sim(loadData(mode), 1);
const tick = signal(0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
camera.position.set(3, 3, 3);
camera.lookAt(0, 0, 0);
const gem = new THREE.Mesh(
  new THREE.OctahedronGeometry(1),
  new THREE.MeshStandardMaterial({ color: 0x4fa3ff, flatShading: true }),
);
scene.add(gem, new THREE.AmbientLight(0xffffff, 0.4));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(2, 4, 1);
scene.add(sun);

const resize = () => {
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(devicePixelRatio);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
};
addEventListener('resize', resize);
resize();

let last = performance.now();
let acc = 0;
renderer.setAnimationLoop((now) => {
  acc += Math.min(now - last, 250) / 1000;
  last = now;
  while (acc >= 1 / TICK_HZ) {
    sim.step();
    acc -= 1 / TICK_HZ;
  }
  tick.value = sim.tick;
  gem.rotation.y = now / 1000;
  renderer.render(scene, camera);
});

function Hud() {
  return (
    <div class="hud">
      Facet TD · {mode} · data {sim.data.version} · tick {tick}
    </div>
  );
}
render(<Hud />, document.getElementById('hud')!);
