import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { TowerAbility } from '../sim/abilities';
import type { HitVia } from '../sim/game';
import { createStrokes } from './strokes';

// Combat and aura effects (issue #10). Each tower's family comes from its VPK abilities, read the
// same way the sim reads them, so a tower looks like what it does (EFFECT-IDENTITIES.md):
// - attacks fly a family projectile and land with a family impact; lightning towers strike
//   instantly; splash towers also send a ground shockwave sized to their splash radius;
// - damage over time puffs on the creep; other ability damage flashes;
// - aura and field towers draw a ground ring at their radius, coloured by what the field does,
//   with a slow pulse. Reduced motion keeps rings static and skips projectile travel.
// - combined and special towers attack in GemTD's styles, each with its own colour: a thin line,
//   a glowing beam, a crackling zap, a writhing laguna bolt, a coiling finger, a tapering ray, or
//   a flying orb, arcing glob or cut shard with a trail that pops as a ring on the creep. Basic
//   gems keep their family projectile, now with a trail. Strokes are soft glow ribbons, all in
//   one draw call; one tower draws at most one attack per FX_GAP so fast volleys stay readable.
// Effects are presentation only: sim damage never waits for them.

export type ShotStyle = 'shard' | 'frost' | 'venom' | 'heavy' | 'arrow' | 'shred' | 'bolt';
type ImpactStyle = 'ring' | 'flake' | 'puff' | 'wave' | 'shards' | 'none';
export type AttackStyle =
  'line' | 'beam' | 'zap' | 'laguna' | 'finger' | 'orb' | 'glob' | 'shard' | 'ray';
export type AuraFamily = 'support' | 'burn' | 'frost' | 'shred';

const MAX_EFFECTS = 160;
const BOLT_SEGMENTS = 6;
/** Seconds between drawn attacks from one tower (GemTD's FX_GAP). */
const FX_GAP = 0.09;
/** Seconds on screen per attack style (GemTD's FX_LIFE at a mid tier). */
const FX_LIFE: Record<AttackStyle, number> = {
  line: 0.15,
  beam: 0.26,
  zap: 0.2,
  laguna: 0.42,
  finger: 0.47,
  orb: 0.2,
  glob: 0.28,
  shard: 0.18,
  ray: 0.3,
};
const PROJECTILE = new Set<AttackStyle>(['orb', 'glob', 'shard']);
// Every combined and special tower's attack (GemTD's ATTACK table, keyed by our tower ids).
const ATTACK: Record<string, [AttackStyle, string]> = {
  gemtd_baiyin: ['line', '#bfe4ff'], // Silver
  gemtd_baiyinqishi: ['beam', '#cfe6ff'], // Silver Knight
  gemtd_kongqueshi: ['shard', '#2f8f3a'], // Malachite
  gemtd_xianyandekongqueshi: ['shard', '#7dff7a'], // Vivid Malachite
  gemtd_xingcaihongbaoshi: ['orb', '#ff7a2a'], // Asteriated Ruby
  gemtd_yu: ['glob', '#7fe05a'], // Jade
  gemtd_furongshi: ['shard', '#ffe8d8'], // Quartz
  gemtd_heianfeicui: ['orb', '#39d98a'], // Dark Emerald
  gemtd_huangcailanbaoshi: ['line', '#ffe27a'], // Yellow Sapphire
  gemtd_palayibabixi: ['orb', '#4fe0d8'], // Paraiba Tourmaline
  gemtd_jingxindiaozhuodepalayibabixi: ['orb', '#ffb050'], // Elaborately Carved Tourmaline
  gemtd_heisemaoyanshi: ['line', '#d8e07a'], // Chrysoberyl Cat's Eye
  gemtd_jin: ['orb', '#ffd24a'], // Gold
  gemtd_aijijin: ['orb', '#ffe890'], // Egypt Gold
  gemtd_fenhongzuanshi: ['zap', '#ff9be6'], // Pink Diamond
  gemtd_juxingfenhongzuanshi: ['laguna', '#ff5fd2'], // Huge Pink Diamond
  gemtd_jixueshi: ['zap', '#ff5a4a'], // Bloodstone
  gemtd_gudaidejixueshi: ['zap', '#ff8a3a'], // Antique Bloodstone
  gemtd_you238: ['glob', '#b6ff3a'], // Uranium-238
  gemtd_you235: ['glob', '#ffe23a'], // Uranium-235
  gemtd_shuaibiankaipayou: ['ray', '#4fd8ff'], // Depleted Kyparium
  gemtd_xuehonghuoshan: ['glob', '#ff5a1a'], // Volcano
  gemtd_shenhaizhenzhu: ['orb', '#f4f0d0'], // Deepsea Pearl
  gemtd_haiyangqingyu: ['glob', '#6fa8e0'], // Grey Jade
  gemtd_jixiangdezhongguoyu: ['glob', '#ffcf40'], // Lucky Chinese Jade
  gemtd_mirendeqingjinshi: ['shard', '#b07aff'], // Charming Lazurite
  gemtd_hongshanhu: ['orb', '#ff7a5a'], // Red Coral
  gemtd_feicuimoxiang: ['glob', '#9be0b0'], // Emerald Golem
  gemtd_huaguoshanxiandan: ['shard', '#ffb040'], // Monkey King Jade
  gemtd_tianranzumulv: ['shard', '#7a6aff'], // Natural Zumurud
  gemtd_haibao: ['zap', '#9fe8ff'], // Northern Saber's Eye
  gemtd_keyinuoerguangmingzhishan: ['laguna', '#6fb4ff'], // Koh-i-noor Diamond
  gemtd_heiwangzihuangguanhongbaoshi: ['finger', '#b05aff'], // The Crown Prince
  gemtd_xingguanglanbaoshi: ['beam', '#cfe0ff'], // Star Sapphire
  gemtd_yijiazhishi: ['finger', '#ff6a8a'], // Carmen-Lucia
  gemtd_huguoshenyishi: ['ray', '#ffb020'], // Golden Jubilee
  gemtd_jingangshikulinan: ['ray', '#fff2b0'], // Diamond Cullinan
  gemtd_sililankazhixing: ['beam', '#5aa8ff'], // Sapphire Star of Adam
  gemtd_heiyaoshi: ['beam', '#ff7a3a'], // Obsidian
  gemtd_manao: ['shard', '#e0a860'], // Agate
  gemtd_xiameishi: ['zap', '#ffd040'], // Fantastic Miss Shrimp
  gemtd_ranshaozhishi: ['orb', '#6fc0ff'], // The Burning Stone
  gemtd_geluanshi: ['ray', '#fff0c0'], // Geluanshi
};
/** A combined or special tower's GemTD attack style and colour; basic gems have none. */
export const attackOf = (name: string) => ATTACK[name] ?? null;
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
  none: 0,
};
const IMPACT_OF: Record<ShotStyle, ImpactStyle> = {
  shard: 'ring',
  frost: 'flake',
  venom: 'puff',
  heavy: 'ring',
  arrow: 'ring',
  shred: 'shards',
  bolt: 'none',
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
  /** GemTD attack style, for combined and special towers. */
  style?: AttackStyle;
  /** The bright inner colour of a styled attack. */
  core?: THREE.Color;
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
  /** Tower id, for its GemTD attack style. */
  name?: string;
};

const shotGeometry: Record<Exclude<ShotStyle, 'bolt'>, () => THREE.BufferGeometry> = {
  shard: () => new THREE.OctahedronGeometry(0.17),
  frost: () => new THREE.ConeGeometry(0.1, 0.46, 6).rotateX(Math.PI / 2),
  venom: () => new THREE.SphereGeometry(0.15, 10, 8),
  heavy: () => new THREE.IcosahedronGeometry(0.25),
  arrow: () => new THREE.BoxGeometry(0.06, 0.06, 0.56),
  shred: () => new THREE.OctahedronGeometry(0.26).scale(1, 0.3, 1),
};
const impactGeometry: Record<Exclude<ImpactStyle, 'none'>, () => THREE.BufferGeometry> = {
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
  ) as Record<Exclude<ImpactStyle, 'none'>, THREE.InstancedMesh>;
  impacts.wave.renderOrder = 2;
  for (const mesh of [...Object.values(shots), ...Object.values(impacts)]) scene.add(mesh);

  // Beams, bolts, trails and flares: glow ribbons in one buffer.
  const strokes = createStrokes(scene);

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
  /** When each tower last drew an attack (effect clock). */
  const lastDrawn = new Map<number, number>();

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
        // A volley in the same tick counts as one attack.
        const last = lastDrawn.get(tower.id);
        const drawn = last === undefined || last === clock || clock - last >= FX_GAP;
        const attack = tower.name ? attackOf(tower.name) : null;
        if (drawn) lastDrawn.set(tower.id, clock);
        if (drawn && attack) {
          const [kind, hex] = attack;
          const tint = new THREE.Color(hex);
          const projectile = PROJECTILE.has(kind);
          push({
            shot: null,
            style: kind,
            core: tint.clone().lerp(WHITE, 0.55),
            // Projectiles fly for most of their life, then pop as a ring on the creep.
            impact: projectile ? 'ring' : 'none',
            start,
            end,
            color: tint,
            travel: FX_LIFE[kind] * (projectile ? 0.7 : 1),
            size: lethal ? 1.6 : 1,
          });
          if (kind === 'laguna' || kind === 'finger')
            push({
              shot: null,
              impact: 'ring',
              start: end,
              end,
              color: tint,
              travel: 0,
              size: 1.5,
            });
        } else if (drawn) {
          if (style === 'frost') color.lerp(FROST_TINT, 0.35);
          if (style === 'bolt') color.lerp(BOLT_TINT, 0.7);
          push({
            shot: style,
            impact: IMPACT_OF[style],
            start,
            end,
            color,
            core: color.clone().lerp(WHITE, 0.6),
            travel: style === 'bolt' ? 0.12 : TRAVEL[style],
            size: lethal ? 1.6 : 1,
          });
        }
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

    frame(dt: number, reducedMotion: boolean, camera?: THREE.Camera) {
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
      strokes.begin(camera);
      spare = 0;
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
        if (f.age < f.travel) {
          // Strokes flash in place (static under reduced motion). Projectiles fly, and ground
          // waves wait for the shell to land, unless motion is reduced: then only impacts show.
          if (f.shot === 'bolt' || (f.style && !PROJECTILE.has(f.style))) {
            stroke(f, reducedMotion);
            continue;
          }
          if (!reducedMotion) {
            if (f.shot || f.style) fly(f, put);
            continue;
          }
        }
        if (f.impact === 'none') continue;
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
      strokes.end();
    },

    /** Glow quads drawn this frame (tests and the perf overlay). */
    get strokeCount() {
      return strokes.count;
    },
  };

  /** Where a flying shot is at `t` (0 to 1 of its travel): globs and shells arc. */
  function along(f: Effect, t: number, out: THREE.Vector3) {
    out.lerpVectors(f.start, f.end, t);
    if (f.style === 'glob') out.y += Math.sin(Math.PI * t) * 0.8;
    else if (f.shot === 'heavy') out.y += Math.sin(Math.PI * t) * 0.5;
    return out;
  }

  /** A projectile in flight: its mesh or glow, with a fading trail behind it. */
  function fly(f: Effect, put: (mesh: THREE.InstancedMesh, color: THREE.Color) => void) {
    const t = f.age / f.travel;
    along(f, t, pose.position);
    const trail = Array.from({ length: 5 }, (_, k) =>
      along(f, Math.max(0, t - (0.32 * (4 - k)) / 4), vec()),
    );
    const tail = f.style === 'orb' ? 0.2 : f.style === 'glob' ? 0.22 : 0.12;
    strokes.line(
      trail,
      (s) => tail * s,
      f.color,
      (s) => 0.55 * s,
    );
    switch (f.style ?? f.shot) {
      case 'orb':
        strokes.dot(pose.position, 0.34, f.color, 0.6);
        strokes.dot(pose.position, 0.13, WHITE, 0.95);
        return;
      case 'glob':
        pose.scale.setScalar(1.25);
        put(shots.venom, f.color);
        strokes.dot(pose.position, 0.36, f.color, 0.45);
        return;
      case 'frost':
      case 'arrow':
        pose.lookAt(look.copy(f.end));
        break;
      default:
        if (f.style === 'shard') {
          // A cut shard flies point first, with a glint.
          pose.lookAt(look.copy(f.end));
          pose.rotateX(Math.PI / 2);
          pose.scale.set(0.8, 1.7, 0.8);
          strokes.dot(pose.position, 0.1 + 0.06 * Math.sin(f.age * 60), WHITE, 0.9);
        } else pose.rotation.set(0, f.age * (f.shot === 'shred' ? 40 : 12), 0);
    }
    put(f.style ? shots.shard : shots[f.shot as Exclude<ShotStyle, 'bolt'>], f.color);
  }

  /** Beams, bolts, lagunas, fingers and rays, from the tower head to the creep. */
  function stroke(f: Effect, reduced: boolean) {
    const t = Math.min(1, f.age / f.travel);
    const fade = 1 - t * t; // hold, then fall away
    const a = f.start;
    const b = f.end;
    const core = f.core ?? WHITE;
    const big = f.size > 1 ? 1.25 : 1;
    switch (f.style ?? 'zap') {
      case 'line':
        strokes.line([a, b], 0.22, f.color, 0.45 * fade);
        strokes.line([a, b], 0.06, core, fade);
        break;
      case 'beam':
        strokes.line([a, b], 0.46 * big, f.color, 0.3 * fade);
        strokes.line([a, b], 0.16, f.color, 0.65 * fade);
        strokes.line([a, b], 0.05, WHITE, fade);
        strokes.dot(b, 0.3 * big, core, fade);
        break;
      case 'zap': {
        const pts = jagged(f, a, b, BOLT_SEGMENTS, 0.34, reduced, 0);
        strokes.line(pts, 0.24, f.color, 0.55 * fade);
        strokes.line(pts, 0.06, core, fade);
        strokes.dot(b, 0.2 * big, core, 0.8 * fade);
        break;
      }
      case 'laguna': {
        const pts = jagged(f, a, b, 10, 0.55, reduced, 0);
        strokes.line(pts, (s) => 0.7 * (0.55 + 0.45 * s), f.color, 0.45 * fade);
        strokes.line(pts, 0.18, core, fade);
        // A fork splits off halfway and lands beside the creep.
        const off = vec().set(rand(f, 90) - 0.5, rand(f, 91) * 0.4, rand(f, 92) - 0.5);
        const fork = jagged(f, pts[5], vec().addVectors(b, off), 4, 0.3, reduced, 50);
        strokes.line(fork, 0.12, f.color, 0.7 * fade);
        strokes.line(fork, 0.04, core, fade);
        strokes.dot(b, 0.65 * big, f.color, 0.55 * fade);
        for (let k = 0; k < 3; k++) {
          const flare = vec().set(
            rand(f, 60 + k) - 0.5,
            rand(f, 70 + k) - 0.3,
            rand(f, 80 + k) - 0.5,
          );
          strokes.dot(flare.multiplyScalar(0.8).add(b), 0.22, core, 0.8 * fade);
        }
        break;
      }
      case 'finger': {
        strokes.line([a, b], 0.28, f.color, 0.45 * fade);
        strokes.line([a, b], 0.07, core, fade);
        // Two strands coil round the core, widest mid-way.
        const dir = vec().subVectors(b, a).normalize();
        const u = vec().crossVectors(dir, UP);
        if (u.lengthSq() < 1e-6) u.set(1, 0, 0);
        u.normalize();
        const v = vec().crossVectors(dir, u);
        const spin = reduced ? 0 : f.age * 22;
        for (let strand = 0; strand < 2; strand++) {
          const pts: THREE.Vector3[] = [];
          for (let k = 0; k <= 18; k++) {
            const s = k / 18;
            const angle = s * 11 + spin + strand * Math.PI;
            const r = 0.3 * Math.sin(Math.PI * s);
            pts.push(
              vec()
                .lerpVectors(a, b, s)
                .addScaledVector(u, Math.cos(angle) * r)
                .addScaledVector(v, Math.sin(angle) * r),
            );
          }
          strokes.line(pts, 0.08, core, 0.9 * fade);
        }
        strokes.dot(b, 0.75 * big, f.color, 0.5 * fade);
        strokes.dot(b, 0.24, WHITE, fade);
        break;
      }
      case 'ray':
        // A lance: broad at the tower, pointed at the creep.
        strokes.quad(a, b, 0.62 * big, 0.02, f.color, 0.35 * fade, 0.55 * fade);
        strokes.quad(a, b, 0.22, 0.0, core, fade, fade);
        strokes.dot(a, 0.32, core, 0.7 * fade);
        strokes.dot(b, 0.16, WHITE, fade);
        break;
    }
  }

  /** A jagged line from `a` to `b`: re-rolled every frame so it crackles, or fixed per strike. */
  function jagged(
    f: Effect,
    a: THREE.Vector3,
    b: THREE.Vector3,
    segments: number,
    jitter: number,
    fixed: boolean,
    salt: number,
  ) {
    const pts: THREE.Vector3[] = [];
    for (let s = 0; s <= segments; s++) {
      const p = vec().lerpVectors(a, b, s / segments);
      if (s > 0 && s < segments) {
        const r = (k: number) => (fixed ? rand(f, salt + s * 3 + k) : Math.random()) - 0.5;
        p.x += r(0) * jitter;
        p.y += r(1) * jitter;
        p.z += r(2) * jitter;
      }
      pts.push(p);
    }
    return pts;
  }

  /** Scratch vectors, reused every frame. */
  function vec() {
    if (spare === scratch.length) scratch.push(new THREE.Vector3());
    return scratch[spare++];
  }
}

const WHITE = new THREE.Color(1, 1, 1);
const UP = new THREE.Vector3(0, 1, 0);
const scratch: THREE.Vector3[] = [];
let spare = 0;

/** A stable pseudo-random number in [0, 1) for one effect, so fixed strikes keep their shape. */
function rand(f: Effect, k: number) {
  const x = Math.sin((f.seed + 1) * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
}
