import * as THREE from 'three';
import { OrbitControls } from '/vendor/OrbitControls.js';

const $ = (id) => document.getElementById(id);
const status = $('validation');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const isoPolar = Math.acos(1 / Math.sqrt(3));
const openings = [
  { name: 'Cave entrance', anchor: new THREE.Vector3(-23.5, 0, -23.5), cell: [4, 4], yaw: Math.PI / 4 },
  { name: 'Castle', anchor: new THREE.Vector3(23.5, 0, 23.5), cell: [32, 32], yaw: -3 * Math.PI / 4 },
];
const cellPosition = ([c, r]) => new THREE.Vector3(c - 18, 0, r - 18);
const lanes = openings.map((o) => ({ start: cellPosition(o.cell), end: o.anchor, width: 3.2 }));
function distanceToLane(x, z, lane) {
  const dx = lane.end.x - lane.start.x, dz = lane.end.z - lane.start.z;
  const t = THREE.MathUtils.clamp(((x - lane.start.x) * dx + (z - lane.start.z) * dz) / (dx * dx + dz * dz), 0, 1);
  return Math.hypot(x - lane.start.x - t * dx, z - lane.start.z - t * dz);
}

async function main() {
  const response = await fetch('../board-reference.json');
  if (!response.ok) throw new Error('Cannot load the checked board reference.');
  const board = await response.json();
  assert(board.width === 37 && board.height === 37, 'Expected the checked 37 × 37 reference board.');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#515a63');
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.setAttribute('aria-label', 'Sunken cave environment. Use the labeled camera controls to inspect the fixed cave entrance and embedded castle.');
  $('viewport').prepend(renderer.domElement);
  const camera = new THREE.OrthographicCamera(-40, 40, 27, -27, 0.1, 250);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.minZoom = 0.65;
  controls.maxZoom = 3;
  controls.enableRotate = false;
  controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
  controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
  controls.touches.ONE = THREE.TOUCH.PAN;
  controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
  let mode = 'iso', locked = true;
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const materials = {
    floor: new THREE.MeshStandardMaterial({ color: '#606a73', roughness: 1 }),
    board: new THREE.MeshStandardMaterial({ color: '#b7bec0', roughness: 1 }),
    cross: new THREE.MeshStandardMaterial({ color: '#939ea3', roughness: 1 }),
    wall: new THREE.MeshStandardMaterial({ color: '#687580', roughness: 1, flatShading: true }),
    frame: new THREE.MeshStandardMaterial({ color: '#88949d', roughness: 0.95, flatShading: true }),
    dark: new THREE.MeshStandardMaterial({ color: '#19232d', roughness: 1 }),
    gate: new THREE.MeshStandardMaterial({ color: '#58646f', metalness: 0.35, roughness: 0.65 }),
    lamp: new THREE.MeshStandardMaterial({ color: '#ffc16b', emissive: '#ed922f', emissiveIntensity: 2 }),
    crystal: new THREE.MeshStandardMaterial({ color: '#b2ddf5', emissive: '#4a83a5', emissiveIntensity: 0.6, roughness: 0.5, flatShading: true }),
  };
  const solids = [];
  function box(parent, w, h, d, x, y, z, material, check = false) {
    const mesh = new THREE.Mesh(unitBox, material);
    mesh.scale.set(w, h, d); mesh.position.set(x, y, z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh);
    if (check) solids.push(mesh);
    return mesh;
  }
  scene.add(new THREE.HemisphereLight('#b8c7d3', '#32333a', 2.2));
  const sun = new THREE.DirectionalLight('#fff1da', 3.1);
  sun.position.set(-18, 38, 14); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -38, right: 38, top: 38, bottom: -38, near: 1, far: 100 });
  sun.shadow.bias = -0.0005; scene.add(sun);
  // One continuous floor: board, apron and both approaches have the same ground level.
  box(scene, 160, 0.6, 160, 0, -0.3, 0, materials.floor);
  box(scene, 37, 0.025, 37, 0, 0.0125, 0, materials.board);
  box(scene, 1, 0.015, 37, 0, 0.033, 0, materials.cross);
  box(scene, 37, 0.015, 1, 0, 0.033, 0, materials.cross);
  const grid = new THREE.GridHelper(37, 37, '#78858d', '#929ea5');
  grid.position.y = 0.05; scene.add(grid);
  const markerCells = [board.spawn, ...board.checkpoints, board.castle];
  const markerKeys = new Set(markerCells.map(([c, r]) => `${c},${r}`));
  let fixedWallCount = 0;
  for (const segment of board.walls.segments) {
    const [c0, c1] = segment.cols ?? [segment.col, segment.col];
    const [r0, r1] = segment.rows ?? [segment.row, segment.row];
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      if (markerKeys.has(`${c},${r}`)) continue;
      box(scene, 0.92, 0.2, 0.92, c - 18, 0.15, r - 18, materials.frame);
      fixedWallCount++;
    }
  }
  assert(fixedWallCount === 32, 'Fixed-wall reference changed unexpectedly.');
  const vertices = [[-20,-27],[20,-27],[27,-20],[27,20],[20,27],[-20,27],[-27,20],[-27,-20]];
  const wallGroups = [];
  const rockBoxes = [];
  for (let edge = 0; edge < vertices.length; edge++) {
    const a = new THREE.Vector2(...vertices[edge]), b = new THREE.Vector2(...vertices[(edge + 1) % vertices.length]);
    const delta = b.clone().sub(a), length = delta.length(), u = delta.normalize();
    const normal = new THREE.Vector3(u.y, 0, -u.x);
    const matrices = [], lowMatrices = [];
    const count = Math.ceil(length / 1.65);
    for (let step = 0; step < count; step++) for (let depth = 0; depth < 3; depth++) {
      const t = (step + 0.5) / count;
      const x = a.x + (b.x - a.x) * t + normal.x * depth * 1.55;
      const z = a.y + (b.y - a.y) * t + normal.z * depth * 1.55;
      if (lanes.some((lane) => distanceToLane(x, z, lane) < 3.1) || openings.some((o) => Math.hypot(x-o.anchor.x,z-o.anchor.z) < 6)) continue;
      const rows = 4 + ((Math.floor(step / 5) + depth + edge) % 3);
      for (let row = 0; row < rows; row++) {
        const matrix = new THREE.Matrix4().compose(new THREE.Vector3(x, 0.75 + row * 1.5, z), new THREE.Quaternion(), new THREE.Vector3(1.7, 1.5, 1.7));
        matrices.push(matrix);
        if (row === 0) lowMatrices.push(matrix);
        rockBoxes.push({ minX: x - .85, maxX: x + .85, minZ: z - .85, maxZ: z + .85, minY: row * 1.5, maxY: (row + 1) * 1.5 });
      }
    }
    function instances(list) {
      const mesh = new THREE.InstancedMesh(unitBox, materials.wall, list.length);
      list.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
      mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh); return mesh;
    }
    // An upper rock shelf around the lower chamber makes the arena visibly sunken.
    const shelf = new THREE.Group();
    const spans = (edge === 3 || edge === 7) ? [[0,.12],[.88,1]] : [[0,1]];
    for (const [lo,hi] of spans) {
      const aa = a.clone().lerp(b,lo), bb = a.clone().lerp(b,hi);
      const shape = new THREE.Shape();
      const rim = [[aa.x,aa.y],[bb.x,bb.y],[bb.x+normal.x*8,bb.y+normal.z*8],[aa.x+normal.x*8,aa.y+normal.z*8]];
      rim.forEach(([x,z],i) => i ? shape.lineTo(x,-z) : shape.moveTo(x,-z)); shape.closePath();
      const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(-Math.PI/2), materials.wall);
      mesh.position.y = 6; mesh.receiveShadow = true; shelf.add(mesh);
    }
    scene.add(shelf);
    wallGroups.push({ full: instances(matrices), low: instances(lowMatrices), shelf, normal });
  }
  function landmark(o, castle) {
    const group = new THREE.Group(); group.position.copy(o.anchor); group.rotation.y = o.yaw; scene.add(group); o.group = group;
    box(group, 1.4, 5.5, 3, -3.4, 2.75, 0, materials.frame, true);
    box(group, 1.4, 5.5, 3, 3.4, 2.75, 0, materials.frame, true);
    box(group, 8.2, 1.3, 3, 0, 4.85, 0, materials.frame, true);
    if (castle) {
      // Roofless blockout keeps the goal visible from above; the gate still faces the arena.
      box(group, 8, 0.3, 7, 0, 0.15, -2, materials.gate);
      box(group, 1.1, 3.5, 7, -3.5, 1.75, -2, materials.wall, true);
      box(group, 1.1, 3.5, 7, 3.5, 1.75, -2, materials.wall, true);
      box(group, 8, 3.5, 1, 0, 1.75, -5, materials.wall, true);
      for (let x = -2.4; x <= 2.4; x += .8) box(group, .12, 3.4, .15, x, 1.9, .1, materials.gate, true);
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(1.5), materials.crystal);
      core.scale.set(.7, 1.65, .7); core.position.set(0, 2.5, -3); core.castShadow = true; group.add(core);
    } else {
      box(group, 1.3, 4, 8, -3.4, 2, -4.5, materials.wall, true);
      box(group, 1.3, 4, 8, 3.4, 2, -4.5, materials.wall, true);
      box(group, 5.5, 4, .25, 0, 2, -8, materials.dark, true);
    }
    for (const x of [-3.4, 3.4]) {
      box(group, .4, .7, .4, x, 2.2, 1.75, materials.lamp);
      const lamp = new THREE.PointLight('#ffc16b', 10, 8, 2); lamp.position.set(x, 2.5, 2); group.add(lamp);
    }
  }
  landmark(openings[0], false); landmark(openings[1], true);
  const overlays = new THREE.Group(); scene.add(overlays); overlays.visible = false;
  for (const lane of lanes) {
    const length = lane.start.distanceTo(lane.end), center = lane.start.clone().add(lane.end).multiplyScalar(.5);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(lane.width, length), new THREE.MeshBasicMaterial({ color: '#dbe4eb', transparent: true, opacity: .22, depthWrite: false, side: THREE.DoubleSide }));
    plane.rotation.set(-Math.PI / 2, 0, -Math.atan2(lane.end.x - lane.start.x, lane.end.z - lane.start.z));
    plane.position.set(center.x, .07, center.z); overlays.add(plane);
  }
  function sprite(label, position, scale = 2.6) {
    const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#f4f3ef'; ctx.beginPath(); ctx.arc(64,64,52,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#303a43'; ctx.lineWidth = 7; ctx.stroke(); ctx.fillStyle = '#25282c'; ctx.font = 'bold 60px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label,64,66);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false })); marker.position.copy(position).add(new THREE.Vector3(0,.4,0)); marker.scale.set(scale,scale,1); marker.renderOrder = 10; scene.add(marker);
  }
  markerCells.forEach((cell, i) => sprite(i === 0 ? 'S' : i === markerCells.length - 1 ? 'E' : String(i), cellPosition(cell)));
  scene.updateMatrixWorld(true);
  const boxes = solids.map((mesh) => { const b = new THREE.Box3().setFromObject(mesh); return { minX:b.min.x,maxX:b.max.x,minZ:b.min.z,maxZ:b.max.z,minY:b.min.y,maxY:b.max.y }; });
  boxes.push(...rockBoxes);
  // shortcut: sampled clearance excludes the intended gate, certify full creature bounds during gameplay integration.
  let samples = 0;
  for (const lane of lanes) {
    const dir = lane.end.clone().sub(lane.start).normalize(), perp = new THREE.Vector3(-dir.z,0,dir.x), length = lane.start.distanceTo(lane.end) - 1.8;
    for (let s = 0; s <= length; s += .4) for (const offset of [-1.1, 0, 1.1]) {
      const point = lane.start.clone().addScaledVector(dir,s).addScaledVector(perp,offset);
      assert(!boxes.some((b) => b.minY < 2.3 && b.maxY > .1 && point.x > b.minX && point.x < b.maxX && point.z > b.minZ && point.z < b.maxZ), 'Approach obstructed at '+point.x.toFixed(2)+','+point.z.toFixed(2)); samples++;
    }
  }
  assert(lanes.every((lane) => lane.start.y === 0 && lane.end.y === 0), 'Approaches must remain on the chamber floor.');
  function update() {
    const direction = camera.position.clone().sub(controls.target); direction.y = 0; direction.normalize();
    for (const group of wallGroups) {
      const hide = mode !== 'top' && $('cutaway').checked && group.normal.dot(direction) > .2;
      group.full.visible = !hide; group.low.visible = hide; group.shelf.visible = !hide;
    }
    assert(openings.every((o) => o.group.rotation.y === o.yaw && o.group.position.equals(o.anchor)), 'Embedded opening moved with the camera.');
    const yaw = Math.round(THREE.MathUtils.radToDeg(controls.getAzimuthalAngle()));
    status.textContent = `Clear approaches (${samples} samples) · Embedded openings fixed · ${mode === 'top' ? 'Top' : 'Isometric'} ${yaw}° · ${locked ? 'Angle locked' : 'Rotate mode'}`;
    renderer.render(scene, camera);
  }
  function setCamera(azimuth, reset = false) {
    const polar = mode === 'top' ? .0001 : isoPolar;
    controls.minPolarAngle = polar; controls.maxPolarAngle = polar;
    if (reset) { controls.target.set(0,2.5,0); camera.zoom = 1; }
    camera.position.copy(controls.target).add(new THREE.Vector3(Math.sin(polar)*Math.sin(azimuth),Math.cos(polar),Math.sin(polar)*Math.cos(azimuth)).multiplyScalar(100));
    camera.updateProjectionMatrix(); controls.update(); update();
  }
  function resize() {
    const rect = $('viewport').getBoundingClientRect(), aspect = rect.width / Math.max(rect.height,1), span = Math.max(mode === 'top' ? 80 : 70, 68 / aspect);
    camera.left = -span*aspect/2; camera.right = span*aspect/2; camera.top = span/2; camera.bottom = -span/2; camera.updateProjectionMatrix();
    renderer.setSize(rect.width,rect.height); update();
  }
  controls.addEventListener('change',update);
  $('iso').onclick = () => { if (mode === 'iso') return; const angle=controls.getAzimuthalAngle()+Math.PI/4; mode='iso'; $('iso').setAttribute('aria-pressed','true'); $('top').setAttribute('aria-pressed','false'); setCamera(angle); resize(); };
  $('top').onclick = () => { if (mode === 'top') return; const angle=controls.getAzimuthalAngle()-Math.PI/4; mode='top'; $('iso').setAttribute('aria-pressed','false'); $('top').setAttribute('aria-pressed','true'); setCamera(angle); resize(); };
  $('left').onclick = () => setCamera(controls.getAzimuthalAngle()-Math.PI/2);
  $('right').onclick = () => setCamera(controls.getAzimuthalAngle()+Math.PI/2);
  $('lock').onclick = () => { locked=!locked; controls.enableRotate=!locked; controls.mouseButtons.LEFT=locked?THREE.MOUSE.PAN:THREE.MOUSE.ROTATE; controls.touches.ONE=locked?THREE.TOUCH.PAN:THREE.TOUCH.ROTATE; $('lock').textContent=locked?'Angle locked':'Rotation unlocked'; $('lock').setAttribute('aria-pressed',String(locked)); update(); };
  $('reset').onclick = () => setCamera(mode === 'top' ? 0 : Math.PI/4,true);
  $('cutaway').onchange = update;
  $('clearance').onchange = () => { overlays.visible=$('clearance').checked; update(); };
  setCamera(Math.PI/4,true); new ResizeObserver(resize).observe($('viewport')); resize();
}
main().catch((error) => { status.dataset.failed='true'; status.textContent='Preview unavailable: '+error.message; console.error(error); });
