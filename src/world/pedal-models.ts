import * as THREE from 'three';
import { PEDAL_COLORS, type PedalFamily } from './pedals';

// Pedal (tablet) models: a stone slab tinted by the spell it casts, an inset rune plate and a low
// glowing emblem that says what it does, so a pedal reads on the floor before it ever triggers:
// - ensnare: a thorned vine ring; gale: a swirl of wind arcs; torrent: ripples round a drop;
// - howl: a crescent moon with rays; acid: a bubbling pool; cask (paralysis): a banded barrel;
// - terror: a spiked star round a dark eye; decrepify: a pale ghost orb in tilted rings.
// Emblems stay low: creeps walk over pedals.

const FAMILY_OF: [string, PedalFamily][] = [
  ['youbu', 'ensnare'],
  ['zhangqi', 'gale'],
  ['hongliu', 'torrent'],
  ['haojiao', 'howl'],
  ['suanwu', 'acid'],
  ['mabi', 'cask'],
  ['konghe', 'terror'],
  ['xuwu', 'decrepify'],
];

/** The spell family of a pedal tower id, e.g. gemtd_hongliushiban_yin is a torrent pedal. */
export function pedalFamilyOf(name: string): PedalFamily | null {
  const id = name.replace(/^gemtd_/, '');
  return FAMILY_OF.find(([prefix]) => id.startsWith(prefix))?.[1] ?? null;
}

const STONE = new THREE.Color('#60646d');
const TOP = 0.12; // slab top

function glow(color: string, options: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.55,
    roughness: 0.5,
    ...options,
  });
}

const flatRing = (r: number, tube: number, arc = Math.PI * 2, segments = 16) =>
  new THREE.TorusGeometry(r, tube, 4, segments, arc).rotateX(-Math.PI / 2);

function emblem(family: PedalFamily, color: string) {
  const out = new THREE.Group();
  const lit = glow(color);
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, y = TOP + 0.02) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = y;
    out.add(mesh);
    return mesh;
  };
  switch (family) {
    case 'ensnare': {
      add(flatRing(0.19, 0.035, Math.PI * 2, 10), glow('#5c8a3a'));
      const thorn = new THREE.MeshStandardMaterial({ color: '#2d4a22', roughness: 0.8 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const cone = add(new THREE.ConeGeometry(0.03, 0.12, 4), thorn, TOP + 0.05);
        cone.position.x = Math.cos(a) * 0.19;
        cone.position.z = Math.sin(a) * 0.19;
        cone.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7); // lean in, closing like a snare
      }
      break;
    }
    case 'gale':
      [0.09, 0.16, 0.23].forEach((r, i) => {
        add(flatRing(r, 0.022, Math.PI * 1.2, 12), lit).rotation.y = i * 2.1;
      });
      break;
    case 'torrent': {
      add(flatRing(0.24, 0.016, Math.PI * 2, 24), lit, TOP + 0.01);
      add(flatRing(0.16, 0.018, Math.PI * 2, 20), lit, TOP + 0.015);
      const water = glow('#8fd0ff', { emissiveIntensity: 0.7 });
      add(new THREE.SphereGeometry(0.06, 10, 8), water, TOP + 0.06);
      add(new THREE.ConeGeometry(0.052, 0.08, 10), water, TOP + 0.13);
      break;
    }
    case 'howl': {
      const moon = add(flatRing(0.13, 0.04, Math.PI * 1.25, 14), lit);
      moon.rotation.y = Math.PI * 0.4;
      for (let i = 0; i < 7; i++) {
        const a = Math.PI * (0.15 + i * 0.25);
        const ray = add(new THREE.BoxGeometry(0.07, 0.02, 0.02), lit, TOP + 0.015);
        ray.position.x = Math.cos(a) * 0.24;
        ray.position.z = Math.sin(a) * 0.24;
        ray.rotation.y = -a;
      }
      break;
    }
    case 'acid': {
      add(new THREE.CylinderGeometry(0.22, 0.24, 0.015, 18), glow('#6aa82c'), TOP + 0.008);
      const bubble = glow('#c6f06a', { emissiveIntensity: 0.7 });
      for (const [x, z, r] of [
        [0.06, 0.04, 0.06],
        [-0.09, -0.03, 0.045],
        [0.02, -0.11, 0.035],
        [-0.04, 0.12, 0.03],
      ])
        add(
          new THREE.SphereGeometry(r, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
          bubble,
          TOP + 0.01,
        ).position.set(x, TOP + 0.01, z);
      break;
    }
    case 'cask': {
      const wood = new THREE.MeshStandardMaterial({ color: '#8a5a32', roughness: 0.85 });
      const barrel = add(new THREE.CylinderGeometry(0.075, 0.075, 0.24, 12), wood, TOP + 0.075);
      barrel.rotation.z = Math.PI / 2;
      for (const x of [-0.07, 0.07]) {
        const band = add(new THREE.TorusGeometry(0.078, 0.012, 4, 14), lit, TOP + 0.075);
        band.rotation.y = Math.PI / 2;
        band.position.x = x;
      }
      add(flatRing(0.24, 0.014, Math.PI * 2, 20), lit, TOP + 0.01);
      break;
    }
    case 'terror': {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const spike = add(new THREE.ConeGeometry(0.035, i % 2 ? 0.12 : 0.18, 4), lit, TOP + 0.02);
        spike.rotation.z = -Math.PI / 2;
        spike.rotation.y = -a;
        spike.position.x = Math.cos(a) * 0.15;
        spike.position.z = Math.sin(a) * 0.15;
      }
      add(
        new THREE.OctahedronGeometry(0.08),
        glow('#2a0f3a', { emissive: '#c060ff' }),
        TOP + 0.05,
      ).scale.set(1.3, 0.6, 0.8);
      break;
    }
    case 'decrepify': {
      add(
        new THREE.SphereGeometry(0.1, 14, 10),
        glow(color, { transparent: true, opacity: 0.65, emissiveIntensity: 0.8 }),
        TOP + 0.09,
      );
      const ring = glow('#e8fff4', { transparent: true, opacity: 0.8 });
      add(flatRing(0.17, 0.012, Math.PI * 2, 24), ring, TOP + 0.08).rotation.x = 0.5;
      add(flatRing(0.22, 0.01, Math.PI * 2, 24), ring, TOP + 0.06).rotation.z = 0.45;
      break;
    }
  }
  return out;
}

/** The slab, rune plate and emblem of a pedal, standing at the origin. */
export function pedalHead(name: string) {
  const family = pedalFamilyOf(name) ?? 'ensnare';
  const color = PEDAL_COLORS[family];
  const head = new THREE.Group();
  head.name = `pedal-${family}`;
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.08, 0.62),
    new THREE.MeshStandardMaterial({
      color: STONE.clone().lerp(new THREE.Color(color), 0.3),
      roughness: 1,
    }),
  );
  slab.position.y = 0.08;
  head.add(slab);
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(0.52, 0.012, 0.52),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(color).multiplyScalar(0.45),
      roughness: 0.9,
    }),
  );
  plate.position.y = TOP + 0.004;
  head.add(plate);
  head.add(emblem(family, color));
  return head;
}
