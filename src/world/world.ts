import * as THREE from 'three';
import type { Board, Cell } from '../sim/board';
import type { Game } from '../sim/game';
import { TICK_HZ } from '../sim/game';
import { createEnvironment } from './environment';
import { createPieces } from './pieces';
import { azimuth, elevation, frame, toCell, toScene, type Rect, type ViewState } from './view';

// Draws the board and owns the orthographic camera. Reads sim state, never changes it.

const PALETTE = {
  // Deep cave rock beyond the voxel chamber.
  backdrop: '#2B2F34',
  cellA: '#C7CAC9',
  cellB: '#BCC2C2',
  noBuild: '#A7AEB1',
  waypoint: '#E3E1D8',
  slab: '#8A939B',
  selected: '#3C454C',
  selectedEdge: '#F4F3EF',
  focus: '#164FAD',
};
const TRANSITION_MS = 250;
const CASTLE_MAX_HP = 100;
const LABELS = ['S', '1', '2', '3', '4', '5', 'E'];
const LABEL_MIN_PX = 22;

export type World = ReturnType<typeof createWorld>;

export function createWorld(board: Board, game: Game) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.setAttribute(
    'aria-label',
    'Game board. Use the arrow keys to move the cell cursor.',
  );
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.backdrop);
  const camera = new THREE.OrthographicCamera();

  scene.add(new THREE.HemisphereLight('#f6f3e9', '#56616a', 1.6));
  const sun = new THREE.DirectionalLight('#fff1da', 1.8);
  sun.position.set(-12, 30, 18);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -27, right: 27, top: 27, bottom: -27, far: 80 });
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  // Ground: one mesh of per-cell quads coloured by cell kind.
  const n = board.size;
  const pos: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  for (let y = 1; y <= n; y++)
    for (let x = 1; x <= n; x++) {
      const kind = board.kind({ x, y });
      c.set(
        kind === 'no-build'
          ? PALETTE.noBuild
          : kind === 'waypoint'
            ? PALETTE.waypoint
            : (x + y) % 2
              ? PALETTE.cellB
              : PALETTE.cellA,
      );
      const { x: sx, z: sz } = toScene({ x, y });
      const [x0, x1, z0, z1] = [sx - 0.5, sx + 0.5, sz - 0.5, sz + 0.5];
      pos.push(x0, 0, z0, x0, 0, z1, x1, 0, z1, x0, 0, z0, x1, 0, z1, x1, 0, z0);
      for (let i = 0; i < 6; i++) col.push(c.r, c.g, c.b);
    }
  const groundGeometry = new THREE.BufferGeometry();
  groundGeometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  groundGeometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  groundGeometry.computeVertexNormals();
  const ground = new THREE.Mesh(
    groundGeometry,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
  );
  ground.receiveShadow = true;
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(n + 0.6, 0.3, n + 0.6),
    new THREE.MeshStandardMaterial({ color: PALETTE.slab, roughness: 1 }),
  );
  slab.position.y = -0.17; // top 2 cm under the ground: closer z-fights
  slab.receiveShadow = true;
  scene.add(ground, slab);

  // The sunken voxel cave, its entrance above S and the crystal vault behind E (environment.ts).
  const cave = createEnvironment(scene, board.waypoints[0].cell, board.waypoints.at(-1)!.cell);

  // Stones, towers and creeps follow the sim (pieces.ts).
  const pieces = createPieces(scene, game);
  const route = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: '#164FAD', depthTest: false }),
  );
  const flyingRoute = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineDashedMaterial({
      color: '#5A3421',
      depthTest: false,
      dashSize: 0.3,
      gapSize: 0.25,
    }),
  );
  const routes = new THREE.Group().add(route, flyingRoute);
  route.renderOrder = flyingRoute.renderOrder = 5;
  routes.visible = false;
  scene.add(routes);
  let lastRoute: Cell[] | undefined;
  function syncRoute() {
    if (game.route === lastRoute) return;
    lastRoute = game.route;
    for (const [line, cells] of [
      [route, game.route],
      [flyingRoute, game.flyRoute],
    ] as const) {
      line.geometry.dispose();
      line.geometry = new THREE.BufferGeometry().setFromPoints(
        cells.map((cell) => {
          const { x, z } = toScene(cell);
          return new THREE.Vector3(x, 0.05, z);
        }),
      );
      line.computeLineDistances();
    }
  }
  let lastStep = performance.now();

  // Waypoint labels stay upright and unoccluded through every rotation.
  const labels = board.waypoints.map((w, i) => {
    const sprite = label(LABELS[i]);
    const { x, z } = toScene(w.cell);
    sprite.position.set(x, 0.75, z);
    scene.add(sprite);
    return sprite;
  });

  // Selection (filled cell, pale rim) and keyboard cursor (dashed focus ring), drawn above terrain.
  const selectedFill = new THREE.Mesh(
    new THREE.PlaneGeometry(0.92, 0.92).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: PALETTE.selected }),
  );
  selectedFill.position.y = 0.005;
  const selectedRim = rim(
    0.96,
    new THREE.LineBasicMaterial({ color: PALETTE.selectedEdge, depthTest: false }),
  );
  const cursor = rim(
    1.04,
    new THREE.LineDashedMaterial({
      color: PALETTE.focus,
      dashSize: 0.12,
      gapSize: 0.08,
      depthTest: false,
    }),
  );
  cursor.computeLineDistances();
  const selection = new THREE.Group().add(selectedFill, selectedRim);
  for (const o of [selection, cursor]) {
    o.visible = false;
    scene.add(o);
  }
  selectedRim.renderOrder = cursor.renderOrder = 10;

  // Attack range of the selected tower: a pale ring with a faint fill, drawn on the ground.
  const range = new THREE.Group().add(
    new THREE.Mesh(
      new THREE.RingGeometry(0.985, 1, 96).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: '#F4F3EF',
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      }),
    ),
    new THREE.Mesh(
      new THREE.CircleGeometry(1, 96).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: '#F4F3EF',
        transparent: true,
        opacity: 0.08,
        depthWrite: false,
      }),
    ),
  );
  range.position.y = 0.025;
  range.visible = false;
  range.renderOrder = 4;
  scene.add(range);

  // Camera state: the shown elevation/azimuth/zoom/pan ease toward the target state.
  let target: ViewState = { mode: 'iso', rotation: 0, zoom: 1, panX: 0, panZ: 0 };
  let shown = { e: elevation(target), a: azimuth(target), zoom: 1, panX: 0, panZ: 0 };
  let from = shown;
  let started = -Infinity;
  let duration = 0;
  let viewport: Rect = { x: 0, y: 0, w: 1, h: 1 };
  let panels: Rect[] = [];
  let current = frame(target, shown.e, shown.a, viewport, panels);
  let focusCells: Cell[] = [];

  function setView(next: ViewState, animate: boolean) {
    target = next;
    from = { ...shown };
    started = performance.now();
    duration = animate && !reducedMotion.matches ? TRANSITION_MS : 0;
  }

  function place(now: number) {
    const t = duration ? Math.min(1, (now - started) / duration) : 1;
    const k = t * t * (3 - 2 * t);
    const to = {
      e: elevation(target),
      a: azimuth(target),
      zoom: target.zoom,
      panX: target.panX,
      panZ: target.panZ,
    };
    shown = {
      e: from.e + (to.e - from.e) * k,
      a: from.a + (to.a - from.a) * k,
      zoom: from.zoom + (to.zoom - from.zoom) * k,
      panX: from.panX + (to.panX - from.panX) * k,
      panZ: from.panZ + (to.panZ - from.panZ) * k,
    };
    current = frame(
      { ...target, zoom: shown.zoom, panX: shown.panX, panZ: shown.panZ },
      shown.e,
      shown.a,
      viewport,
      panels,
    );
    const { d, right, up } = current.basis;
    const [r, u, dv] = [
      new THREE.Vector3(...right),
      new THREE.Vector3(...up),
      new THREE.Vector3(...d),
    ];
    camera.position
      .copy(r.multiplyScalar(current.camRight))
      .add(u.multiplyScalar(current.camUp))
      .addScaledVector(dv, 60);
    camera.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(new THREE.Vector3(...right), new THREE.Vector3(...up), dv),
    );
    const hw = viewport.w / 2 / current.scale;
    const hh = viewport.h / 2 / current.scale;
    Object.assign(camera, { left: -hw, right: hw, top: hh, bottom: -hh, near: 0.1, far: 160 });
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    for (const s of labels) s.scale.setScalar(Math.max(0.8, LABEL_MIN_PX / current.scale));
    cave.view(shown.e, shown.a);
  }

  // Fade walls between the camera and the cursor or selection (IMPLEMENTATION.md occluder rule).
  const ray = new THREE.Raycaster();
  const faded = new Map<THREE.Material, THREE.Material>();
  const fadedOf = (m: THREE.Material) => {
    let f = faded.get(m);
    if (!f)
      faded.set(
        m,
        (f = Object.assign(m.clone(), { transparent: true, opacity: 0.3, depthWrite: false })),
      );
    return f;
  };
  function updateOccluders() {
    const blockers = pieces.objects();
    const hit = new Set<THREE.Object3D>();
    const d = new THREE.Vector3(...current.basis.d);
    for (const cell of focusCells) {
      const { x, z } = toScene(cell);
      ray.set(new THREE.Vector3(x, 0.15, z), d);
      for (const i of ray.intersectObjects(blockers, true)) {
        let o: THREE.Object3D = i.object;
        while (o.parent && !blockers.includes(o)) o = o.parent;
        if (blockers.includes(o) && !(o.position.x === x && o.position.z === z)) hit.add(o);
      }
    }
    for (const s of blockers)
      s.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        o.userData.solid ??= o.material;
        o.material = hit.has(s) ? fadedOf(o.userData.solid) : o.userData.solid;
      });
  }

  let lastKey = '';
  let lastFrame = performance.now();
  renderer.setAnimationLoop((now) => {
    place(now);
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    pieces.frame(Math.min(1, (now - lastStep) * (TICK_HZ / 1000)), dt, reducedMotion.matches);
    cave.frame(dt, reducedMotion.matches);
    lastFrame = now;
    const key = `${shown.e},${shown.a},${focusCells.map((c) => `${c.x}:${c.y}`)},${pieces.version}`;
    if (key !== lastKey) updateOccluders();
    lastKey = key;
    renderer.render(scene, camera);
  });

  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hitPoint = new THREE.Vector3();

  return {
    canvas: renderer.domElement,
    setView,
    setRouteVisible(visible: boolean) {
      routes.visible = visible;
      if (visible) syncRoute();
    },
    /** Call after every sim tick so pieces follow the sim. */
    afterStep() {
      pieces.afterStep();
      const leaked = game.events.reduce((sum, e) => sum + (e.type === 'leak' ? e.damage : 0), 0);
      cave.castle(game.castleHp / CASTLE_MAX_HP, leaked);
      if (routes.visible) syncRoute();
      lastStep = performance.now();
    },
    get scale() {
      return current.scale;
    },
    /** True while a view transition runs; picks are refused until the shown projection settles. */
    get moving() {
      return performance.now() < started + duration;
    },
    resize(w: number, h: number) {
      if (viewport.w === w && viewport.h === h) return;
      viewport = { x: 0, y: 0, w, h };
      renderer.setSize(w, h);
    },
    setPanels(rects: Rect[]) {
      panels = rects;
    },
    /** Board cell under a canvas-relative CSS pixel, using the ground plane only (never mesh height). */
    pick(px: number, py: number): Cell | null {
      ndc.set((px / viewport.w) * 2 - 1, -(py / viewport.h) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      if (!ray.ray.intersectPlane(plane, hitPoint)) return null;
      const cell = toCell(hitPoint.x, hitPoint.z);
      return board.inside(cell) ? cell : null;
    },
    /** Canvas-relative CSS pixel of a cell centre and the safe area, under the target (settled) view. */
    screenOf(cell: Cell, view: ViewState = target) {
      const f = frame(view, elevation(view), azimuth(view), viewport, panels);
      const { x, z } = toScene(cell);
      const sx = f.basis.right[0] * x + f.basis.right[2] * z - f.camRight;
      const sy = f.basis.up[0] * x + f.basis.up[2] * z - f.camUp;
      return { x: viewport.w / 2 + sx * f.scale, y: viewport.h / 2 - sy * f.scale, safe: f.safe };
    },
    /** Show a tower's attack range (cells) around `cell`, or hide it with null. */
    setRange(cell: Cell | null, radius = 0) {
      range.visible = cell !== null && radius > 0;
      if (!cell) return;
      const { x, z } = toScene(cell);
      range.position.set(x, 0.025, z);
      range.scale.set(radius, 1, radius);
    },
    setMarks(selected: Cell | null, cursorCell: Cell | null) {
      for (const [o, cell] of [
        [selection, selected],
        [cursor, cursorCell],
      ] as const) {
        o.visible = cell !== null;
        if (cell) {
          const { x, z } = toScene(cell);
          o.position.set(x, 0, z);
        }
      }
      focusCells = [selected, cursorCell].filter((c): c is Cell => c !== null);
    },
  };
}

function rim(size: number, material: THREE.LineBasicMaterial | THREE.LineDashedMaterial) {
  const h = size / 2;
  const pts = [
    [-h, -h],
    [h, -h],
    [h, h],
    [-h, h],
    [-h, -h],
  ].map(([x, z]) => new THREE.Vector3(x, 0.02, z));
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), material);
}

function label(text: string) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#25282C';
  g.beginPath();
  g.arc(32, 32, 28, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#F4F3EF';
  g.lineWidth = 3;
  g.stroke();
  g.fillStyle = '#F4F3EF';
  g.font = 'bold 32px Segoe UI, Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 32, 34);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  sprite.scale.setScalar(0.8);
  sprite.renderOrder = 11;
  return sprite;
}
