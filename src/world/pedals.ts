import * as THREE from 'three';
import type { TabletOperation } from '../sim/tablets';

// Pedal (tablet) trigger effects (issue #12). The VPK calls the floor tablets "pedals": when a
// creep steps near one it casts its spell. Each spell family gets its own look:
// - ensnare: dark vine rings snap shut under the caught creeps;
// - venomous gale: a green cloud rolls out along the cast line;
// - torrent: a bubbling warning ring, then a water column erupts after the cast delay;
// - howl: a golden ring rallies the nearby towers;
// - acid spray: a green acid pool lingers for the field's duration;
// - cask: a paralysing orb hops from creep to creep;
// - terror: a violet shockwave; decrepify: a pale ghostly mist.
// Every trigger also flashes the tablet itself. Durations come from the sim's plan (ticks).
// Presentation only: the sim applies the spells on its own schedule.

export type PedalFamily =
  'ensnare' | 'gale' | 'torrent' | 'howl' | 'acid' | 'cask' | 'terror' | 'decrepify';

const HZ = 30;
const COLORS: Record<PedalFamily | 'press', string> = {
  ensnare: '#3E6B2F',
  gale: '#7BC043',
  torrent: '#3A8DDE',
  howl: '#F2C14E',
  acid: '#9BD34B',
  cask: '#C9A0FF',
  terror: '#8E44AD',
  decrepify: '#C8E6D8',
  press: '#FFF4D0',
};
/** The biggest pool or ring drawn, in cells: global spells (radius 9999) stay on the board. */
const MAX_RADIUS = 12;

export function pedalFamily(op: TabletOperation): PedalFamily | null {
  const m = op.modifier ?? '';
  if (m === 'modifier_new_youbu') return 'ensnare';
  if (m.startsWith('modifier_venomous_gale')) return 'gale';
  if (m.startsWith('modifier_torrent')) return 'torrent';
  if (m.startsWith('modifier_howl')) return 'howl';
  if (m.startsWith('modifier_acid_spray')) return 'acid';
  if (op.kind === 'bounce') return 'cask';
  if (m === 'modifier_new_konghe') return 'terror';
  if (m === 'modifier_new_xuwu') return 'decrepify';
  return null;
}

type Point = { x: number; z: number };
type Zone = {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  age: number;
  /** Seconds before it appears (torrent delay, cask hop order). */
  delay: number;
  life: number;
  /** How the zone animates over its life (t from 0 to 1). */
  draw: (t: number, mesh: THREE.Mesh, material: THREE.MeshBasicMaterial, reduced: boolean) => void;
};

export function createPedalEffects(scene: THREE.Scene) {
  const group = new THREE.Group();
  group.name = 'pedal-effects';
  scene.add(group);
  const disc = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
  const ring = new THREE.RingGeometry(0.88, 1, 48).rotateX(-Math.PI / 2);
  const thin = new THREE.RingGeometry(0.95, 1, 48).rotateX(-Math.PI / 2);
  const column = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true).translate(0, 0.5, 0);
  const orb = new THREE.IcosahedronGeometry(0.18, 1);
  const cloud = new THREE.SphereGeometry(1, 14, 10).scale(1, 0.45, 1);
  const zones: Zone[] = [];

  function add(
    geometry: THREE.BufferGeometry,
    color: string,
    at: Point,
    y: number,
    life: number,
    draw: Zone['draw'],
    delay = 0,
  ) {
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(at.x, y, at.z);
    mesh.renderOrder = 3;
    mesh.visible = false;
    group.add(mesh);
    zones.push({ mesh, material, age: 0, delay, life, draw });
  }

  // Common animation shapes.
  const expand =
    (radius: number, opacity: number) =>
    (t: number, m: THREE.Mesh, mat: THREE.MeshBasicMaterial, reduced: boolean) => {
      m.scale.setScalar(radius * (reduced ? 1 : 0.15 + 0.85 * t));
      mat.opacity = opacity * (1 - t);
    };
  const pool =
    (radius: number, opacity: number) =>
    (t: number, m: THREE.Mesh, mat: THREE.MeshBasicMaterial) => {
      m.scale.setScalar(radius);
      // Fade in over the first 8%, out over the last 15%.
      mat.opacity = opacity * Math.min(1, t / 0.08, (1 - t) / 0.15);
    };
  const snap =
    (radius: number) =>
    (t: number, m: THREE.Mesh, mat: THREE.MeshBasicMaterial, reduced: boolean) => {
      // Rings close in on the creep, then hold while the root lasts.
      const close = reduced ? 1 : Math.min(1, t / 0.12);
      m.scale.setScalar(radius * (1.8 - 0.8 * close));
      mat.opacity = 0.85 * Math.min(1, (1 - t) / 0.2);
    };

  return {
    /**
     * A tablet fired. `tablet` is its scene position; `toScene` converts board points; `creeps`
     * lists live creep positions (board units) for picking the visible chain of targets.
     */
    trigger(
      tablet: Point,
      operations: readonly TabletOperation[],
      toScene: (x: number, y: number) => Point,
      creeps: { id: number; x: number; y: number }[],
      targetId: number,
    ) {
      add(thin, COLORS.press, tablet, 0.03, 0.5, expand(0.7, 0.9));
      add(disc, COLORS.press, tablet, 0.025, 0.35, expand(0.5, 0.5));
      for (const op of operations) {
        const family = pedalFamily(op);
        if (!family) continue;
        const color = COLORS[family];
        const at = toScene(op.x ?? 0, op.y ?? 0);
        const radius = Math.min(MAX_RADIUS, op.radius ?? 1);
        const seconds = (ticks: number | undefined, fallback: number) =>
          ticks ? ticks / HZ : fallback;
        if (family === 'ensnare') {
          // Same choice as the sim: nearest creeps to the cast point, up to the limit.
          const caught = creeps
            .filter((c) => Math.hypot(c.x - op.x!, c.y - op.y!) <= (op.radius ?? 0))
            .sort(
              (a, b) =>
                Math.hypot(a.x - op.x!, a.y - op.y!) - Math.hypot(b.x - op.x!, b.y - op.y!) ||
                a.id - b.id,
            )
            .slice(0, op.limit ?? 1);
          for (const c of caught)
            add(ring, color, toScene(c.x, c.y), 0.04, seconds(op.stun, 1), snap(0.45));
          if ((op.radius ?? 0) < MAX_RADIUS) add(thin, color, at, 0.03, 0.6, expand(radius, 0.6));
        } else if (family === 'gale') {
          // A cloud rolls from the tablet along the cast line for its full distance.
          const target = toScene(op.x!, op.y!);
          const [dx, dz] = [target.x - tablet.x, target.z - tablet.z];
          const length = Math.hypot(dx, dz) || 1;
          const distance = op.distance ?? 6;
          const travel = distance / ((op.speed ?? 0.3) * HZ);
          const width = Math.max(0.4, op.radius ?? 0.8);
          add(cloud, color, tablet, 0.35, travel, (t, m, mat, reduced) => {
            const k = reduced ? 0.5 : t;
            m.position.set(
              tablet.x + (dx / length) * distance * k,
              0.35,
              tablet.z + (dz / length) * distance * k,
            );
            m.scale.set(width, width, width);
            mat.opacity = 0.45 * Math.min(1, t / 0.1, (1 - t) / 0.2);
          });
        } else if (family === 'torrent') {
          const delay = seconds(op.delay, 0.5);
          add(thin, color, at, 0.03, delay, (t, m, mat, reduced) => {
            // Bubbling warning: the ring breathes while the torrent builds.
            m.scale.setScalar(radius * (reduced ? 1 : 0.9 + 0.1 * Math.sin(t * Math.PI * 6)));
            mat.opacity = 0.75;
          });
          add(
            column,
            color,
            at,
            0,
            0.7,
            (t, m, mat, reduced) => {
              const rise = reduced ? 1 : Math.sin(Math.PI * Math.min(1, t * 1.4));
              m.scale.set(radius * 0.55, 0.1 + 2 * rise, radius * 0.55);
              mat.opacity = 0.35 * (1 - t);
            },
            delay,
          );
          add(disc, color, at, 0.02, 0.9, expand(radius, 0.4), delay);
        } else if (family === 'howl') {
          add(ring, color, tablet, 0.04, 0.9, expand(radius, 0.8));
          add(thin, color, tablet, 0.03, 1.4, expand(radius, 0.5), 0.25);
        } else if (family === 'acid') {
          add(disc, color, at, 0.02, seconds(op.duration, 3), pool(radius, 0.35));
          add(thin, color, at, 0.03, seconds(op.duration, 3), pool(radius, 0.7));
        } else if (family === 'cask') {
          // Hop from creep to creep: nearest unvisited within bounce range, as the sim chooses.
          const first = creeps.find((c) => c.id === targetId);
          if (!first) continue;
          const chain = [first];
          while (chain.length < (op.bounces ?? 0) + 1) {
            const from = chain.at(-1)!;
            const next = creeps
              .filter(
                (c) =>
                  !chain.includes(c) &&
                  Math.hypot(c.x - from.x, c.y - from.y) <= (op.distance ?? 0),
              )
              .sort(
                (a, b) =>
                  Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y) ||
                  a.id - b.id,
              )[0];
            if (!next) break;
            chain.push(next);
          }
          const hop = 0.22;
          let previous = tablet;
          chain.forEach((c, i) => {
            const from = previous;
            const to = toScene(c.x, c.y);
            add(
              orb,
              color,
              from,
              0.4,
              hop,
              (t, m, mat, reduced) => {
                const k = reduced ? 1 : t;
                m.position.set(
                  from.x + (to.x - from.x) * k,
                  0.4 + Math.sin(Math.PI * k) * 0.6,
                  from.z + (to.z - from.z) * k,
                );
                mat.opacity = 1;
              },
              i * hop,
            );
            add(ring, color, to, 0.04, seconds(op.stun, 1), snap(0.4), (i + 1) * hop);
            previous = to;
          });
        } else if (family === 'terror') {
          add(ring, color, at, 0.04, 0.7, expand(radius, 0.85));
          add(disc, color, at, 0.02, 0.9, expand(radius, 0.25));
        } else {
          add(disc, color, at, 0.02, seconds(op.duration, 3), pool(radius, 0.3));
          add(cloud, color, at, 0.3, seconds(op.duration, 3), (t, m, mat, reduced) => {
            m.scale.set(radius * 0.7, radius * 0.25, radius * 0.7);
            m.rotation.y = reduced ? 0 : t * 2;
            mat.opacity = 0.18 * Math.min(1, t / 0.08, (1 - t) / 0.15);
          });
        }
      }
    },

    get active() {
      return zones.length;
    },

    frame(dt: number, reduced: boolean) {
      for (let i = zones.length - 1; i >= 0; i--) {
        const z = zones[i];
        z.age += dt;
        const t = (z.age - z.delay) / z.life;
        if (t >= 1) {
          z.mesh.removeFromParent();
          z.material.dispose();
          zones.splice(i, 1);
          continue;
        }
        z.mesh.visible = t >= 0;
        if (t >= 0) z.draw(t, z.mesh, z.material, reduced);
      }
    },
  };
}
