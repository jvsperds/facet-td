import * as THREE from "three";
import {
  createStone,
  createGemTower,
  GEM_TYPES,
  QUALITY_TIERS,
  createCreep,
} from "./models.js";

const stage = document.querySelector("#stage");
const labels = document.querySelector("#labels");
const status = document.querySelector("#status");
const slider = document.querySelector("#merge");
const play = document.querySelector("#play");
const inspect = document.querySelector("#inspect");
for (const type of GEM_TYPES) {
  const option = document.createElement("option");
  option.value = type.name;
  option.textContent = type.name;
  inspect.append(option);
}
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
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
  "3D study: faceted rock walls join across shared edges. Eight named gems crown masonry towers, each with its own shaft shape, and towers join the walls they stand in. A row shows the six quality tiers. Placeholder creeps walk a corridor at their VPK-derived scale. Use the view, merge and variation controls to inspect.",
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
  new THREE.BoxGeometry(12, 0.12, 12),
  new THREE.MeshStandardMaterial({ color: "#c7cac9", roughness: 1 }),
);
floor.position.set(0, -0.07, 0);
floor.receiveShadow = true;
scene.add(floor);
const gridLines = [];
for (let x = -6; x <= 6; x++) gridLines.push(x, 0, -6, x, 0, 6);
for (let z = -6; z <= 6; z++) gridLines.push(-6, 0, z, 6, 0, z);
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
let stones = [],
  anchors = [],
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
  anchors.push({ element, position: new THREE.Vector3(x, 0.01, z) });
}
function build() {
  scene.remove(models);
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
  // Creeps walk the corridor between walls; sizes follow VPK ModelScale.
  [
    { modelScale: 1, title: "Wave creep", detail: "1.0" },
    { modelScale: 1.6, title: "Mid wave", detail: "1.6" },
    { modelScale: 2.2, title: "Late wave", detail: "2.2" },
    { modelScale: 5, boss: true, title: "Boss", detail: "5.0" },
    { modelScale: 1.6, flying: true, title: "Air", detail: "1.6" },
  ].forEach(({ title, detail, ...options }, i) => {
    const creep = createCreep(options);
    const x = -4 + i * 1.6;
    creep.position.set(x, 0, -4);
    models.add(creep);
    label(title, x, -3.45, detail);
  });
  // Quality is the only variable along this row.
  QUALITY_TIERS.forEach(({ tier, name }, i) => {
    const tower = createGemTower("R", { seed, quality: tier });
    const x = -3.25 + i * 1.3;
    tower.position.set(x, 0, 5.1);
    tower.name = `${name} Ruby`;
    models.add(tower);
    label(name, x, 5.6, String(tier));
  });
  scene.add(models);
  updateMerge(Number(slider.value));
  resize();
}
function updateMerge(value) {
  slider.value = value;
  stones.forEach((stone) => stone.userData.setMerge(value));
  status.textContent = `${value === 1 ? "Connected" : value === 0 ? "Separate" : "Merging"} · variation ${seed}`;
}
function stop() {
  animationStart = null;
  play.setAttribute("aria-pressed", "false");
  play.textContent = "Replay stone merge";
}
function resize() {
  const width = stage.clientWidth,
    height = stage.clientHeight;
  renderer.setSize(width, height);
  const aspect = width / height;
  const selected = models.children.find(
    (child) => child.name === inspect.value && inspect.value,
  );
  const target = selected
    ? selected.position.clone().add(new THREE.Vector3(0, 0.55, 0))
    : new THREE.Vector3();
  const viewAngle = angle - (top ? Math.PI / 4 : 0);
  const sine = Math.abs(Math.sin(viewAngle)),
    cosine = Math.abs(Math.cos(viewAngle));
  const half = selected
    ? Math.max(0.85, 0.65 / aspect)
    : Math.max(
        (6 * sine + 6 * cosine) * (top ? 1 : 1 / Math.sqrt(3)) + 0.85,
        (6 * cosine + 6 * sine + 0.85) / aspect,
      );
  models.children.forEach((child) => {
    child.visible =
      !inspect.value ||
      (inspect.value === "wall" ? !child.name : child === selected);
  });
  anchors.forEach((anchor) => {
    anchor.element.hidden = !!inspect.value;
  });
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
renderer.setAnimationLoop((time) => {
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
  renderer.render(scene, camera);
  for (const anchor of anchors) {
    const p = anchor.position.clone().project(camera);
    anchor.element.style.left = `${((p.x + 1) / 2) * stage.clientWidth}px`;
    anchor.element.style.top = `${((1 - p.y) / 2) * stage.clientHeight}px`;
  }
});
