import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { TowerAbility } from '../sim/abilities';
import type { HitVia } from '../sim/game';

// Combat and aura effects (issue #10). Each tower's family comes from its VPK abilities, read the
// same way the sim reads them, so a tower looks like what it does (EFFECT-IDENTITIES.md):
// - attacks fly a family projectile and land with a family impact; lightning towers strike
//   instantly; splash towers also send a ground shockwave sized to their splash radius;
// - damage over time puffs on the creep; other ability damage flashes;
// - aura and field towers draw a ground ring at their radius, coloured by what the field does,
//   with a slow pulse. Reduced motion keeps rings static and skips projectile travel.
// Effects are presentation only: sim damage never waits for them.

export type ShotStyle = 'shard' | 'frost' | 'venom' | 'heavy' | 'arrow' | 'shred' | 'bolt';
type ImpactStyle = 'ring' | 'flake' | 'puff' | 'wave' | 'shards';
export type AuraFamily = 'support' | 'burn' | 'frost' | 'shred';

const MAX_EFFECTS = 128;
const BOLT_SEGMENTS = 6;
const TRAVEL = {
  shard: 0.12,
  frost: 0.14,
  venom: 0.16,
  heavy: 0.2,
  arrow: 0.1,
  shred: 0.14,
  bolt: 0,
};
const IMPACT: Record<ImpactStyle, number> = {
  ring: 0.24,
  flake: 0.32,
  puff: 0.36,
  wave: 0.42,
  shards: 0.28,
};
const IMPACT_OF: Record<ShotStyle, ImpactStyle> = {
  shard: 'ring',
  frost: 'flake',
  venom: 'puff',
  heavy: 'ring',
  arrow: 'ring',
  shred: 'shards',
  bolt: 'ring',
};
const AURA_COLOR: Record<AuraFamily, string> = {
  // Opal-style attack speed auras are everywhere late on: grey and barely there.
  support: '#9AA0A6',
  burn: '#F0803C',
  frost: '#8FD3F4',
  shred: '#3CC8B4',
};
/** Ring, fill and pulse opacity by family. */
const AURA_OPACITY: Record<AuraFamily, [number, number, number]> = {
  support: [0.14, 0.02, 0.12],
  burn: [0.32, 0.04, 0.35],
  frost: [0.32, 0.04, 0.35],
  shred: [0.32, 0.04, 0.35],
};
const MAX_AURAS = 256;
const AURA_PERIOD = { support: 2.6, burn: 1.4, frost: 3.2, shred: 2.2 };
const FROST_TINT = new THREE.Color('#E4F6FF');
// Saturated electric blue reads on the pale board; the tower colour tints it.
const BOLT_TINT = new THREE.Color('#3D5BFF');
const BOLT_STRANDS = 2;

const LIGHTNING = new Set(['Shock', 'jn_D3_00']);

/** Projectile family: what a tower's attack visibly does, strongest identity first. */
export function shotStyle(abilities: readonly TowerAbility[]): ShotStyle {
  const has = (kind: TowerAbility['kind']) => abilities.some((a) => a.kind === kind);
  if (abilities.some((a) => a.kind === 'script' && LIGHTNING.has(a.fn))) return 'bolt';
  if (has('poison')) return 'venom';
  if (has('slow')) return 'frost';
  if (
    has('armor') ||
    abilities.some(
      (a) => a.kind === 'hit-effect' && a.properties.MODIFIER_PROPERTY_PHYSICAL_ARMOR_BONUS < 0,
    )
  )
    return 'shred';
  if (has('splash') || has('critical')) return 'heavy';
  if (has('split')) return 'arrow';
  return 'shard';
}

/** Ground rings for a tower's auras and fields, one per distinct family and radius. */
export function auraRings(abilities: readonly TowerAbility[]) {
  const rings: { family: AuraFamily; radius: number }[] = [];
  const add = (family: AuraFamily, radius: number) => {
    if (!rings.some((r) => r.family === family && Math.abs(r.radius - radius) < 1e-6))
      rings.push({ family, radius });
  };
  for (const a of abilities) {
    if (a.kind === 'aura') add('support', a.radius);
    if (a.kind !== 'field') continue;
    const p = a.properties;
    if (a.ally) add('support', a.radius);
    else if (a.damage > 0) add('burn', a.radius);
    else if (
      (p.MODIFIER_PROPERTY_PHYSICAL_ARMOR_BONUS ?? 0) < 0 ||
      (p.MODIFIER_PROPERTY_MAGICAL_RESISTANCE_BONUS ?? 0) < 0
    )
      add('shred', a.radius);
    else add('frost', a.radius);
  }
  return rings;
}

export function splashRadius(abilities: readonly TowerAbility[]) {
  return abilities.reduce((r, a) => (a.kind === 'splash' ? Math.max(r, a.radius) : r), 0);
}

type Effect = {
  shot: ShotStyle | null;
  impact: ImpactStyle;
  start: THREE.Vector3;
  end: THREE.Vector3;
  color: THREE.Color;
  age: number;
  travel: number;
  size: number;
  seed: number;
};
export type Tower = {
  id: number;
  x: number;
  z: number;
  color: string;
  abilities: readonly TowerAbility[];
};

const shotGeometry: Record<Exclude<ShotStyle, 'bolt'>, () => THREE.BufferGeometry> = {
  shard: () => new THREE.OctahedronGeometry(0.17),
  frost: () => new THREE.ConeGeometry(0.1, 0.46, 6).rotateX(Math.PI / 2),
  venom: () => new THREE.SphereGeometry(0.15, 10, 8),
  heavy: () => new THREE.IcosahedronGeometry(0.25),
  arrow: () => new THREE.BoxGeometry(0.06, 0.06, 0.56),
  shred: () => new THREE.OctahedronGeometry(0.26).scale(1, 0.3, 1),
};
const impactGeometry: Record<ImpactStyle, () => THREE.BufferGeometry> = {
  ring: () => new THREE.RingGeometry(0.7, 1, 16).rotateX(-Math.PI / 2),
  // Six-spoke snowflake lying flat.
  flake: () =>
    mergeGeometries(
      [0, 1, 2].map((i) => new THREE.BoxGeometry(1, 0.04, 0.12).rotateY((i * Math.PI) / 3)),
    ),
  puff: () => new THREE.IcosahedronGeometry(0.5, 1),
  wave: () => new THREE.RingGeometry(0.92, 1, 40).rotateX(-Math.PI / 2),
  // Four splinters pointing out from the hit.
  shards: () =>
    mergeGeometries(
      [0, 1, 2, 3].map((i) =>
        new THREE.ConeGeometry(0.12, 0.6, 4)
          .rotateZ(-Math.PI / 2)
          .translate(0.45, 0, 0)
          .rotateY((i * Math.PI) / 2 + Math.PI / 4),
      ),
    ),
};

function instanced(geometry: THREE.BufferGeometry, material: THREE.Material, name: string) {
  const mesh = new THREE.InstancedMesh(geometry, material, MAX_EFFECTS);
  mesh.name = name;
  mesh.count = 0;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false; // instances move independently of the mesh origin
  return mesh;
}

export function createEffects(scene: THREE.Scene) {
  const effects: Effect[] = [];
  // Fixed instance buffers per style keep dense volleys bounded without per-frame allocations.
  // The default shard and ring keep their original names (tests and tools look them up).
  const shots = Object.fromEntries(
    Object.entries(shotGeometry).map(([style, make]) => [
      style,
      instanced(
        make(),
        new THREE.MeshBasicMaterial(),
        style === 'shard' ? 'combat-projectiles' : `combat-projectiles-${style}`,
      ),
    ]),
  ) as Record<Exclude<ShotStyle, 'bolt'>, THREE.InstancedMesh>;
  const impacts = Object.fromEntries(
    Object.entries(impactGeometry).map(([style, make]) => [
      style,
      instanced(
        make(),
        new THREE.MeshBasicMaterial({
          side: THREE.DoubleSide,
          transparent: true,
          opacity: style === 'wave' ? 0.4 : 0.75,
          depthWrite: false,
        }),
        style === 'ring' ? 'combat-impacts' : `combat-impacts-${style}`,
      ),
    ]),
  ) as Record<ImpactStyle, THREE.InstancedMesh>;
  impacts.wave.renderOrder = 2;
  for (const mesh of [...Object.values(shots), ...Object.values(impacts)]) scene.add(mesh);

  // Lightning: a zigzag line per strike, from one preallocated buffer.
  const boltPositions = new Float32Array(MAX_EFFECTS * BOLT_STRANDS * BOLT_SEGMENTS * 2 * 3);
  const boltColors = new Float32Array(boltPositions.length);
  const boltGeometry = new THREE.BufferGeometry();
  boltGeometry.setAttribute('position', new THREE.BufferAttribute(boltPositions, 3));
  boltGeometry.setAttribute('color', new THREE.BufferAttribute(boltColors, 3));
  const bolts = new THREE.LineSegments(
    boltGeometry,
    new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false }),
  );
  bolts.name = 'combat-bolts';
  bolts.frustumCulled = false;
  bolts.renderOrder = 6;
  scene.add(bolts);

  // Aura rings: a faint fill, a rim and a travelling pulse per ring, all instanced by family
  // (three draws per family in use), rebuilt when the towers change.
  const auraGroup = new THREE.Group();
  auraGroup.name = 'tower-auras';
  scene.add(auraGroup);
  const ringGeometry = new THREE.RingGeometry(0.96, 1, 64).rotateX(-Math.PI / 2);
  const discGeometry = new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2);
  const pulseGeometry = new THREE.RingGeometry(0.97, 1, 48).rotateX(-Math.PI / 2);
  const auraLayer = (geometry: THREE.BufferGeometry, family: AuraFamily, layer: number) => {
    const mesh = new THREE.InstancedMesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: AURA_COLOR[family],
        transparent: true,
        opacity: AURA_OPACITY[family][layer],
        depthWrite: false,
      }),
      MAX_AURAS,
    );
    mesh.count = 0;
    mesh.visible = false;
    mesh.renderOrder = 1;
    mesh.frustumCulled = false;
    auraGroup.add(mesh);
    return mesh;
  };
  const FAMILIES: AuraFamily[] = ['support', 'burn', 'frost', 'shred'];
  const layers = Object.fromEntries(
    FAMILIES.map((f) => [
      f,
      {
        ring: auraLayer(ringGeometry, f, 0),
        disc: auraLayer(discGeometry, f, 1),
        pulse: auraLayer(pulseGeometry, f, 2),
      },
    ]),
  ) as unknown as Record<
    AuraFamily,
    { ring: THREE.InstancedMesh; disc: THREE.InstancedMesh; pulse: THREE.InstancedMesh }
  >;
  let auras: {
    x: number;
    z: number;
    family: AuraFamily;
    radius: number;
    phase: number;
    slot: number;
  }[] = [];
  let auraKey = '';
  const auraPose = new THREE.Matrix4();
  const auraAt = new THREE.Vector3();
  const auraScale = new THREE.Vector3();
  const flat = new THREE.Quaternion();
  let clock = 0;

  const pose = new THREE.Object3D();
  const look = new THREE.Vector3();
  let seed = 0;

  function push(e: Omit<Effect, 'age' | 'seed'>) {
    if (effects.length === MAX_EFFECTS) effects.shift();
    effects.push({ ...e, age: 0, seed: seed++ });
  }

  return {
    /** One damage event: `start` is the tower head, `end` the creep's hit point. */
    hit(via: HitVia, tower: Tower, start: THREE.Vector3, end: THREE.Vector3, lethal: boolean) {
      const color = new THREE.Color(tower.color);
      const style = shotStyle(tower.abilities);
      if (via === 'attack' || via === 'split') {
        if (style === 'frost') color.lerp(FROST_TINT, 0.35);
        push({
          shot: style,
          impact: IMPACT_OF[style],
          start,
          end,
          color,
          travel: TRAVEL[style],
          size: lethal ? 1.6 : 1,
        });
        const splash = via === 'attack' ? splashRadius(tower.abilities) : 0;
        if (splash)
          push({
            shot: null,
            impact: 'wave',
            start: end,
            end: new THREE.Vector3(end.x, 0.04, end.z),
            color,
            travel: TRAVEL.heavy,
            size: splash,
          });
      } else if (via === 'dot')
        push({ shot: null, impact: 'puff', start: end, end, color, travel: 0, size: 0.45 });
      else if (via === 'effect')
        push({ shot: null, impact: 'ring', start: end, end, color, travel: 0, size: 0.6 });
      // Splash victims are covered by the shockwave.
    },

    /** Rebuild aura rings when the set of towers changes. */
    setTowers(towers: Tower[]) {
      const key = towers.map((t) => `${t.id}:${t.x}:${t.z}:${t.color}`).join();
      if (key === auraKey) return;
      auraKey = key;
      auras = [];
      const used: Record<AuraFamily, number> = { support: 0, burn: 0, frost: 0, shred: 0 };
      for (const t of towers)
        for (const { family, radius } of auraRings(t.abilities)) {
          const slot = used[family]++;
          if (slot >= MAX_AURAS) continue;
          auras.push({ x: t.x, z: t.z, family, radius, phase: (t.id * 0.37) % 1, slot });
          const { ring, disc } = layers[family];
          ring.setMatrixAt(
            slot,
            auraPose.compose(auraAt.set(t.x, 0.016, t.z), flat, auraScale.setScalar(radius)),
          );
          disc.setMatrixAt(
            slot,
            auraPose.compose(auraAt.set(t.x, 0.012, t.z), flat, auraScale.setScalar(radius)),
          );
        }
      for (const f of FAMILIES)
        for (const mesh of Object.values(layers[f])) {
          mesh.count = Math.min(MAX_AURAS, used[f]);
          mesh.visible = mesh.count > 0;
          mesh.instanceMatrix.needsUpdate = true;
        }
    },

    /** Show or hide every aura ring. */
    setAurasVisible(visible: boolean) {
      auraGroup.visible = visible;
    },

    get auraCount() {
      return auras.length;
    },

    frame(dt: number, reducedMotion: boolean) {
      clock += dt;
      // Pulses: support and burn radiate outward; frost and shred draw inward toward the tower.
      if (auraGroup.visible)
        for (const a of auras) {
          const pulse = layers[a.family].pulse;
          const t = reducedMotion ? 0 : (clock / AURA_PERIOD[a.family] + a.phase) % 1;
          const k = a.family === 'frost' || a.family === 'shred' ? 1 - t : t;
          const size = reducedMotion
            ? 0
            : a.radius * (0.15 + 0.85 * k) * Math.min(1, Math.sin(Math.PI * t) * 3);
          pulse.setMatrixAt(
            a.slot,
            auraPose.compose(auraAt.set(a.x, 0.02, a.z), flat, auraScale.setScalar(size)),
          );
        }
      for (const f of FAMILIES) layers[f].pulse.instanceMatrix.needsUpdate = true;

      const counts = new Map<THREE.InstancedMesh, number>();
      const put = (mesh: THREE.InstancedMesh, color: THREE.Color) => {
        const n = counts.get(mesh) ?? 0;
        if (n >= MAX_EFFECTS) return;
        pose.updateMatrix();
        mesh.setMatrixAt(n, pose.matrix);
        mesh.setColorAt(n, color);
        counts.set(mesh, n + 1);
      };
      let boltCount = 0;
      for (let i = effects.length - 1; i >= 0; i--) {
        const f = effects[i];
        f.age += dt;
        const life = f.travel + IMPACT[f.impact];
        if (f.age >= life) {
          effects.splice(i, 1);
          continue;
        }
        pose.rotation.set(0, 0, 0);
        pose.scale.setScalar(1);
        if (f.shot === 'bolt' && f.age < 0.12 && !reducedMotion) {
          writeBolt(boltCount++, f);
        }
        if (f.shot && f.shot !== 'bolt' && f.age < f.travel && !reducedMotion) {
          const t = f.age / f.travel;
          pose.position.lerpVectors(f.start, f.end, t);
          if (f.shot === 'heavy') pose.position.y += Math.sin(Math.PI * t) * 0.5;
          if (f.shot === 'frost' || f.shot === 'arrow') {
            pose.lookAt(look.copy(f.end));
          } else pose.rotation.set(0, f.age * (f.shot === 'shred' ? 40 : 12), 0);
          put(shots[f.shot], f.color);
          continue;
        }
        if (f.age < f.travel && !reducedMotion) continue; // ground waves wait for the shell to land
        const t = reducedMotion ? 0.4 : Math.max(0, (f.age - f.travel) / IMPACT[f.impact]);
        pose.position.copy(f.end);
        const fade = 1 - t;
        switch (f.impact) {
          case 'ring':
            pose.scale.setScalar(reducedMotion ? 0.22 : (0.2 + t * 0.65 * f.size) * fade);
            break;
          case 'flake':
            pose.rotation.set(0, t * 1.2, 0);
            pose.scale.setScalar((0.45 + t * 0.4) * f.size * fade);
            break;
          case 'puff':
            pose.position.y += reducedMotion ? 0 : t * 0.3;
            pose.scale.setScalar((0.3 + t * 0.55) * f.size * fade);
            break;
          case 'wave':
            pose.scale.setScalar(f.size * (reducedMotion ? 1 : 0.2 + 0.8 * t));
            break;
          case 'shards':
            pose.rotation.set(0, (f.seed % 4) * 0.4, 0);
            pose.scale.setScalar((0.45 + t * 0.7) * f.size * fade);
            break;
        }
        put(impacts[f.impact], f.color);
      }
      for (const mesh of [...Object.values(shots), ...Object.values(impacts)]) {
        mesh.count = counts.get(mesh) ?? 0;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
      boltGeometry.setDrawRange(0, boltCount * BOLT_STRANDS * BOLT_SEGMENTS * 2);
      boltGeometry.attributes.position.needsUpdate = true;
      boltGeometry.attributes.color.needsUpdate = true;
    },
  };

  /** Zigzag strands from tower to target; the jitter re-rolls each frame so the strike crackles. */
  function writeBolt(n: number, f: Effect) {
    const color = f.color.clone().lerp(BOLT_TINT, 0.7);
    for (let strand = 0; strand < BOLT_STRANDS; strand++) {
      let prev = f.start.clone();
      for (let s = 1; s <= BOLT_SEGMENTS; s++) {
        const next = new THREE.Vector3().lerpVectors(f.start, f.end, s / BOLT_SEGMENTS);
        if (s < BOLT_SEGMENTS) {
          const j = 0.22;
          next.x += (Math.random() - 0.5) * j;
          next.y += (Math.random() - 0.5) * j;
          next.z += (Math.random() - 0.5) * j;
        }
        const o = ((n * BOLT_STRANDS + strand) * BOLT_SEGMENTS + s - 1) * 2 * 3;
        boltPositions.set([prev.x, prev.y, prev.z, next.x, next.y, next.z], o);
        boltColors.set([color.r, color.g, color.b, color.r, color.g, color.b], o);
        prev = next;
      }
    }
  }
}
