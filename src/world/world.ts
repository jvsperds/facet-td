import * as THREE from 'three';
import type { Board, Cell } from '../sim/board';
import type { Game } from '../sim/game';
import { TICK_HZ } from '../sim/game';
import { createEnvironment } from './environment';
import { createPieces } from './pieces';
import { TURRET_TOP } from './walls';
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
  // Adaptive resolution: start sharp, and if frames run long (a weak GPU at a high pixel ratio),
  // step the pixel ratio down until 60 fps holds; step back up when there is headroom again.
  const sharpest = Math.min(devicePixelRatio, 2);
  let pixelRatio = sharpest;
  renderer.setPixelRatio(pixelRatio);
  let slowMs = 0;
  let fastMs = 0;
  let sampleMs = 0;
  const adapt = (frameMs: number) => {
    if (frameMs > 250) return; // a hidden tab or a stall, not the steady frame rate
    sampleMs += frameMs;
    if (frameMs > 19) slowMs += frameMs;
    else if (frameMs < 15) fastMs += frameMs;
    if (sampleMs < 1500) return;
    const next =
      slowMs > sampleMs * 0.4
        ? Math.max(0.75, pixelRatio - 0.25)
        : fastMs > sampleMs * 0.95
          ? Math.min(sharpest, pixelRatio + 0.25)
          : pixelRatio;
    if (next !== pixelRatio) {
      pixelRatio = next;
      renderer.setPixelRatio(pixelRatio);
    }
    sampleMs = slowMs = fastMs = 0;
  };
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // Everything that casts a shadow is static (walls, towers, the vault), so the shadow map is only
  // redrawn when the board changes, not every frame. Creeps paint their own shadow discs.
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
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
  const pieces = createPieces(scene, game, cave.tunnel);
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

  // Row and column guides through the highlighted cell: faint gold strips across the board that fade
  // over the five cells nearest each edge, so the axis reads without boxing the board in.
  const guideStrip = (alongX: boolean) => {
    const pos: number[] = [];
    const col: number[] = [];
    for (let i = 1; i <= n; i++) {
      const edge = Math.min(i - 1, n - i);
      const alpha = 0.26 * (edge >= 5 ? 1 : (edge + 1) / 6);
      // Along x: scene x = i - 19 on the row's line; along z: scene z = 19 - i on the column's.
      const [a, b] = alongX ? [i - 19.5, i - 18.5] : [18.5 - i, 19.5 - i];
      const quad = alongX
        ? [a, -0.5, a, 0.5, b, 0.5, a, -0.5, b, 0.5, b, -0.5]
        : [-0.5, a, -0.5, b, 0.5, b, -0.5, a, 0.5, b, 0.5, a];
      for (let k = 0; k < 12; k += 2) {
        pos.push(quad[k], 0, quad[k + 1]);
        col.push(0.98, 0.84, 0.45, alpha); // pale crystal gold
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    const m = new THREE.Mesh(
      g,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    m.position.y = 0.012;
    m.visible = false;
    scene.add(m);
    return m;
  };
  const guideRow = guideStrip(true);
  const guideColumn = guideStrip(false);

  // Highlights: a pulsing ring under towers that can combine (gold) or that keep as a better gem
  // or belong to a pinned recipe (blue).
  const HIGHLIGHTS = 48;
  const glowRing = (color: string) => {
    const mesh = new THREE.InstancedMesh(
      new THREE.RingGeometry(0.42, 0.56, 8, 1, Math.PI / 8).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false }),
      HIGHLIGHTS,
    );
    mesh.count = 0;
    mesh.renderOrder = 9;
    scene.add(mesh);
    return mesh;
  };
  const combineRings = glowRing('#F2B84B');
  const betterRings = glowRing('#6FB7FF');
  const ringPose = new THREE.Matrix4();
  // The last wave's MVP: two red arcs that circle its tower until the next wave starts (Dota's
  // MVP swirl). Drawn over the walls so the tower reads from any angle.
  const mvpRing = new THREE.Group();
  for (const start of [0, Math.PI]) {
    const arc = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.6, 24, 1, start, Math.PI * 0.7).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#E2453C', transparent: true, depthTest: false }),
    );
    arc.renderOrder = 10;
    mvpRing.add(arc);
  }
  mvpRing.visible = false;
  scene.add(mvpRing);

  // The selected creep: a gold ring that follows it.
  const creepRing = new THREE.Group().add(
    new THREE.Mesh(
      new THREE.RingGeometry(0.33, 0.47, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#E8C86A', depthTest: false, transparent: true }),
    ),
    // A dark outline keeps it readable on the pale floor.
    new THREE.Mesh(
      new THREE.RingGeometry(0.47, 0.55, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#202429', depthTest: false, transparent: true }),
    ),
  );
  creepRing.children.forEach((m) => (m.renderOrder = 11));
  creepRing.visible = false;
  scene.add(creepRing);
  let markedCreep: number | null = null;

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
  /** False from a setView until a frame has placed the camera at the target. */
  let settled = true;
  let viewport: Rect = { x: 0, y: 0, w: 1, h: 1 };
  let panels: Rect[] = [];
  let current = frame(target, shown.e, shown.a, viewport, panels);
  let lastAngles = { e: shown.e, a: shown.a };
  let lastTurn = -Infinity;
  let focusCells: Cell[] = [];

  function setView(next: ViewState, animate: boolean) {
    target = next;
    from = { ...shown };
    started = performance.now();
    duration = animate && !reducedMotion.matches ? TRANSITION_MS : 0;
    settled = false;
    // An instant change takes effect now, so picks never see the old projection.
    if (!duration) place(started);
  }

  function place(now: number) {
    const t = duration ? Math.min(1, (now - started) / duration) : 1;
    const k = t * t * (3 - 2 * t);
    settled = t >= 1;
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
    // The camera counts as turning during a transition or a drag, and for a moment after.
    if (shown.e !== lastAngles.e || shown.a !== lastAngles.a) {
      lastAngles = { e: shown.e, a: shown.a };
      lastTurn = now;
    }
    cave.view(shown.e, shown.a, !settled || now - lastTurn < 150);
  }

  // Fade walls between the camera and the cursor or selection (IMPLEMENTATION.md occluder rule).
  const ray = new THREE.Raycaster();
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
    pieces.fade(hit);
  }

  let lastKey = '';
  let shadowVersion = -1;
  let shadowFrames = 0;
  let lastFrame = performance.now();
  // Frame cost by stage (ms, smoothed) and the last frame's draw calls, for profiling.
  const perf = {
    place: 0,
    pieces: 0,
    cave: 0,
    occluders: 0,
    render: 0,
    calls: 0,
    triangles: 0,
    programs: 0,
  };
  const smooth = (key: keyof typeof perf, since: number) =>
    (perf[key] += (performance.now() - since - perf[key]) * 0.1);
  renderer.setAnimationLoop((now) => {
    let t = performance.now();
    place(now);
    smooth('place', t);
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    t = performance.now();
    pieces.frame(
      Math.min(1, (now - lastStep) * (TICK_HZ / 1000)),
      dt,
      reducedMotion.matches,
      camera,
    );
    smooth('pieces', t);
    t = performance.now();
    cave.frame(dt, reducedMotion.matches);
    smooth('cave', t);
    // Highlight rings breathe, so they read as "act on me" without hiding the towers.
    const breath = reducedMotion.matches ? 0.75 : 0.55 + 0.35 * Math.sin(now / 280);
    (combineRings.material as THREE.MeshBasicMaterial).opacity = breath;
    (betterRings.material as THREE.MeshBasicMaterial).opacity = breath * 0.8;
    if (mvpRing.visible && !reducedMotion.matches) mvpRing.rotation.y = now / 600;
    const marked =
      markedCreep === null ? undefined : pieces.creepPoints().find((p) => p.id === markedCreep);
    creepRing.visible = !!marked;
    if (marked) creepRing.position.set(marked.x, 0.04, marked.z);
    adapt(now - lastFrame);
    lastFrame = now;
    const key = `${shown.e},${shown.a},${focusCells.map((c) => `${c.x}:${c.y}`)},${pieces.version}`;
    t = performance.now();
    if (key !== lastKey) updateOccluders();
    smooth('occluders', t);
    lastKey = key;
    if (pieces.version !== shadowVersion || (cave.settling && ++shadowFrames % 8 === 0)) {
      shadowVersion = pieces.version;
      renderer.shadowMap.needsUpdate = true;
    }
    t = performance.now();
    renderer.render(scene, camera);
    smooth('render', t);
    perf.calls = renderer.info.render.calls;
    perf.triangles = renderer.info.render.triangles;
    perf.programs = renderer.info.programs?.length ?? 0;
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
    /**
     * True until a frame has drawn the end of the latest view change; picks are refused until the
     * shown projection settles. Measured by frames, not the clock, so slow frames cannot race it.
     */
    get moving() {
      return !settled;
    },
    resize(w: number, h: number) {
      if (viewport.w === w && viewport.h === h) return;
      viewport = { x: 0, y: 0, w, h };
      renderer.setSize(w, h);
    },
    setPanels(rects: Rect[]) {
      panels = rects;
    },
    /** Smoothed frame cost by stage (ms) and the last frame's draw calls and triangles. */
    perf,
    /** The current pixel ratio, after adaptive resolution. */
    get pixelRatio() {
      return pixelRatio;
    },
    /** The scene, for profiling tools. */
    scene,
    /** Board cell under a canvas-relative CSS pixel, using the ground plane only (never mesh height). */
    pick(px: number, py: number): Cell | null {
      ndc.set((px / viewport.w) * 2 - 1, -(py / viewport.h) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      if (!ray.ray.intersectPlane(plane, hitPoint)) return null;
      const cell = toCell(hitPoint.x, hitPoint.z);
      return board.inside(cell) ? cell : null;
    },
    /** The creep drawn under a canvas-relative CSS pixel (its body, generously), or null. */
    creepAt(px: number, py: number): number | null {
      let best: number | null = null;
      let bestD = Math.max(18, current.scale * 0.6) ** 2;
      const p = new THREE.Vector3();
      for (const c of pieces.creepPoints()) {
        // Test the body's middle, so tall creeps are picked where they are seen.
        p.set(c.x, c.height / 2, c.z).project(camera);
        const [sx, sy] = [((p.x + 1) / 2) * viewport.w, ((1 - p.y) / 2) * viewport.h];
        const d = (sx - px) ** 2 + (sy - py) ** 2;
        if (d < bestD) [bestD, best] = [d, c.id];
      }
      return best;
    },
    /** Towers to highlight: those that can combine, and those that upgrade or are pinned. */
    setHighlights(combine: Cell[], better: Cell[]) {
      for (const [mesh, cells] of [
        [combineRings, combine],
        [betterRings, better],
      ] as const) {
        mesh.count = Math.min(HIGHLIGHTS, cells.length);
        cells.slice(0, HIGHLIGHTS).forEach((c, i) => {
          const { x, z } = toScene(c);
          // On the turret's rim, where the tower rises out of the wall.
          mesh.setMatrixAt(i, ringPose.makeTranslation(x, TURRET_TOP + 0.015, z));
        });
        mesh.instanceMatrix.needsUpdate = true;
      }
    },
    /** Circle the last wave's MVP tower, or nothing. */
    setMvp(cell: Cell | null) {
      mvpRing.visible = cell !== null;
      if (!cell) return;
      const { x, z } = toScene(cell);
      mvpRing.position.set(x, TURRET_TOP + 0.03, z);
    },
    /** Show or hide the towers' aura rings. */
    setAurasVisible(visible: boolean) {
      pieces.setAurasVisible(visible);
    },
    /** Row and column guides through `cell`, or none. */
    setGuides(cell: Cell | null) {
      guideRow.visible = guideColumn.visible = cell !== null;
      if (!cell) return;
      guideRow.position.z = 19 - cell.y;
      guideColumn.position.x = cell.x - 19;
    },
    /** Ring the selected creep, or nothing. */
    markCreep(id: number | null) {
      markedCreep = id;
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
