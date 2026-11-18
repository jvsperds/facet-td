import * as THREE from 'three';
import { PEDAL_COLORS, type PedalFamily } from './pedals';

// Pedal (tablet) models: a thin slate plate flush with the floor, cut like the gems: an octagonal
// rune rim and a flat faceted crystal inlay glowing in the spell's colour (PEDAL_COLORS). The tier
// adds rim notches (copper 0, silver 2, gold 4). Everything stays low: creeps walk over pedals.

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

const STONE = new THREE.Color('#4a4e57');
const TOP = 0.05; // plate top

function glow(color: string, intensity = 0.6) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.35,
    metalness: 0.1,
    flatShading: true,
  });
}

/** The plate, rune rim and crystal inlay of a pedal, lying at the origin. */
export function pedalHead(name: string) {
  const family = pedalFamilyOf(name) ?? 'ensnare';
  const color = PEDAL_COLORS[family];
  const head = new THREE.Group();
  head.name = `pedal-${family}`;
  const plate = new THREE.Mesh(
    new THREE.CylinderGeometry(0.33, 0.35, 0.04, 8),
    new THREE.MeshStandardMaterial({ color: STONE, roughness: 0.95, flatShading: true }),
  );
  plate.position.y = TOP - 0.02;
  plate.rotation.y = Math.PI / 8;
  head.add(plate);
  const lit = glow(color);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.014, 3, 8), lit);
  rim.rotation.x = -Math.PI / 2;
  rim.rotation.z = Math.PI / 8;
  rim.position.y = TOP + 0.002;
  head.add(rim);
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.15, 0), glow(color, 0.8));
  crystal.scale.set(1, 0.18, 1);
  crystal.rotation.y = Math.PI / 4;
  crystal.position.y = TOP + 0.01;
  head.add(crystal);
  const notches = name.endsWith('_jin') ? 4 : name.endsWith('_yin') ? 2 : 0;
  for (let i = 0; i < notches; i++) {
    const a = (i / notches) * Math.PI * 2 + Math.PI / 6;
    const notch = new THREE.Mesh(new THREE.OctahedronGeometry(0.03, 0), lit);
    notch.position.set(Math.cos(a) * 0.27, TOP + 0.01, Math.sin(a) * 0.27);
    head.add(notch);
  }
  return head;
}
