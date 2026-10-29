import * as THREE from 'three';

// Smooth tower head tracking (issue #14). The art-study towers expose `userData.aimAt(x, z)`, which
// snaps the head's yaw and the gems' lean straight to their final pose. Rather than change the
// read-only factory, this wraps it: once per tower it finds which parts aimAt turns, and every
// frame it asks aimAt for the goal pose and eases those parts toward it.

/** Head turn speed: exponential approach, capped so a full about-face takes about half a second. */
const TURN_RATE = 14;
const MAX_TURN = 7; // radians per second
const LEAN_RATE = 10;

type Mover = { node: THREE.Object3D; yaw: boolean; lean: boolean; shownY: number; shownZ: number };

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Ease `from` toward `to` along the shorter way round, at most MAX_TURN * dt. */
export function turnToward(from: number, to: number, dt: number) {
  const delta = wrap(to - from);
  const step = delta * (1 - Math.exp(-TURN_RATE * dt));
  const cap = MAX_TURN * dt;
  return from + Math.max(-cap, Math.min(cap, step));
}

export function createAimer(tower: THREE.Object3D) {
  const aimAt = tower.userData.aimAt as ((x?: number, z?: number) => void) | undefined;
  const movers: Mover[] = [];
  /** Every node aimAt moves in any way: these must stay separate when the model is merged. */
  const moving: THREE.Object3D[] = [];
  if (aimAt) {
    // Probe: rest, then aim east and south of the tower; whatever rotates is what aimAt drives.
    const all: THREE.Object3D[] = [];
    tower.traverse((o) => all.push(o));
    const pose = () => all.map((o) => [o.rotation.y, o.rotation.z]);
    const full = () =>
      all.map((o) => [...o.position.toArray(), o.rotation.x, o.rotation.y, o.rotation.z].join());
    tower.updateWorldMatrix(true, true);
    const at = new THREE.Vector3().setFromMatrixPosition(tower.matrixWorld);
    aimAt();
    const rest = pose();
    const restFull = full();
    aimAt(at.x + 10, at.z);
    const east = pose();
    const eastFull = full();
    aimAt(at.x, at.z + 10);
    const south = pose();
    const southFull = full();
    aimAt();
    all.forEach((node, i) => {
      if (restFull[i] !== eastFull[i] || restFull[i] !== southFull[i]) moving.push(node);
    });
    all.forEach((node, i) => {
      const yaw = Math.abs(east[i][0] - south[i][0]) > 1e-6;
      const lean = Math.abs(east[i][1] - rest[i][1]) > 1e-6;
      if (yaw || lean)
        movers.push({ node, yaw, lean, shownY: node.rotation.y, shownZ: node.rotation.z });
    });
  }
  return {
    /** Nodes aimAt moves; merging keeps them separate. */
    moving,
    get parts() {
      return movers.length;
    },
    /** Ease toward aiming at board point (x, z), or toward rest without one. */
    update(x: number | undefined, z: number | undefined, dt: number, snap = false) {
      if (!aimAt || !movers.length) return;
      if (x === undefined) aimAt();
      else aimAt(x, z);
      for (const m of movers) {
        const goalY = m.node.rotation.y;
        const goalZ = m.node.rotation.z;
        if (m.yaw) m.shownY = snap ? goalY : turnToward(m.shownY, goalY, dt);
        if (m.lean)
          m.shownZ = snap ? goalZ : m.shownZ + (goalZ - m.shownZ) * (1 - Math.exp(-LEAN_RATE * dt));
        if (m.yaw) m.node.rotation.y = m.shownY;
        if (m.lean) m.node.rotation.z = m.shownZ;
      }
    },
  };
}
