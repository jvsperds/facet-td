import * as THREE from 'three';
import { FLY_ALTITUDE, creepSize } from '../../docs/art/model-study/models.js';
import { creepTheme, type CreepKind } from '../creep-theme';

// Six cave creatures (creep-theme.ts picks one per unit): burrower, crawler and golem walk, the
// cave bat and wisp fly, and every boss is a wyrm. All face +x and are built from boxes in units of
// the art-study creep length, staying inside its ground width so creeps clear the maze walls.
// Contract with pieces.ts: body.children[0] is a skin mesh, moving parts are `creep-limb-N` pivots,
// and every material is shared (one draw call per material once static parts are merged).

const flat = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, ...extra });

/** Rock hides by immunity: plain, armoured (steel-grey), magic-immune (violet), both. */
const skins = [
  flat('#8f8577'),
  flat('#6f7f89', { roughness: 0.7, metalness: 0.45 }),
  flat('#7a6496', { roughness: 0.8, emissive: '#251037' }),
  flat('#8f6a80', { roughness: 0.7, metalness: 0.3, emissive: '#241027' }),
];
const dark = flat('#2c2a2b', { roughness: 0.95 });
const bone = flat('#d4c29a');
const metal = flat('#bac6c6', { metalness: 0.55, roughness: 0.55 });
const violet = flat('#cf9ae9', { emissive: '#623878', roughness: 0.55 });
const membrane = flat('#4a3f44', { side: THREE.DoubleSide });
const shadowMaterial = new THREE.MeshBasicMaterial({
  color: '#1d2024',
  transparent: true,
  opacity: 0.3,
  depthWrite: false,
});

/** One crystal material per gem colour, shared by every creep of that colour. */
const crystals = new Map<string, THREE.Material>();
const crystalOf = (color: string) => {
  let m = crystals.get(color);
  if (!m) {
    m = flat(color, { emissive: color, emissiveIntensity: 0.45, roughness: 0.3, metalness: 0.1 });
    crystals.set(color, m);
  }
  return m;
};

type V3 = [number, number, number];
interface Kit {
  /** Box in creep-length units; returns the mesh. */
  box(name: string, m: THREE.Material, size: V3, at: V3, parent?: THREE.Object3D): THREE.Mesh;
  /** A moving part: a pivot at `at`, animated by animateCreep. */
  limb(at: V3): THREE.Group;
  skin: THREE.Material;
  gem: THREE.Material;
  body: THREE.Group;
}

/** Leg pivot at the hip with the leg hanging below it. */
function leg(k: Kit, at: V3, size: V3, foot?: THREE.Material) {
  const pivot = k.limb(at);
  k.box('creep-leg', k.skin, size, [0, -size[1] / 2, 0], pivot);
  if (foot)
    k.box(
      'creep-claw',
      foot,
      [size[0] * 1.3, 0.04, size[2] * 1.1],
      [size[0] * 0.2, -size[1], 0],
      pivot,
    );
}

/** A row of crystal shards; `tall` peaks in the middle of the row. */
function ridge(k: Kit, from: number, to: number, y: number, count: number, tall: number) {
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const h = 0.1 + tall * (1 - Math.abs(t - 0.5));
    const side = (i % 2) * 2 - 1;
    const s = k.box(
      'creep-shard',
      k.gem,
      [0.09, h, 0.09],
      [from + (to - from) * t, y + h / 2 - 0.02, side * 0.05],
    );
    s.rotation.set(side * 0.3, 0, (0.5 - t) * 0.5);
  }
}

function eyes(k: Kit, x: number, y: number, z: number, size = 0.05) {
  for (const side of [-1, 1]) k.box('creep-eye', k.gem, [size, size * 1.3, size], [x, y, side * z]);
}

/** Four-legged rock-plated digger: snout, tusks, back plates and a crystal ridge. Head at y≈0.42. */
function burrower(k: Kit, variant: number) {
  const hip = 0.2;
  k.box('creep-hide', k.skin, [0.66, 0.34, 0.54], [-0.06, hip + 0.16, 0]);
  k.box('creep-belly', dark, [0.6, 0.06, 0.5], [-0.06, hip, 0]);
  k.box('creep-head', k.skin, [0.28, 0.26, 0.4], [0.38, hip + 0.18, 0]);
  k.box('creep-muzzle', bone, [0.16, 0.12, 0.24], [0.56, hip + 0.12, 0]);
  k.box('creep-nose', dark, [0.05, 0.07, 0.14], [0.65, hip + 0.15, 0]);
  eyes(k, 0.5, hip + 0.26, 0.13);
  for (const side of [-1, 1]) {
    k.box(
      'creep-ear',
      k.skin,
      [0.08, 0.1 + (variant % 3) * 0.04, 0.08],
      [0.32, hip + 0.36, side * 0.15],
    );
    k.box(
      'creep-plate',
      dark,
      [0.2, 0.06, 0.2],
      [-0.24 + side * 0.08, hip + 0.35, side * 0.12],
    ).rotation.x = side * 0.4;
  }
  ridge(k, -0.36, 0.14, hip + 0.33, 3 + (variant % 2), 0.16);
  k.box('creep-tail', k.skin, [0.18, 0.08, 0.08], [-0.46, hip + 0.22, 0]).rotation.z = -0.4;
  for (const x of [0.2, -0.28])
    for (const side of [-1, 1]) leg(k, [x, hip, side * 0.2], [0.12, hip, 0.13], bone);
}

/** Six-legged geode crab: a flat dark shell broken open on top to crystals, and pincers. */
function crawler(k: Kit, variant: number) {
  const hip = 0.16;
  k.box('creep-shell', k.skin, [0.74, 0.18, 0.58], [-0.04, hip + 0.08, 0]);
  k.box('creep-rim', dark, [0.62, 0.06, 0.46], [-0.06, hip + 0.2, 0]);
  k.box('creep-geode', k.gem, [0.36, 0.06, 0.26], [-0.06, hip + 0.22, 0]);
  ridge(k, -0.2, 0.08, hip + 0.22, 3, 0.12 + (variant % 3) * 0.03);
  k.box('creep-muzzle', k.skin, [0.16, 0.12, 0.32], [0.38, hip + 0.06, 0]);
  eyes(k, 0.44, hip + 0.18, 0.1, 0.045);
  for (const side of [-1, 1]) {
    k.box('creep-arm', k.skin, [0.16, 0.06, 0.06], [0.48, hip + 0.02, side * 0.18]).rotation.y =
      side * 0.4;
    k.box('creep-pincer', bone, [0.1, 0.08, 0.08], [0.6, hip + 0.04, side * 0.2]);
    k.box('creep-pincer', bone, [0.08, 0.04, 0.06], [0.64, hip - 0.02, side * 0.16]);
  }
  for (const x of [0.22, -0.02, -0.26])
    for (const side of [-1, 1]) {
      const pivot = k.limb([x, hip, side * 0.24]);
      const l = k.box('creep-leg', dark, [0.05, 0.05, 0.12], [0, 0, side * 0.04], pivot);
      l.rotation.x = side * 0.2;
      k.box('creep-leg', dark, [0.05, hip, 0.05], [0, -hip / 2, side * 0.08], pivot);
    }
}

/** Upright boulder golem: two thick legs, a glowing ore core and heavy arms. */
function golem(k: Kit, variant: number) {
  const hip = 0.28;
  k.box('creep-torso', k.skin, [0.36, 0.4, 0.5], [0, hip + 0.22, 0]);
  k.box('creep-core', k.gem, [0.06, 0.18, 0.2], [0.18, hip + 0.24, 0]);
  k.box('creep-crack', k.gem, [0.04, 0.04, 0.3], [0.18, hip + 0.36, 0]);
  k.box('creep-head', k.skin, [0.22, 0.18, 0.24], [0.06, hip + 0.52, 0]);
  k.box('creep-brow', dark, [0.06, 0.04, 0.24], [0.18, hip + 0.57, 0]);
  eyes(k, 0.18, hip + 0.51, 0.06, 0.045);
  for (const side of [-1, 1]) {
    k.box('creep-shoulder', k.skin, [0.22, 0.16, 0.14], [0, hip + 0.4, side * 0.26]);
    k.box('creep-arm', dark, [0.12, 0.3, 0.1], [0.04, hip + 0.18, side * 0.3]);
    k.box('creep-fist', k.skin, [0.16, 0.12, 0.12], [0.06, hip + 0.02, side * 0.29]);
  }
  ridge(k, -0.12, 0.08, hip + 0.42, 2 + (variant % 2), 0.12);
  for (const side of [-1, 1]) leg(k, [0, hip, side * 0.12], [0.16, hip, 0.16]);
}

/** Cave bat: round body, tall ears, membrane wings with crystal tips. */
function bat(k: Kit, variant: number) {
  k.box('creep-body', k.skin, [0.34, 0.24, 0.28], [-0.04, 0.1, 0]);
  k.box('creep-head', k.skin, [0.22, 0.2, 0.22], [0.22, 0.16, 0]);
  k.box('creep-muzzle', dark, [0.08, 0.08, 0.1], [0.34, 0.12, 0]);
  eyes(k, 0.32, 0.2, 0.07);
  for (const side of [-1, 1]) {
    k.box('creep-ear', k.skin, [0.06, 0.18 + (variant % 3) * 0.03, 0.06], [0.2, 0.32, side * 0.07]);
    k.box('creep-fang', bone, [0.02, 0.04, 0.02], [0.37, 0.07, side * 0.03]);
  }
  k.box('creep-tail', dark, [0.14, 0.04, 0.04], [-0.26, 0.06, 0]);
  wings(k, 0.1, 0.5);
}

function wings(k: Kit, y: number, span: number) {
  for (const side of [-1, 1]) {
    const pivot = k.limb([-0.02, y, side * 0.12]);
    k.box('creep-wing', membrane, [0.36, 0.025, span], [-0.04, 0, side * (span / 2)], pivot);
    k.box('creep-wing-bone', dark, [0.04, 0.04, span], [0.12, 0.01, side * (span / 2)], pivot);
    k.box('wing-tip', k.gem, [0.12, 0.05, 0.16], [0.08, 0.02, side * (span + 0.04)], pivot);
  }
}

/** Floating lantern-wisp: a glowing bell around a crystal core, with dangling strands. */
function wisp(k: Kit, variant: number) {
  k.box('creep-bell', k.skin, [0.4, 0.14, 0.4], [0, 0.2, 0]);
  k.box('creep-cap', k.skin, [0.28, 0.1, 0.28], [0, 0.32, 0]);
  k.box('creep-glow', k.gem, [0.22, 0.2, 0.22], [0, 0.08, 0]);
  k.box('creep-crown', k.gem, [0.08, 0.12, 0.08], [0, 0.42, 0]);
  eyes(k, 0.2, 0.16, 0.08);
  for (const [x, z] of [
    [0.12, 0.12],
    [-0.12, -0.12],
    [0.12, -0.12],
  ] as const)
    k.box('creep-strand', dark, [0.03, 0.18 + (variant % 2) * 0.06, 0.03], [x, -0.08, z]);
  for (const side of [-1, 1]) {
    const pivot = k.limb([-0.1, 0.02, side * 0.1]);
    k.box('creep-strand', k.gem, [0.04, 0.24, 0.04], [0, -0.12, 0], pivot);
    k.box('wing-tip', k.gem, [0.07, 0.07, 0.07], [0, -0.26, 0], pivot);
  }
}

/** Boss wyrm: long segmented body, horned crowned head, tall spine crystals; legs or wings. */
function wyrm(k: Kit, flying: boolean) {
  const hip = flying ? 0 : 0.18;
  k.box('creep-chest', k.skin, [0.4, 0.34, 0.5], [0.06, hip + 0.18, 0]);
  k.box('creep-hip', k.skin, [0.3, 0.28, 0.42], [-0.26, hip + 0.15, 0]);
  k.box('creep-tail', k.skin, [0.24, 0.16, 0.24], [-0.5, hip + 0.12, 0]).rotation.z = -0.2;
  k.box('creep-tail', dark, [0.16, 0.08, 0.1], [-0.68, hip + 0.06, 0]).rotation.z = -0.35;
  k.box('creep-neck', k.skin, [0.16, 0.2, 0.22], [0.3, hip + 0.32, 0]).rotation.z = 0.5;
  k.box('creep-head', k.skin, [0.28, 0.18, 0.3], [0.46, hip + 0.42, 0]);
  k.box('creep-muzzle', dark, [0.14, 0.08, 0.2], [0.62, hip + 0.36, 0]);
  eyes(k, 0.56, hip + 0.48, 0.11);
  for (const side of [-1, 1])
    k.box('creep-tusk', bone, [0.06, 0.2, 0.06], [0.38, hip + 0.56, side * 0.12]).rotation.set(
      side * -0.4,
      0,
      -0.5,
    );
  for (const z of [-0.07, 0, 0.07])
    k.box('boss-crown', k.gem, [0.06, z ? 0.12 : 0.18, 0.06], [0.48, hip + 0.56, z]);
  ridge(k, -0.58, 0.2, hip + 0.32, 6, 0.3);
  if (flying) wings(k, hip + 0.22, 0.7);
  else
    for (const x of [0.12, -0.3])
      for (const side of [-1, 1]) leg(k, [x, hip, side * 0.22], [0.12, hip, 0.12], bone);
}

const BUILDERS: Record<CreepKind, (k: Kit, variant: number, flying: boolean) => void> = {
  burrower,
  crawler,
  golem,
  bat,
  wisp,
  wyrm: (k, _v, flying) => wyrm(k, flying),
};

/** Build one creep: its kind and gem from creep-theme, the skin from its immunity. */
export function creepModel({
  name,
  modelScale = 1,
  flying = false,
  boss = false,
  immunity = 0,
}: {
  name: string;
  modelScale?: number;
  flying?: boolean;
  boss?: boolean;
  immunity?: number;
}) {
  const length = creepSize(modelScale);
  const theme = creepTheme(name);
  const kind: CreepKind = boss
    ? 'wyrm'
    : flying
      ? theme?.kind === 'wisp'
        ? 'wisp'
        : 'bat'
      : (theme?.kind ?? 'burrower');
  const variant = [...name].reduce((h, c) => Math.imul(h, 31) + c.charCodeAt(0), 0) >>> 0;
  const group = new THREE.Group();
  const body = new THREE.Group();
  let limbs = 0;
  const k: Kit = {
    skin: skins[immunity] ?? skins[0],
    gem: crystalOf(theme?.color ?? '#cf9ae9'),
    body,
    box(partName, material, size, at, parent = body) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(...(size.map((v) => v * length) as V3)),
        material,
      );
      mesh.name = partName;
      mesh.position.set(...(at.map((v) => v * length) as V3));
      mesh.castShadow = true;
      mesh.userData.sharedMaterial = true;
      parent.add(mesh);
      return mesh;
    },
    limb(at) {
      const pivot = new THREE.Group();
      pivot.name = `creep-limb-${limbs++}`;
      pivot.position.set(...(at.map((v) => v * length) as V3));
      body.add(pivot);
      return pivot;
    },
  };
  BUILDERS[kind](k, variant, flying);
  // Resistances read on every kind: steel shoulder plates for armour, violet shards for magic.
  const top = new THREE.Box3().setFromObject(body).max.y / length;
  for (const side of [-1, 1]) {
    if (immunity & 1)
      k.box('creep-armor', metal, [0.3, 0.06, 0.1], [-0.08, top - 0.04, side * 0.2]);
    if (immunity & 2)
      k.box(
        'creep-crystal',
        violet,
        [0.08, 0.22, 0.08],
        [-0.16, top + 0.06, side * 0.14],
      ).rotation.x = side * 0.3;
  }
  if (flying) {
    body.position.y = FLY_ALTITUDE;
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.45 * length, 12), shadowMaterial);
    shadow.userData.sharedMaterial = true;
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    group.add(shadow);
  }
  group.add(body);
  const height = new THREE.Box3().setFromObject(body).max.y;
  group.userData = { length, height, flying, boss, kind, healthBarY: height + 0.15 };
  return group;
}

/** The moving parts of a creep model, in limb order. */
export function creepLimbs(model: THREE.Object3D) {
  const limbs: THREE.Object3D[] = [];
  model.traverse((part) => {
    if (part.name.startsWith('creep-limb-')) limbs.push(part);
  });
  return limbs;
}

export function animateCreep(
  limbs: THREE.Object3D[],
  time: number,
  flying: boolean,
  moving: boolean,
) {
  for (let i = 0; i < limbs.length; i++) {
    const swing = moving ? Math.sin(time * (flying ? 9 : 12) + (i % 2 ? Math.PI : 0)) : 0;
    if (flying) limbs[i].rotation.x = swing * 0.4;
    else limbs[i].rotation.z = swing * 0.55 * (Math.floor(i / 2) % 2 ? -1 : 1);
  }
}
