import * as THREE from 'three';
import { useEffect, useRef } from 'preact/hooks';
import { createCreep } from '../../docs/art/model-study/models.js';
import { towerModel } from '../world/pieces';
import type { Sim } from '../sim/sim';
import type { Feedback } from './feedback';
import { Icon } from './icons';
import { compact, displayName } from './names';
import { CreepIcon, TowerIcon } from './TowerIcon';

// Bottom right: the showcase (Gem TD's unit model in the corner). While a wave runs it shows the
// wave's creep; after the wave, the MVP tower (also circled on the board); otherwise the next
// wave's creep. The model is live: a tower turns its head toward the cursor and a creep turns to
// face it. Castle HP and gold sit below. Without WebGL the cached model icon stands in.

/** The board's default view direction (azimuth 45°, elevation 35°), toward the camera. */
const VIEW = new THREE.Vector3(1, Math.SQRT2 * Math.tan((35.264 * Math.PI) / 180), 1).normalize();
/** Share of the remaining turn taken per frame, so the head eases after the cursor. */
const EASE = 0.18;

type Stage = ReturnType<typeof createStage>;

function createStage(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  // The board's lighting: warm sky, slate ground bounce, a sun from the upper left, a cool rim.
  scene.add(new THREE.HemisphereLight('#f6f3e9', '#56616a', 1.9));
  const sun = new THREE.DirectionalLight('#fff1da', 2.2);
  sun.position.set(-12, 30, 18);
  const rim = new THREE.DirectionalLight('#cfe2ff', 1.4);
  rim.position.set(-10, 8, -14);
  scene.add(sun, rim);
  const camera = new THREE.OrthographicCamera();
  let subject: THREE.Object3D | null = null;
  let creep = false;
  let frame = 0;
  // The cursor in client pixels, and the ground point the subject currently looks at.
  const pointer = { x: innerWidth / 2, y: innerHeight / 2 };
  const look = new THREE.Vector3(1, 0, 0);
  const aim = new THREE.Vector3();
  const ray = new THREE.Raycaster();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ndc = new THREE.Vector2();

  const resize = () => {
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    renderer.setSize(width, height, false);
    fit();
  };
  /** Frame the whole model, so nothing is cut off, with a little room for the head to turn. */
  const fit = () => {
    if (!subject) return;
    const box = new THREE.Box3().setFromObject(subject);
    const centre = box.getCenter(new THREE.Vector3());
    camera.position.copy(centre).addScaledVector(VIEW, 20);
    camera.up.set(0, 1, 0);
    camera.lookAt(centre);
    camera.updateMatrixWorld();
    const inverse = camera.matrixWorldInverse;
    let [w, h] = [0, 0];
    for (let i = 0; i < 8; i++) {
      const p = new THREE.Vector3(
        i & 1 ? box.max.x : box.min.x,
        i & 2 ? box.max.y : box.min.y,
        i & 4 ? box.max.z : box.min.z,
      ).applyMatrix4(inverse);
      [w, h] = [Math.max(w, Math.abs(p.x)), Math.max(h, Math.abs(p.y))];
    }
    const aspect = canvas.width / Math.max(1, canvas.height);
    const half = Math.max(h, w / aspect) * 1.15;
    Object.assign(camera, {
      left: -half * aspect,
      right: half * aspect,
      top: half,
      bottom: -half,
      near: 1,
      far: 60,
    });
    camera.updateProjectionMatrix();
  };
  const draw = () => {
    frame = 0;
    if (!subject) return;
    // Where the cursor's ray meets the ground under the model.
    const r = canvas.getBoundingClientRect();
    ndc.set(((pointer.x - r.left) / r.width) * 2 - 1, -((pointer.y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (ray.ray.intersectPlane(ground, aim)) {
      aim.y = 0;
      if (aim.lengthSq() < 1e-4) aim.set(1, 0, 0);
    }
    look.lerp(aim, EASE);
    if (creep) subject.rotation.y = Math.atan2(-look.z, look.x);
    else (subject.userData.aimAt as ((x: number, z: number) => void) | undefined)?.(look.x, look.z);
    renderer.render(scene, camera);
    // Keep easing until the head has caught up with the cursor.
    if (look.distanceToSquared(aim) > 1e-6) frame = requestAnimationFrame(draw);
  };
  const request = () => {
    if (!frame) frame = requestAnimationFrame(draw);
  };
  const onMove = (e: PointerEvent) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    request();
  };
  addEventListener('pointermove', onMove);
  const observer = new ResizeObserver(() => {
    resize();
    request();
  });
  observer.observe(canvas);
  const clear = () => {
    if (!subject) return;
    scene.remove(subject);
    subject.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    subject = null;
  };
  return {
    /** Show a tower, `creep:<unit>`, or nothing. */
    show(name: string | null) {
      clear();
      if (!name) return renderer.clear();
      creep = name.startsWith('creep:');
      const unit = name.slice(6);
      subject = creep
        ? createCreep({ modelScale: 1, flying: unit.includes('fly'), boss: unit.includes('boss') })
        : towerModel(name);
      scene.add(subject);
      subject.updateMatrixWorld(true);
      resize();
      request();
    },
    dispose() {
      cancelAnimationFrame(frame);
      removeEventListener('pointermove', onMove);
      observer.disconnect();
      clear();
      renderer.dispose();
    },
  };
}

export function Showcase({ sim, feedback }: { sim: Sim; feedback: Feedback; tick: number }) {
  const game = sim.game;
  const mvp =
    game.phase === 'build' ? game.gems.find((g) => g.id === feedback.mvp.value) : undefined;
  const creep = game.wavePreview.names[0];
  const subject = mvp ? mvp.name : creep ? `creep:${creep}` : null;
  const hp = Math.max(0, game.castleHp);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<Stage | null | undefined>(undefined);
  useEffect(() => {
    try {
      stage.current = createStage(canvas.current!);
    } catch {
      stage.current = null; // no WebGL: the icon stands in
    }
    return () => stage.current?.dispose();
  }, []);
  useEffect(() => stage.current?.show(subject), [subject]);
  return (
    <section
      class={`showcase ${mvp ? 'mvp' : ''}`}
      data-exclude
      aria-label={mvp ? 'Wave MVP' : game.phase === 'wave' ? 'Wave creep' : 'Next creep'}
    >
      <div class="showcase-stage">
        <span class="showcase-plinth" aria-hidden="true" />
        <canvas ref={canvas} class="showcase-model" aria-hidden="true" />
        {stage.current === null &&
          (mvp ? (
            <TowerIcon name={mvp.name} class="glyph showcase-icon" />
          ) : (
            creep && <CreepIcon name={creep} class="glyph showcase-icon" />
          ))}
        <span class="showcase-tag">{mvp ? 'MVP' : game.phase === 'wave' ? 'Wave' : 'Next'}</span>
        <span class="showcase-name">
          {mvp ? displayName(sim.data, mvp.name) : creep ? displayName(sim.data, creep) : ''}
        </span>
      </div>
      <div class="showcase-foot tabular">
        <span class={`castle ${hp <= 25 ? 'danger' : ''}`} aria-label={`Castle ${hp}%`}>
          <Icon name="castle" />
          {hp}%
        </span>
        <span class="gold" aria-label={`Gold ${game.gold}`}>
          <Icon name="coin" />
          {compact(game.gold)}
        </span>
      </div>
    </section>
  );
}
