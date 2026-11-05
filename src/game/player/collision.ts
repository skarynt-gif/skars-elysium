import type { Collider, Vec2 } from '../world/layout.ts';

/**
 * Keeps the visitor (a circle on the ground plane) out of colliders and
 * inside the garden. Overlaps are pushed out along the shortest direction,
 * which makes the visitor slide smoothly along walls instead of sticking.
 *
 * The garden is flat, so collision is 2D (x/z); no physics engine needed.
 */
export interface CollisionWorld {
  colliders: readonly Collider[];
  /** Visitors stay within this distance of the origin. */
  walkRadius: number;
}

function closestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / lengthSq));
  return [a[0] + t * dx, a[1] + t * dz];
}

/** Returns a corrected position that doesn't overlap anything. */
export function resolveCollisions(position: Vec2, radius: number, world: CollisionWorld, iterations = 4): Vec2 {
  let [x, z] = position;

  for (let iter = 0; iter < iterations; iter++) {
    let moved = false;
    for (const c of world.colliders) {
      const anchor = c.kind === 'circle' ? c.center : closestPointOnSegment([x, z], c.from, c.to);
      const minDistance = c.radius + radius;
      let dx = x - anchor[0];
      let dz = z - anchor[1];
      const distance = Math.hypot(dx, dz);
      if (distance >= minDistance) continue;
      if (distance < 1e-6) {
        // Exactly on the center: push in an arbitrary but stable direction.
        dx = 0;
        dz = 1;
      } else {
        dx /= distance;
        dz /= distance;
      }
      x = anchor[0] + dx * minDistance;
      z = anchor[1] + dz * minDistance;
      moved = true;
    }

    const fromCenter = Math.hypot(x, z);
    const limit = world.walkRadius - radius;
    if (fromCenter > limit) {
      x = (x / fromCenter) * limit;
      z = (z / fromCenter) * limit;
      moved = true;
    }
    if (!moved) break;
  }
  return [x, z];
}
