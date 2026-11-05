import type { Vec2 } from '../world/layout.ts';

/**
 * Butterfly behaviour, frame-rate independent and pure (tested):
 *   wander around a home spot → sometimes settle on a flower and rest →
 *   scatter upward when the visitor comes close.
 */
export type Vec3 = [number, number, number];

export interface Butterfly {
  position: Vec3;
  velocity: Vec3;
  home: Vec2;
  target: Vec3;
  /** Seconds left resting on a perch; 0 = flying. */
  rest: number;
  /** Wing flap phase. */
  flap: number;
}

export const BUTTERFLY = {
  speed: 1.5,
  fleeSpeed: 3.2,
  fleeRadius: 2.6,
  homeRadius: 7,
  minHeight: 0.35,
  maxHeight: 3.2,
  arriveDistance: 0.25,
  turnRate: 2.2,
} as const;

const dist3 = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function pickTarget(b: Butterfly, rand: () => number, perches: readonly Vec3[]): { target: Vec3; perch: boolean } {
  // 40%: a flower near home to land on, if there is one.
  if (perches.length && rand() < 0.4) {
    const near = perches.filter((p) => Math.hypot(p[0] - b.home[0], p[2] - b.home[1]) < BUTTERFLY.homeRadius + 1);
    const pick = near[Math.floor(rand() * near.length)];
    if (pick) return { target: [pick[0], pick[1] + 0.08, pick[2]], perch: true };
  }
  const angle = rand() * Math.PI * 2;
  const r = rand() * BUTTERFLY.homeRadius;
  return {
    target: [b.home[0] + Math.cos(angle) * r, 0.6 + rand() * 1.8, b.home[1] + Math.sin(angle) * r],
    perch: false,
  };
}

export function createButterfly(home: Vec2, rand: () => number): Butterfly {
  const b: Butterfly = {
    position: [home[0] + (rand() - 0.5) * 3, 1 + rand(), home[1] + (rand() - 0.5) * 3],
    velocity: [0, 0, 0],
    home,
    target: [home[0], 1.2, home[1]],
    rest: 0,
    flap: rand() * Math.PI * 2,
  };
  b.target = pickTarget(b, rand, []).target;
  return b;
}

export function stepButterfly(
  b: Butterfly,
  dt: number,
  rand: () => number,
  player: Vec2 | null,
  perches: readonly Vec3[],
): Butterfly {
  const h = Math.min(dt, 0.1);
  let { position, velocity, target, rest, flap } = b;

  const playerDistance = player ? Math.hypot(position[0] - player[0], position[2] - player[1]) : Infinity;
  const fleeing = player !== null && playerDistance < BUTTERFLY.fleeRadius;

  if (fleeing) {
    // Scatter: up and away from the visitor.
    rest = 0;
    const away: Vec2 = playerDistance > 1e-3 ? [(position[0] - player[0]) / playerDistance, (position[2] - player[1]) / playerDistance] : [1, 0];
    target = [position[0] + away[0] * 3, Math.min(BUTTERFLY.maxHeight, position[1] + 1.5), position[2] + away[1] * 3];
  } else if (rest > 0) {
    rest = Math.max(0, rest - h);
    // Wings fold slowly while resting.
    return { ...b, rest, flap: flap + h * 2, velocity: [0, 0, 0] };
  }

  const speed = fleeing ? BUTTERFLY.fleeSpeed : BUTTERFLY.speed;
  const toTarget: Vec3 = [target[0] - position[0], target[1] - position[1], target[2] - position[2]];
  const d = Math.hypot(...toTarget) || 1;
  // Fluttery: a little sideways wobble on top of steering.
  const wobble = Math.sin(flap * 0.37) * 0.6;
  const desired: Vec3 = [
    (toTarget[0] / d) * speed + wobble * (toTarget[2] / d),
    (toTarget[1] / d) * speed + Math.sin(flap * 0.5) * 0.4,
    (toTarget[2] / d) * speed - wobble * (toTarget[0] / d),
  ];
  const k = 1 - Math.exp(-BUTTERFLY.turnRate * h);
  velocity = [
    velocity[0] + (desired[0] - velocity[0]) * k,
    velocity[1] + (desired[1] - velocity[1]) * k,
    velocity[2] + (desired[2] - velocity[2]) * k,
  ];
  position = [position[0] + velocity[0] * h, position[1] + velocity[1] * h, position[2] + velocity[2] * h];
  position[1] = Math.min(BUTTERFLY.maxHeight, Math.max(BUTTERFLY.minHeight, position[1]));

  // Never stray too far from home.
  const fromHome = Math.hypot(position[0] - b.home[0], position[2] - b.home[1]);
  const leash = BUTTERFLY.homeRadius + 4;
  if (fromHome > leash) {
    position[0] = b.home[0] + ((position[0] - b.home[0]) / fromHome) * leash;
    position[2] = b.home[1] + ((position[2] - b.home[1]) / fromHome) * leash;
  }

  let next: Butterfly = { ...b, position, velocity, target, rest, flap: flap + h * 22 };
  if (!fleeing && dist3(position, target) < BUTTERFLY.arriveDistance + (d > 5 ? 0 : 0.05)) {
    const landed = perches.some((p) => dist3([p[0], p[1] + 0.08, p[2]], target) < 1e-6);
    const pick = pickTarget(next, rand, perches);
    next = { ...next, target: pick.target, rest: landed ? 2 + rand() * 4 : 0, velocity: landed ? [0, 0, 0] : velocity };
  } else if (fleeing && playerDistance > BUTTERFLY.fleeRadius * 0.9) {
    next.target = pickTarget(next, rand, []).target;
  }
  return next;
}
