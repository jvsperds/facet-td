import * as THREE from "three";
import {
  createStone,
  createGemTower,
  GEM_TYPES,
  SPECIAL_TOWERS,
  QUALITY_TIERS,
  createCreep,
} from "./models.js";
import { createModelBatch } from "./model-batch.js";
import { COMBINED_TOWERS, COMBINED_FAMILIES } from "./combined-towers.js";
import { createTowerParticles } from "./ambient-particles.js";

const stage = document.querySelector("#stage");
const labels = document.querySelector("#labels");
const status = document.querySelector("#status");
const slider = document.querySelector("#merge");
const play = document.querySelector("#play");
const walk = document.querySelector("#walk");
const inspect = document.querySelector("#inspect");
const identity = document.querySelector("#identity");
const galleryOption = document.createElement("option");
galleryOption.value = "Combined tower gallery";
galleryOption.textContent = "Combined tower gallery · 34 models";
inspect.append(galleryOption);
for (const family of ["Silver", "Malachite", ...COMBINED_FAMILIES]) {
  const option = document.createElement("option");
  option.value = `${family} family`;
  option.textContent = `${family} family`;
  inspect.append(option);
}
for (const type of [...GEM_TYPES, ...SPECIAL_TOWERS, ...COMBINED_TOWERS]) {
  const option = document.createElement("option");
  option.value = type.name;
  option.textContent = type.name;
  inspect.append(option);
}
const connectedOption = document.createElement("option");
connectedOption.value = "Connected wall gallery";
connectedOption.textContent = "Connected wall gallery · 38 towers";
inspect.append(connectedOption);
inspect.value = "Connected wall gallery";
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const particlesButton = document.querySelector("#particles");
let particles,
  particlesEnabled = !reducedMotion.matches;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#656d74");
const camera = new THREE.OrthographicCamera();
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true });
} catch (error) {
  document.querySelector("#error").hidden = false;
  document.querySelector("#error").textContent =
    `The 3D preview needs WebGL: ${error.message}`;
  throw error;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.setAttribute("role", "img");
renderer.domElement.setAttribute(
  "aria-label",
  "Tower study with all 46 designs, connected wall gallery, family comparisons and individual close-ups. The eight basic towers and quality examples remain available in Full study. Towers can aim at the passing target. Use Inspect and view controls to review.",
);
stage.prepend(renderer.domElement);
scene.add(new THREE.HemisphereLight("#f6f3e9", "#56616a", 2.5));
const sun = new THREE.DirectionalLight("#fff1da", 3);
sun.position.set(-3, 8, 5);
sun.castShadow = true;
Object.assign(sun.shadow.camera, {
  left: -10,
  right: 10,
  top: 10,
  bottom: -10,
});
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0003;
scene.add(sun);
const floor = new THREE.Mesh(
  new THREE.BoxGeometry(18, 0.12, 18),
  new THREE.MeshStandardMaterial({ color: "#c7cac9", roughness: 1 }),
);
floor.position.set(0, -0.07, 1);
floor.receiveShadow = true;
scene.add(floor);
const gridLines = [];
for (let x = -6; x <= 6; x++) gridLines.push(x, 0, -7, x, 0, 9);
for (let z = -7; z <= 9; z++) gridLines.push(-6, 0, z, 6, 0, z);
const grid = new THREE.LineSegments(
  new THREE.BufferGeometry().setAttribute(
    "position",
    new THREE.Float32BufferAttribute(gridLines, 3),
  ),
  new THREE.LineBasicMaterial({ color: "#b7bebb" }),
);
grid.position.y = -0.005;
scene.add(grid);
let models = new THREE.Group();
let homePositions = new Map();
let batch, batchedInspect;
let heads = [],
  joinRoots = [],
  motionRoots = [],
  motionDirty = true;
let stones = [],
  anchors = [],
  towers = [],
  creeps = [],
  target,
  walking = !reducedMotion.matches,
  walkClock = 6500, // Starts at x = 0.45, in a gap between towers.
  lastTime = null,
  seed = 1,
  angle = Math.PI / 4,
  top = false,
  animationStart = null;
const layouts = [
  {
    title: "Corridor wall",
    towers: { "-3,-5": "B", "0,-5": "Y" },
    cells: [-5, -4, -3, -2, -1, 0, 1, 2, 3].map((x) => [x, -5]),
  },
  { title: "Isolated", cells: [[-4, -2]] },
  {
    title: "Straight",
    cells: [
      [-1, -2],
      [0, -2],
      [1, -2],
    ],
  },
  {
    title: "Corner",
    cells: [
      [3, -2],
      [4, -2],
      [4, -3],
    ],
  },
  {
    title: "Junction",
    cells: [
      [-4, 0],
      [-3, 0],
      [-2, 0],
      [-3, -1],
      [-3, 1],
    ],
  },
  {
    title: "Wall with towers",
    towers: { "1,0": "R", "2,1": "G" },
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
      [3, 1],
      [4, 1],
    ],
  },
];
function label(text, x, z, detail = "") {
  const element = document.createElement("div");
  element.className = "label";
  const strong = document.createElement("strong");
  strong.textContent = text;
  element.append(strong, document.createTextNode(detail));
  labels.append(element);
  anchors.push({
    element,
    title: text,
    position: new THREE.Vector3(x, 0.01, z),
  });
}
// Health bars are HUD overlays: never depth-tested, so towers cannot hide them.
function healthBar(creep, fraction, hp) {
  const element = document.createElement("div");
  element.className = "health";
  element.setAttribute("aria-hidden", "true");
  if (hp) element.dataset.hp = hp;
  element.style.setProperty("--fill", `${fraction * 100}%`);
  labels.append(element);
  const { x, z } = creep.position;
  anchors.push({
    element,
    creep,
    position: new THREE.Vector3(x, creep.userData.healthBarY, z),
  });
}
function build() {
  if (particles) {
    scene.remove(particles.points);
    particles.dispose();
  }
  if (batch) {
    scene.remove(batch.group);
    batch.dispose();
    batch = null;
  }
  // Stone materials are shared; rebuilt meshes own their geometry.
  models.traverse((object) => {
    if (object.isInstancedMesh) object.dispose();
    if (object.isMesh && !object.isInstancedMesh) {
      object.geometry.dispose();
      if (!object.userData.sharedMaterial) object.material.dispose();
    }
  });
  models = new THREE.Group();
  stones = [];
  anchors = [];
  labels.replaceChildren();
  for (const layout of layouts) {
    const occupied = new Set(layout.cells.map(([x, z]) => `${x},${z}`));
    for (const [x, z] of layout.cells) {
      const options = {
        x,
        z,
        seed,
        quality: 3,
        neighbours: {
          north: occupied.has(`${x},${z - 1}`),
          south: occupied.has(`${x},${z + 1}`),
          east: occupied.has(`${x + 1},${z}`),
          west: occupied.has(`${x - 1},${z}`),
        },
      };
      const tower = layout.towers?.[`${x},${z}`];
      const stone = tower
        ? createGemTower(tower, options)
        : createStone(options);
      stone.name = ""; // Maze towers stay with the walls in Inspect.
      models.add(stone);
      stones.push(stone);
    }
    const [x, z] = layout.cells[0];
    label(layout.title, x + (layout.title === "Straight" ? 1 : 0), z + 0.65);
  }
  GEM_TYPES.forEach((type, i) => {
    const tower = createGemTower(type.id, { seed: seed + i });
    const x = -4.55 + i * 1.3;
    tower.position.set(x, 0, 2.65);
    models.add(tower);
    label(type.name, x, 3.15, type.id);
  });
  SPECIAL_TOWERS.forEach((type, i) => {
    const x = -3.3 + i * 2.2;
    const tower = createGemTower(type.id, { x: Math.round(x), z: 4, seed });
    tower.position.set(x, 0, 4.7);
    models.add(tower);
    label(type.name, x, 5.25);
  });
  COMBINED_TOWERS.forEach((type, i) => {
    const u = ((i % 7) - 3) * 1.4,
      depth = (Math.floor(i / 7) - 2) * 2;
    const tower = createGemTower(type.id, { seed });
    tower.position.set((u + depth) / Math.SQRT2, 0, (depth - u) / Math.SQRT2);
    models.add(tower);
    label(type.name, tower.position.x, tower.position.z + 0.55);
    anchors.at(-1).element.dataset.extended = "true";
  });
  const connections = new THREE.Group();
  connections.name = "Connected wall gallery";
  connections.userData.connections = true;
  const connectedTypes = [...SPECIAL_TOWERS, ...COMBINED_TOWERS];
  connectedTypes.forEach((type, i) => {
    const column = i % 7,
      row = Math.floor(i / 7),
      x = (column - 3) * 2,
      z = row * 2 - 5,
      east = column < 6 && i < connectedTypes.length - 1,
      west = column > 0;
    const tower = createGemTower(type.id, {
      x,
      z,
      seed,
      neighbours: { east, west },
    });
    connections.add(tower);
    stones.push(tower);
    label(type.name, x + 0.25, z + 0.5);
    anchors.at(-1).element.dataset.connections = "true";
    if (east) {
      const wall = createStone({
        x: x + 1,
        z,
        seed,
        neighbours: { east: true, west: true },
      });
      connections.add(wall);
      stones.push(wall);
    }
  });
  models.add(connections);
  // Creeps walk the corridor between walls; sizes follow VPK ModelScale.
  // HP values are illustrative; only bosses show the number, as in the user's reference.
  [
    { x: -4.6, modelScale: 1, title: "Wave creep", detail: "1.0", hp: 1 },
    { x: -3.4, modelScale: 1.6, title: "Mid wave", detail: "1.6", hp: 0.7 },
    { x: -2, modelScale: 2.2, title: "Late wave", detail: "2.2", hp: 0.45 },
    { x: 0.3, modelScale: 5, boss: true, title: "Boss", detail: "5.0" },
    { x: 2.6, modelScale: 1.6, flying: true, title: "Air", detail: "1.6" },
  ].forEach(({ x, title, detail, hp = 0.8, ...options }) => {
    const creep = createCreep(options);
    creep.position.set(x, 0, -4);
    models.add(creep);
    label(title, x, -3, detail);
    healthBar(creep, hp, options.boss ? "1925" : "");
  });
  // A creep walks the lane behind the tower rows so the heads can be seen tracking it.
  target = createCreep({ modelScale: 1.6 });
  target.position.set(0, 0, 1.8);
  models.add(target);
  healthBar(target, 0.6);
  // Quality is the only variable along this row.
  QUALITY_TIERS.forEach(({ tier, name }, i) => {
    const tower = createGemTower("D", { seed, quality: tier });
    const x = -3.25 + i * 1.3;
    tower.position.set(x, 0, 7.0);
    tower.name = `${name} Diamond`;
    models.add(tower);
    label(name, x, 7.5, String(tier));
  });
  homePositions = new Map(
    models.children
      .filter((child) => child.name)
      .map((child) => [child, child.position.clone()]),
  );
  towers = [];
  models.traverse((child) => {
    if (child.userData.aimAt) towers.push(child);
  });
  particles = createTowerParticles(towers, {
    pixelRatio: renderer.getPixelRatio(),
  });
  particles.points.visible = particlesEnabled;
  scene.add(particles.points);
  creeps = models.children.filter((child) => child.userData.healthBarY);
  heads = towers.map((tower) => tower.children.at(-1).children.at(-1));
  joinRoots = stones.flatMap((stone) =>
    stone.userData.aimAt
      ? stone.children.slice(1, -1)
      : stone.children.slice(1),
  );
  motionRoots = [...heads, target];
  motionDirty = true;
  updateMerge(Number(slider.value));
  resize();
}
function updateMerge(value) {
  slider.value = value;
  stones.forEach((stone) => stone.userData.setMerge(value));
  batch?.update(joinRoots);
  status.textContent = `${value === 1 ? "Connected" : value === 0 ? "Separate" : "Merging"} · variation ${seed}`;
}
function stop() {
  animationStart = null;
  play.setAttribute("aria-pressed", "false");
  play.textContent = "Replay wall join";
}
function resize() {
  const width = stage.clientWidth,
    height = stage.clientHeight;
  renderer.setSize(width, height);
  const aspect = width / height;
  const connectedPass = inspect.value === "Connected wall gallery";
  const selected = models.children.find(
    (child) =>
      !child.userData.connections &&
      child.name === inspect.value &&
      inspect.value,
  );
  const galleryPass = inspect.value === "Combined tower gallery";
  const family = [...SPECIAL_TOWERS, ...COMBINED_TOWERS].filter(
    (type) => `${type.family} family` === inspect.value,
  );
  const familyModels = models.children.filter((child) =>
    family.some((type) => type.name === child.name),
  );
  for (const [model, home] of homePositions) model.position.copy(home);
  if (familyModels.length)
    familyModels.forEach((model, i) =>
      model.position.set((i - (familyModels.length - 1) / 2) * 1.65, 0, 0),
    );
  const labelAngle = angle - (top ? Math.PI / 4 : 0);
  for (const anchor of anchors) {
    if (anchor.element.dataset.connections) continue;
    const model = models.children.find(
      (child) => child.name && child.name === anchor.title,
    );
    if (model)
      anchor.position.set(
        model.position.x +
          (model.userData.extended ? 0.45 * Math.sin(labelAngle) : 0),
        0.01,
        model.position.z +
          (model.userData.extended ? 0.45 * Math.cos(labelAngle) : 0.55),
      );
  }
  const frameModels = connectedPass
    ? models.children
        .find((child) => child.userData.connections)
        .children.filter((child) => child.userData.aimAt)
    : galleryPass
      ? models.children.filter((child) => child.userData.extended)
      : familyModels;
  const target = selected
    ? selected.position.clone().add(new THREE.Vector3(0, 0.55, 0))
    : frameModels.length
      ? frameModels
          .reduce((sum, model) => sum.add(model.position), new THREE.Vector3())
          .multiplyScalar(1 / frameModels.length)
          .add(new THREE.Vector3(0, 0.55, 0))
      : new THREE.Vector3(0, 0, 1);
  const viewAngle = labelAngle;
  const sine = Math.abs(Math.sin(viewAngle)),
    cosine = Math.abs(Math.cos(viewAngle));
  const framedHalf = frameModels.length
    ? Math.max(
        0.9,
        ...frameModels.map((model) => {
          const p = model.position.clone().sub(target);
          const across = p.x * Math.cos(viewAngle) - p.z * Math.sin(viewAngle);
          const depth = p.x * Math.sin(viewAngle) + p.z * Math.cos(viewAngle);
          const bottom = top
            ? -depth
            : p.y * Math.sqrt(2 / 3) - depth / Math.sqrt(3);
          const upper = bottom + (top ? 0 : 1.15 * Math.sqrt(2 / 3));
          return Math.max(
            (Math.abs(across) + 0.5) / aspect,
            Math.abs(bottom) + 0.45,
            Math.abs(upper) + 0.3,
          );
        }),
      )
    : 0;
  const half = selected
    ? Math.max(0.85, 0.65 / aspect)
    : frameModels.length
      ? framedHalf
      : Math.max(
          (6 * sine + 8 * cosine) * (top ? 1 : 1 / Math.sqrt(3)) + 0.85,
          (6 * cosine + 8 * sine + 0.85) / aspect,
        );
  models.children.forEach((child) => {
    if (child.userData.connections) {
      child.visible = connectedPass;
      return;
    }
    child.visible = !inspect.value
      ? !child.userData.extended
      : galleryPass
        ? !!child.userData.extended
        : inspect.value === "wall"
          ? !child.name
          : familyModels.length
            ? familyModels.includes(child)
            : child === selected;
  });
  if (!batch || batchedInspect !== inspect.value) {
    if (batch) {
      scene.remove(batch.group);
      batch.dispose();
    }
    batch = createModelBatch(models, {
      dynamicRoots: [...motionRoots, ...joinRoots],
    });
    scene.add(batch.group);
    batchedInspect = inspect.value;
    motionDirty = true;
  }
  anchors.forEach((anchor) => {
    const galleryLabel = !!anchor.element.dataset.extended;
    if (connectedPass || anchor.element.dataset.connections) {
      anchor.element.hidden =
        !connectedPass || !anchor.element.dataset.connections;
      return;
    }
    anchor.element.hidden = !inspect.value
      ? galleryLabel
      : galleryPass
        ? !galleryLabel
        : !family.some((type) => type.name === anchor.title);
  });
  const showingCombined =
    galleryPass ||
    connectedPass ||
    family.some((type) => type.extended) ||
    !!selected?.userData.extended;
  identity.hidden = !showingCombined;
  identity.replaceChildren();
  const identities = selected?.userData.extended
    ? COMBINED_TOWERS.filter((type) => type.name === selected.name)
    : family.filter((type) => type.extended);
  if (showingCombined && !identities.length) {
    const note = document.createElement("p");
    note.textContent =
      "Choose a family or individual tower in Inspect to compare its source ability with the design cues.";
    identity.append(note);
  }
  for (const type of identities) {
    const article = document.createElement("article"),
      heading = document.createElement("h3"),
      effect = document.createElement("strong"),
      description = document.createElement("p"),
      design = document.createElement("p");
    heading.textContent = type.name;
    effect.textContent = type.effect;
    description.textContent = `Source: ${type.sourceDescription}`;
    design.textContent = `Design: ${type.design}`;
    article.append(heading, effect, description, design);
    identity.append(article);
  }
  play.disabled = false;
  slider.disabled = false;
  const merge = Number(slider.value);
  status.textContent = `${merge === 1 ? "Connected" : merge === 0 ? "Separate" : "Merging"} · variation ${seed}`;
  camera.left = -half * aspect;
  camera.right = half * aspect;
  camera.top = half;
  camera.bottom = -half;
  camera.near = 0.1;
  camera.far = 100;
  camera.position.set(
    top ? 0.001 * Math.sin(viewAngle) : 12 * Math.sin(viewAngle),
    top ? 20 : 12 / Math.sqrt(2),
    top ? 0.001 * Math.cos(viewAngle) : 12 * Math.cos(viewAngle),
  );
  camera.position.add(target);
  camera.lookAt(target);
  camera.updateProjectionMatrix();
}
inspect.onchange = resize;
document.querySelector("#iso").onclick = () => {
  top = false;
  updateView();
};
document.querySelector("#top").onclick = () => {
  top = true;
  updateView();
};
function updateView() {
  document.querySelector("#iso").setAttribute("aria-pressed", String(!top));
  document.querySelector("#top").setAttribute("aria-pressed", String(top));
  resize();
}
document.querySelector("#turn").onclick = () => {
  angle += Math.PI / 2;
  resize();
};
document.querySelector("#gray").onclick = (event) => {
  const enabled = event.target.getAttribute("aria-pressed") !== "true";
  event.target.setAttribute("aria-pressed", String(enabled));
  renderer.domElement.style.filter = enabled ? "grayscale(1)" : "";
};
document.querySelector("#variation").onclick = () => {
  seed++;
  build();
};
slider.oninput = () => {
  stop();
  updateMerge(Number(slider.value));
};
play.onclick = () => {
  if (animationStart !== null) {
    stop();
    return;
  }
  if (reducedMotion.matches) {
    updateMerge(Number(slider.value) === 1 ? 0 : 1);
    return;
  }
  animationStart = performance.now();
  play.setAttribute("aria-pressed", "true");
  play.textContent = "Pause merge";
};
build();
new ResizeObserver(resize).observe(stage);
// The game owns targeting; here each tower aims at its nearest creep.
function aimTowers() {
  const at = new THREE.Vector3();
  for (const tower of towers) {
    tower.getWorldPosition(at);
    const nearest = creeps.reduce((best, creep) =>
      creep.position.distanceTo(at) < best.position.distanceTo(at)
        ? creep
        : best,
    );
    tower.userData.aimAt(nearest.position.x, nearest.position.z);
  }
}
function updateWalk() {
  walk.setAttribute("aria-pressed", String(walking));
  walk.textContent = walking ? "Pause target" : "Walk target";
}
walk.onclick = () => {
  walking = !walking;
  motionDirty = true;
  updateWalk();
};
updateWalk();
function updateParticlesButton() {
  particlesButton.setAttribute("aria-pressed", String(particlesEnabled));
}
particlesButton.onclick = () => {
  particlesEnabled = !particlesEnabled;
  particles.points.visible = particlesEnabled;
  updateParticlesButton();
};
reducedMotion.addEventListener("change", () => {
  particlesEnabled = !reducedMotion.matches;
  particles.points.visible = particlesEnabled;
  updateParticlesButton();
});
updateParticlesButton();
renderer.setAnimationLoop((time) => {
  if (walking && lastTime !== null) walkClock += time - lastTime;
  lastTime = time;
  if (walking || motionDirty) {
    // Walk back and forth between x = -5.4 and 5.4 at 0.9 cell per second.
    const step = ((walkClock / 1000) * 0.9) % 21.6;
    target.position.x = step < 10.8 ? step - 5.4 : 16.2 - step;
    target.rotation.y = step < 10.8 ? 0 : Math.PI;
    anchors.find((anchor) => anchor.creep === target).position.x =
      target.position.x;
    aimTowers();
    batch.update(motionRoots);
    motionDirty = false;
  }
  if (animationStart !== null) {
    if (reducedMotion.matches) {
      stop();
      updateMerge(1);
    } else {
      const progress = Math.min((time - animationStart) / 1100, 1);
      updateMerge(progress);
      if (progress === 1) stop();
    }
  }
  if (particlesEnabled)
    particles.update(reducedMotion.matches ? 0 : time / 1000);
  renderer.render(scene, camera);
  for (const anchor of anchors) {
    const p = anchor.position.clone().project(camera);
    anchor.element.style.left = `${((p.x + 1) / 2) * stage.clientWidth}px`;
    anchor.element.style.top = `${((1 - p.y) / 2) * stage.clientHeight}px`;
  }
});
