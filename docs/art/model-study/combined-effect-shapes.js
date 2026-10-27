import * as THREE from "three";

// Solid, faceted effect motifs for the art study; these do not simulate the abilities.
export function effectTools(t) {
  const coloured = (points, parent, hex) => {
    const colour = new THREE.Color(hex).toArray();
    return t.gem(points, parent, () => colour);
  };
  const shard = (parent, x, y, z, radius, height, colour, count = 5) =>
    coloured(
      [
        ...t
          .ring(radius * 0.65, y, count)
          .map((p) => p.add(new THREE.Vector3(x, 0, z))),
        ...t
          .ring(radius, y + height * 0.6, count)
          .map((p) => p.add(new THREE.Vector3(x, 0, z))),
        new THREE.Vector3(x, y + height, z),
      ],
      parent,
      colour,
    );
  const plate = (parent, outline, y, thickness, colour) =>
    coloured(
      [y - thickness / 2, y + thickness / 2].flatMap((h) =>
        outline.map(([x, z]) => new THREE.Vector3(x, h, z)),
      ),
      parent,
      colour,
    );
  const halo = (parent, radius, y, width, colour, count = 8) => {
    for (let i = 0; i < count; i++) {
      const a = (i * 2 * Math.PI) / count,
        b = ((i + 0.86) * 2 * Math.PI) / count;
      plate(
        parent,
        [a, b].flatMap((angle) =>
          [radius - width / 2, radius + width / 2].map((r) => [
            r * Math.cos(angle),
            r * Math.sin(angle),
          ]),
        ),
        y,
        0.018,
        colour,
      );
    }
  };
  const beam = (parent, start, end, width, colour) => {
    const a = Array.isArray(start) ? new THREE.Vector3(...start) : start;
    const b = Array.isArray(end) ? new THREE.Vector3(...end) : end;
    const direction = b.clone().sub(a).normalize();
    const u = direction
      .clone()
      .cross(
        Math.abs(direction.y) < 0.9
          ? new THREE.Vector3(0, 1, 0)
          : new THREE.Vector3(1, 0, 0),
      )
      .normalize()
      .multiplyScalar(width / 2);
    const v = direction
      .clone()
      .cross(u)
      .normalize()
      .multiplyScalar(width / 2);
    return coloured(
      [a, b].flatMap((p) =>
        [-1, 1].flatMap((s) =>
          [-1, 1].map((q) =>
            p.clone().addScaledVector(u, s).addScaledVector(v, q),
          ),
        ),
      ),
      parent,
      colour,
    );
  };
  const bolt = (parent, points, width, colour) => {
    for (let i = 1; i < points.length; i++)
      beam(parent, points[i - 1], points[i], width, colour);
  };
  return { shard, halo, beam, bolt, plate };
}
