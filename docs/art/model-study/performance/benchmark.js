import * as THREE from "three";
import { SimplifyModifier } from "three/addons/modifiers/SimplifyModifier.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { createModelBatch } from "../model-batch.js";
import {
  createGemTower,
  createStone,
  createCreep,
  GEM_TYPES,
} from "../models.js";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(1280, 720);
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.append(renderer.domElement);
renderer.domElement.setAttribute("aria-label", "Dense tower benchmark board");
const gl = renderer.getContext();
const debug = gl.getExtension("WEBGL_debug_renderer_info");
const status = document.querySelector("#status");
const run = document.querySelector("#run");
const templates = GEM_TYPES.map(({ id }) =>
  createGemTower(id, { quality: 6, seed: 3 }),
);
const wall = createStone({ seed: 3, neighbours: { east: true, west: true } });
const creep = createCreep({ modelScale: 1 });
const modifier = new SimplifyModifier();
const simplified = new Map();
// The embedded preview throttles requestAnimationFrame to 1 Hz, so measure synchronized work instead.
const nextFrame = () =>
  new Promise((resolve) => setTimeout(() => resolve(performance.now()), 0));
const percentile = (samples, p) =>
  [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * p) - 1];
const round = (n) => Math.round(n * 100) / 100;
const place = (object, i) => {
  const cell = (i * 541) % (37 * 37);
  object.position.set((cell % 37) - 18, 0, Math.floor(cell / 37) - 18);
};
const benchmark = {
  environment: {
    userAgent: navigator.userAgent,
    renderer: debug
      ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER),
    vendor: debug
      ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL)
      : gl.getParameter(gl.VENDOR),
    cpuThreads: navigator.hardwareConcurrency,
    deviceMemoryGB: navigator.deviceMemory ?? null,
    visibility: document.visibilityState,
    width: 1280,
    height: 720,
    pixelRatio: 1,
    shadowMap: 2048,
    threeRevision: THREE.REVISION,
    timing:
      "Yielded timers with gl.finish; rendering workload cost, not presented FPS",
    time: new Date().toISOString(),
  },
  results: [],
  state: "ready",
};
window.benchmark = benchmark;

async function measure(count, variant) {
  const start = performance.now();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#656d74");
  scene.add(new THREE.HemisphereLight("#f6f3e9", "#56616a", 2.5));
  const sun = new THREE.DirectionalLight("#fff1da", 3);
  sun.position.set(-30, 80, 50);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, {
    left: -30,
    right: 30,
    top: 30,
    bottom: -30,
    far: 150,
  });
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0003;
  scene.add(sun);
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(38, 0.12, 38),
    new THREE.MeshStandardMaterial({ color: "#c7cac9", roughness: 1 }),
  );
  floor.position.y = -0.07;
  floor.receiveShadow = true;
  scene.add(floor);
  const camera = new THREE.OrthographicCamera(-31, 31, 17.44, -17.44, 0.1, 200);
  camera.position.set(40, 40.5, 40);
  camera.lookAt(0, 0.5, 0);
  const towers = [],
    creeps = [],
    objects = [];
  for (let i = 0; i < count; i++) {
    const tower = templates[i % templates.length].clone(true);
    // clone() does not clone the aim closure; this benchmark moves the cloned head directly.
    place(tower, i);
    towers.push(tower);
    objects.push(tower);
  }
  for (let i = 0; i < count / 4; i++) {
    const object = wall.clone(true);
    place(object, count + i);
    objects.push(object);
  }
  for (let i = 0; i < 64; i++) {
    const object = creep.clone(true);
    place(object, count + count / 4 + i);
    creeps.push(object);
    objects.push(object);
  }
  const reduced = variant.includes("simplified");
  const instanced = variant.includes("instanced");
  const optimized = variant === "optimized";
  let optimizedBatch;
  const movingRoots = [
    ...towers.map((tower) => tower.children.at(-1).children.at(-1)),
    ...creeps,
  ];
  const ownedGeometries = [];
  const batches = new Map();
  const sourceTriangles = { original: 0, actual: 0 };
  for (const object of objects) {
    object.updateMatrixWorld(true);
    const meshes = [];
    object.traverse((mesh) => {
      if (mesh.isMesh) meshes.push(mesh);
    });
    for (const mesh of meshes) {
      const original = mesh.geometry;
      sourceTriangles.original +=
        (original.index?.count ?? original.attributes.position.count) / 3;
      if (reduced) {
        if (!simplified.has(original)) {
          // Diagnostic proxy: weld face seams so reduction works; average colours, not final art.
          const positions = new THREE.BufferGeometry().setAttribute(
            "position",
            original.attributes.position.clone(),
          );
          if (original.index) positions.setIndex(original.index.clone());
          const welded = mergeVertices(positions);
          const reduced = await modifier.modify(
            welded,
            Math.floor(welded.attributes.position.count * 0.6),
          );
          const flat = reduced.index ? reduced.toNonIndexed() : reduced;
          flat.computeVertexNormals();
          const source = original.attributes.color;
          const mean = [1, 1, 1];
          if (source) {
            mean.fill(0);
            for (let i = 0; i < source.count; i++)
              for (let j = 0; j < 3; j++)
                mean[j] += source.array[i * 3 + j] / source.count;
          }
          flat.setAttribute(
            "color",
            new THREE.Float32BufferAttribute(
              Array.from(
                { length: flat.attributes.position.count },
                () => mean,
              ).flat(),
              3,
            ),
          );
          simplified.set(original, flat);
          positions.dispose();
          welded.dispose();
          if (reduced !== flat) reduced.dispose();
        }
        mesh.geometry = simplified.get(original);
      }
      sourceTriangles.actual +=
        (mesh.geometry.index?.count ??
          mesh.geometry.attributes.position.count) / 3;
      if (!instanced) continue;
      const key = `${mesh.geometry.uuid}:${mesh.material.uuid}:${mesh.castShadow}:${mesh.receiveShadow}:${mesh.renderOrder}`;
      if (!batches.has(key))
        batches.set(key, {
          geometry: mesh.geometry,
          material: mesh.material,
          meshes: [],
          source: mesh,
        });
      batches.get(key).meshes.push(mesh);
    }
    if (!instanced && !optimized) scene.add(object);
  }
  for (const batch of batches.values()) {
    const geometry = batch.geometry.index
      ? batch.geometry.toNonIndexed()
      : batch.geometry.clone();
    ownedGeometries.push(geometry);
    batch.object = new THREE.InstancedMesh(
      geometry,
      batch.material,
      batch.meshes.length,
    );
    batch.object.castShadow = batch.source.castShadow;
    batch.object.receiveShadow = batch.source.receiveShadow;
    batch.object.renderOrder = batch.source.renderOrder;
    batch.object.frustumCulled = false;
    batch.object.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(batch.object);
  }
  if (optimized) {
    const source = new THREE.Group();
    source.add(...objects);
    optimizedBatch = createModelBatch(source, { dynamicRoots: movingRoots });
    scene.add(optimizedBatch.group);
  }
  renderer.shadowMap.enabled = !variant.includes("no-shadows");
  renderer.setSize(
    variant.includes("half-resolution") ? 640 : 1280,
    variant.includes("half-resolution") ? 360 : 720,
  );
  const constructionMs = performance.now() - start;
  const frameTimes = [],
    submitTimes = [],
    completionTimes = [],
    updateTimes = [];
  let previous;
  for (let frame = 0; frame < 38; frame++) {
    const timestamp = await nextFrame();
    const t = frame / 60;
    const updateStart = performance.now();
    for (let i = 0; i < towers.length; i++) {
      const head = towers[i].children.at(-1).children.at(-1);
      head.rotation.y = t + i;
      for (const part of head.children) part.rotation.z = -0.17;
    }
    for (let i = 0; i < creeps.length; i++)
      creeps[i].position.x += Math.sin(t + i) * 0.01;
    if (instanced) {
      for (const object of objects) object.updateMatrixWorld(true);
      for (const batch of batches.values()) {
        batch.meshes.forEach((mesh, i) =>
          batch.object.setMatrixAt(i, mesh.matrixWorld),
        );
        batch.object.instanceMatrix.needsUpdate = true;
      }
    }
    optimizedBatch?.update(movingRoots);
    const updateEnd = performance.now();
    const renderStart = performance.now();
    renderer.render(scene, camera);
    const submitted = performance.now();
    // Synchronous completion isolates a frame's work; this deliberately disables CPU/GPU overlap.
    gl.finish();
    const finished = performance.now();
    if (frame >= 8) {
      frameTimes.push(timestamp - previous);
      updateTimes.push(updateEnd - updateStart);
      submitTimes.push(submitted - renderStart);
      completionTimes.push(finished - updateStart);
    }
    previous = timestamp;
  }
  const result = {
    towers: count,
    walls: count / 4,
    creeps: 64,
    variant,
    visibility: document.visibilityState,
    frames: frameTimes.length,
    constructionMs: round(constructionMs),
    cycleMedianMs: round(percentile(frameTimes, 0.5)),
    cycleP95Ms: round(percentile(frameTimes, 0.95)),
    completedMedianMs: round(percentile(completionTimes, 0.5)),
    completedP95Ms: round(percentile(completionTimes, 0.95)),
    submitMedianMs: round(percentile(submitTimes, 0.5)),
    updateMedianMs: round(percentile(updateTimes, 0.5)),
    drawCalls: renderer.info.render.calls,
    renderedTriangles: renderer.info.render.triangles,
    originalTriangles: sourceTriangles.original,
    actualTriangles: sourceTriangles.actual,
    geometries: renderer.info.memory.geometries,
  };
  if (
    !Number.isFinite(result.completedMedianMs) ||
    result.frames !== 30 ||
    result.drawCalls < 1
  )
    throw new Error("Invalid benchmark sample");
  if (!reduced && sourceTriangles.original !== sourceTriangles.actual)
    throw new Error("Batching changed the triangle count");
  if (reduced && sourceTriangles.actual >= sourceTriangles.original * 0.85)
    throw new Error(
      "Proxy did not reduce enough triangles for a valid comparison",
    );
  floor.geometry.dispose();
  optimizedBatch?.dispose();
  floor.material.dispose();
  sun.shadow.map?.dispose();
  for (const batch of batches.values()) batch.object.dispose();
  ownedGeometries.forEach((geometry) => geometry.dispose());
  renderer.renderLists.dispose();
  return result;
}

async function runCases(cases) {
  if (benchmark.state === "running") return;
  benchmark.state = "running";
  run.disabled = true;
  document.querySelector("#optimize").disabled = true;
  benchmark.results = [];
  try {
    for (const [count, variant] of cases) {
      status.textContent = `Running ${count} towers / ${variant}…\n${JSON.stringify(benchmark.results, null, 2)}`;
      benchmark.results.push(await measure(count, variant));
    }
    benchmark.state = "complete";
    status.textContent = JSON.stringify(
      benchmark,
      (key, value) => (typeof value === "function" ? undefined : value),
      2,
    );
  } catch (error) {
    benchmark.state = "failed";
    benchmark.error = String(error.stack ?? error);
    status.textContent = benchmark.error;
  } finally {
    run.disabled = false;
    document.querySelector("#optimize").disabled = false;
  }
}
benchmark.runSuite = () =>
  runCases([
    [64, "current"],
    [256, "current"],
    [512, "current"],
    [1024, "current"],
    [256, "no-shadows"],
    [256, "half-resolution"],
    [256, "instanced"],
    [256, "simplified"],
    [256, "instanced-simplified"],
    [256, "instanced-no-shadows"],
    [256, "instanced-half-resolution"],
    [512, "instanced"],
  ]);
benchmark.runOptimization = () =>
  runCases(
    [64, 256, 512, 1024].flatMap((count) => [
      [count, "current"],
      [count, "instanced"],
      [count, "optimized"],
    ]),
  );
document
  .querySelector("#optimize")
  .addEventListener("click", benchmark.runOptimization);
run.addEventListener("click", benchmark.runSuite);
