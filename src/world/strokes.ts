import * as THREE from 'three';

// Glow strokes: camera-facing ribbons and dots drawn from one preallocated buffer, so
// every beam, bolt, trail and flare on screen is a single draw call. Each vertex carries its
// colour with alpha and where it sits across the ribbon; the fragment fades to the edges, which
// gives the soft glow GemTD draws with wide translucent canvas strokes.

const MAX_QUADS = 6000;

const vertexShader = /* glsl */ `
attribute vec4 rgba;
attribute vec2 st;
varying vec4 vColor;
varying vec2 vSt;
void main() {
  vColor = rgba;
  vSt = st;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const fragmentShader = /* glsl */ `
varying vec4 vColor;
varying vec2 vSt;
void main() {
  float k = clamp(1.0 - length(vSt), 0.0, 1.0);
  gl_FragColor = vec4(vColor.rgb, vColor.a * k * (2.0 - k));
  #include <colorspace_fragment>
}`;

export function createStrokes(scene: THREE.Scene) {
  const positions = new Float32Array(MAX_QUADS * 6 * 3);
  const colors = new Float32Array(MAX_QUADS * 6 * 4);
  const sts = new Float32Array(MAX_QUADS * 6 * 2);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage),
  );
  geometry.setAttribute(
    'rgba',
    new THREE.BufferAttribute(colors, 4).setUsage(THREE.DynamicDrawUsage),
  );
  geometry.setAttribute('st', new THREE.BufferAttribute(sts, 2).setUsage(THREE.DynamicDrawUsage));
  geometry.setDrawRange(0, 0);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide,
    }),
  );
  mesh.name = 'combat-strokes';
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  scene.add(mesh);

  let quads = 0;
  let drawn = 0;
  const forward = new THREE.Vector3(0, -1, 0);
  const up = new THREE.Vector3(0, 0, -1);
  const along = new THREE.Vector3();
  const side = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const d = new THREE.Vector3();
  const lo = new THREE.Vector3();
  const hi = new THREE.Vector3();
  const right = new THREE.Vector3();

  function corner(
    n: number,
    p: THREE.Vector3,
    col: THREE.Color,
    alpha: number,
    s: number,
    t: number,
  ) {
    positions[n * 3] = p.x;
    positions[n * 3 + 1] = p.y;
    positions[n * 3 + 2] = p.z;
    colors[n * 4] = col.r;
    colors[n * 4 + 1] = col.g;
    colors[n * 4 + 2] = col.b;
    colors[n * 4 + 3] = alpha;
    sts[n * 2] = s;
    sts[n * 2 + 1] = t;
  }

  /** One ribbon segment from `from` (width `wa`) to `to` (width `wb`); `cap` softens its ends. */
  function quad(
    from: THREE.Vector3,
    to: THREE.Vector3,
    wa: number,
    wb: number,
    color: THREE.Color,
    alpha: number,
    alphaB = alpha,
    cap: [number, number] = [0, 0],
    sideOverride?: THREE.Vector3,
  ) {
    if (quads >= MAX_QUADS || alpha + alphaB <= 0.004) return;
    if (sideOverride) side.copy(sideOverride);
    else {
      along.subVectors(to, from);
      side.crossVectors(along, forward);
      if (side.lengthSq() < 1e-8) side.set(1, 0, 0);
      side.normalize();
    }
    const n = quads++ * 6;
    a.copy(from).addScaledVector(side, -wa / 2);
    b.copy(from).addScaledVector(side, wa / 2);
    c.copy(to).addScaledVector(side, wb / 2);
    d.copy(to).addScaledVector(side, -wb / 2);
    corner(n, a, color, alpha, -1, cap[0]);
    corner(n + 1, b, color, alpha, 1, cap[0]);
    corner(n + 2, c, color, alphaB, 1, cap[1]);
    corner(n + 3, a, color, alpha, -1, cap[0]);
    corner(n + 4, c, color, alphaB, 1, cap[1]);
    corner(n + 5, d, color, alphaB, -1, cap[1]);
  }

  return {
    mesh,
    /** Start a frame: face the ribbons toward `camera` and clear the buffer. */
    begin(camera?: THREE.Camera) {
      quads = 0;
      if (camera) {
        camera.getWorldDirection(forward);
        up.set(0, 1, 0).applyQuaternion(camera.quaternion);
      }
    },
    quad,
    /** A ribbon through `points`; width and alpha may change along it (0 to 1). */
    line(
      points: THREE.Vector3[],
      width: number | ((s: number) => number),
      color: THREE.Color,
      alpha: number | ((s: number) => number),
    ) {
      const w = typeof width === 'number' ? () => width : width;
      const al = typeof alpha === 'number' ? () => alpha : alpha;
      const last = points.length - 1;
      for (let i = 0; i < last; i++) {
        const s0 = i / last;
        const s1 = (i + 1) / last;
        quad(points[i], points[i + 1], w(s0), w(s1), color, al(s0), al(s1));
      }
    },
    /** A round glow of radius `r` facing the camera. */
    dot(p: THREE.Vector3, r: number, color: THREE.Color, alpha: number) {
      right.crossVectors(up, forward).normalize();
      quad(
        lo.copy(p).addScaledVector(up, -r),
        hi.copy(p).addScaledVector(up, r),
        2 * r,
        2 * r,
        color,
        alpha,
        alpha,
        [-1, 1],
        right,
      );
    },
    end() {
      geometry.setDrawRange(0, quads * 6);
      if (!quads && !drawn) return;
      // Upload only the vertices in use: the whole buffer is over a megabyte.
      for (const name of ['position', 'rgba', 'st']) {
        const attribute = geometry.attributes[name] as THREE.BufferAttribute;
        attribute.clearUpdateRanges();
        attribute.addUpdateRange(0, quads * 6 * attribute.itemSize);
        attribute.needsUpdate = true;
      }
      drawn = quads;
    },
    get count() {
      return quads;
    },
  };
}
