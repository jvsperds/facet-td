// Keeping creep models out of walls (issue #11). Presentation only: the sim's positions and
// hulls never change.
// - Ground creeps are scaled down where needed so their body fits a one-cell corridor between
//   full-cell walls. Flying creeps pass above the walls and keep their VPK scale.
// Creeps are drawn exactly on the sim's path through cell centres; nothing steers them sideways.

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

/** Half the body width of a ground creep drawn at `partScale`, in cells. */
export const creepRadius = (modelScale: number, partScale: number) =>
  (BODY_WIDTH * modelScale * partScale) / 2;
