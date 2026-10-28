// Keeping creep models out of walls (issue #11). Presentation only: the sim's positions and
// hulls never change.
// - Ground creeps are scaled down where needed so their body fits a one-cell corridor between
//   full-cell walls. Flying creeps pass above the walls and keep their VPK scale.
// - A collision radius pushes the drawn creep out of any occupied cell it overlaps. In a straight
//   corridor nothing overlaps; on a diagonal step past a wall corner the body slides around it.

/** Board-scale multiplier applied to the art-study creep (whose length is 0.36 × ModelScale). */
export const CREEP_SCALE = 2;
/** Widest ground body, trim included, in cells: leaves a margin inside a one-cell lane. */
export const MAX_GROUND_WIDTH = 0.84;
const BODY_WIDTH = 0.36 * 0.7 * 1.04; // art-study trim width per unit of ModelScale

/** Uniform scale for a creep's body parts: CREEP_SCALE, reduced for ground creeps that would not fit. */
export function creepPartScale(modelScale: number, flying: boolean) {
  if (flying) return CREEP_SCALE;
  return Math.min(CREEP_SCALE, MAX_GROUND_WIDTH / (BODY_WIDTH * modelScale));
}

/** Collision radius of a ground creep drawn at `partScale`, in cells. */
export const creepRadius = (modelScale: number, partScale: number) =>
  (BODY_WIDTH * modelScale * partScale) / 2;

/**
 * Offset (board units) that moves a circle at (x, y) out of the full-cell squares of occupied
 * cells nearby. Pushes from several cells add up; the total never exceeds the radius.
 */
export function clearancePush(
  x: number,
  y: number,
  radius: number,
  occupied: (cx: number, cy: number) => boolean,
) {
  let px = 0;
  let py = 0;
  const cx = Math.round(x);
  const cy = Math.round(y);
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const [ox, oy] = [cx + dx, cy + dy];
      if (!occupied(ox, oy)) continue;
      // Nearest point of that cell's square.
      const nx = Math.max(ox - 0.5, Math.min(x, ox + 0.5));
      const ny = Math.max(oy - 0.5, Math.min(y, oy + 0.5));
      const [ax, ay] = [x - nx, y - ny];
      const d = Math.sqrt(ax * ax + ay * ay);
      if (d >= radius || d === 0) continue; // inside a wall cell is the sim's business, not ours
      px += (ax / d) * (radius - d);
      py += (ay / d) * (radius - d);
    }
  const length = Math.sqrt(px * px + py * py);
  if (length > radius) [px, py] = [(px / length) * radius, (py / length) * radius];
  return { x: px, y: py };
}
