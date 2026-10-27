import * as THREE from "three";
import { GEM_TYPES, SPECIAL_TOWERS } from "./models.js";
import { COMBINED_TOWERS } from "./combined-towers.js";

const catalog = new Map(
  [...GEM_TYPES, ...SPECIAL_TOWERS, ...COMBINED_TOWERS].map((s) => [s.id, s]),
);
const frost = new Set(["B", "Q", "yellow-sapphire"]);
const embers = new Set(["R", "ruby"]);
const venom = new Set(["G", "jade", "paraiba", "uranium"]);

// One shared draw call and eight small motes per tower, without lights or shadow passes.
export function createTowerParticles(towers, { pixelRatio = 1 } = {}) {
  const perTower = 8;
  const position = new Float32Array(towers.length * perTower * 3);
  const color = new Float32Array(position.length);
  const alpha = new Float32Array(towers.length * perTower);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(position, 3).setUsage(THREE.DynamicDrawUsage),
  );
  geometry.setAttribute(
    "color",
    new THREE.BufferAttribute(color, 3).setUsage(THREE.DynamicDrawUsage),
  );
  geometry.setAttribute(
    "alpha",
    new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage),
  );
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { pointSize: { value: 4 * pixelRatio } },
    vertexShader: `attribute vec3 color;
      attribute float alpha;
      uniform float pointSize;
      varying vec3 tint;
      varying float opacity;
      void main() {
        tint = color; opacity = alpha;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = pointSize;
      }`,
    fragmentShader: `varying vec3 tint;
      varying float opacity;
      void main() {
        vec2 p = abs(gl_PointCoord - 0.5);
        if (p.x + p.y > 0.5) discard;
        gl_FragColor = vec4(tint, opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const points = new THREE.Points(geometry, material);
  points.name = "Ambient tower motes";
  points.frustumCulled = false;
  const bounds = new THREE.Box3();
  const origin = new THREE.Vector3();
  const emitters = towers.map((tower) => {
    const spec = catalog.get(tower.userData.towerType);
    const kind = spec?.shape ?? spec?.id;
    tower.updateWorldMatrix(true, true);
    tower.getWorldPosition(origin);
    bounds.setFromObject(tower);
    return {
      tower,
      height: bounds.max.y - origin.y,
      color: new THREE.Color(
        frost.has(kind)
          ? "#bce8f4"
          : embers.has(kind)
            ? "#ffc16e"
            : venom.has(kind)
              ? "#95dba0"
              : (spec?.color ?? "#dbe7ed"),
      ),
      mode: frost.has(kind)
        ? "frost"
        : embers.has(kind)
          ? "ember"
          : venom.has(kind)
            ? "venom"
            : "orbit",
    };
  });
  function update(seconds) {
    let count = 0;
    if (points.visible)
      for (let i = 0; i < emitters.length; i++) {
        const e = emitters[i];
        let visible = true;
        for (let ancestor = e.tower; ancestor; ancestor = ancestor.parent)
          if (!ancestor.visible) {
            visible = false;
            break;
          }
        if (!visible) continue;
        e.tower.getWorldPosition(origin);
        for (let j = 0; j < perTower; j++) {
          const phase = (j / perTower + i * 0.618 + seconds * 0.16) % 1;
          const angle =
            j * 2.4 + i + seconds * (e.mode === "orbit" ? 0.65 : 0.25);
          const radius = e.mode === "orbit" ? 0.3 : 0.18 + phase * 0.13;
          const offset = count * 3;
          position[offset] = origin.x + Math.cos(angle) * radius;
          position[offset + 2] = origin.z + Math.sin(angle) * radius;
          position[offset + 1] =
            origin.y +
            e.height -
            0.18 +
            (e.mode === "frost"
              ? (1 - phase) * 0.4
              : e.mode === "orbit"
                ? 0.06 * Math.sin(angle * 2)
                : phase * 0.4);
          color[offset] = e.color.r;
          color[offset + 1] = e.color.g;
          color[offset + 2] = e.color.b;
          alpha[count++] = Math.sin(Math.PI * phase) * 0.65;
        }
      }
    geometry.setDrawRange(0, count);
    for (const attribute of Object.values(geometry.attributes))
      attribute.needsUpdate = true;
  }
  update(0);
  return {
    points,
    update,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
