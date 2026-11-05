import type { Vec2 } from '../world/layout.ts';
import { resolveCollisions, type CollisionWorld } from './collision.ts';

/**
 * First-person movement. All smoothing is exponential, so it feels the same
 * at 30fps on a phone and 144fps on a gaming monitor.
 */
export interface MovementConfig {
  walkSpeed: number;
  runSpeed: number;
  /** How quickly the visitor reaches full speed (higher = snappier). */
  acceleration: number;
  /** How quickly the visitor stops when keys are released. */
  deceleration: number;
  radius: number;
}

export interface MoveInput {
  /** −1..1 strafe (right positive). */
  x: number;
  /** −1..1 forward (forward positive). */
  y: number;
  run: boolean;
}

export interface PlayerState {
  position: Vec2;
  velocity: Vec2;
  /** Radians; 0 looks toward −z (north). */
  yaw: number;
}

/** Longest step simulated in one go, so a frozen tab can't fling the visitor through a wall. */
export const MAX_STEP = 1 / 20;

/** Ground-plane forward and right vectors for a camera yaw. */
export function basis(yaw: number): { forward: Vec2; right: Vec2 } {
  return {
    forward: [-Math.sin(yaw), -Math.cos(yaw)],
    right: [Math.cos(yaw), -Math.sin(yaw)],
  };
}

export function stepMovement(
  state: PlayerState,
  input: MoveInput,
  dt: number,
  config: MovementConfig,
  world: CollisionWorld,
): PlayerState {
  let remaining = Math.max(0, dt);
  let { position, velocity } = state;

  while (remaining > 1e-6) {
    const h = Math.min(remaining, MAX_STEP);
    remaining -= h;

    // Desired velocity from input, limited so diagonals aren't faster.
    let ix = input.x;
    let iy = input.y;
    const magnitude = Math.hypot(ix, iy);
    if (magnitude > 1) {
      ix /= magnitude;
      iy /= magnitude;
    }
    const speed = input.run ? config.runSpeed : config.walkSpeed;
    const { forward, right } = basis(state.yaw);
    const target: Vec2 = [
      (forward[0] * iy + right[0] * ix) * speed,
      (forward[1] * iy + right[1] * ix) * speed,
    ];

    const moving = magnitude > 0.01;
    const k = moving ? config.acceleration : config.deceleration;
    const blend = 1 - Math.exp(-k * h);
    let vx = velocity[0] + (target[0] - velocity[0]) * blend;
    let vz = velocity[1] + (target[1] - velocity[1]) * blend;
    if (!moving && Math.hypot(vx, vz) < 0.02) {
      vx = 0;
      vz = 0;
    }

    const proposed: Vec2 = [position[0] + vx * h, position[1] + vz * h];
    const resolved = resolveCollisions(proposed, config.radius, world);

    // Remove the part of the velocity that pushes into whatever we hit, so
    // the visitor slides along walls instead of grinding against them.
    const px = resolved[0] - proposed[0];
    const pz = resolved[1] - proposed[1];
    const push = Math.hypot(px, pz);
    if (push > 1e-6) {
      const nx = px / push;
      const nz = pz / push;
      const into = vx * nx + vz * nz;
      if (into < 0) {
        vx -= nx * into;
        vz -= nz * into;
      }
    }

    position = resolved;
    velocity = [vx, vz];
  }

  return { position, velocity, yaw: state.yaw };
}
