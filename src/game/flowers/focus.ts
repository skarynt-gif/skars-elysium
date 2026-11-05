import type { Vec2 } from '../world/layout.ts';

/**
 * Which flower the visitor is "at": the one they're closest to among those in
 * front of them. Being slightly off-center is fine; behind them is not.
 * Distance is weighted by angle so turning toward a flower switches focus.
 */
export const FLOWER_FOCUS = {
  /** Meters. */
  reach: 2.4,
  /** Half-angle of the view cone in which flowers can be focused. */
  coneDeg: 55,
} as const;

export function chooseFlowerFocus(
  position: Vec2,
  yaw: number,
  flowers: readonly Vec2[],
  reach: number = FLOWER_FOCUS.reach,
  coneDeg: number = FLOWER_FOCUS.coneDeg,
): number {
  const forward: Vec2 = [-Math.sin(yaw), -Math.cos(yaw)];
  const minCos = Math.cos((coneDeg * Math.PI) / 180);
  let best = -1;
  let bestScore = Infinity;
  flowers.forEach((f, i) => {
    const dx = f[0] - position[0];
    const dz = f[1] - position[1];
    const d = Math.hypot(dx, dz);
    if (d > reach) return;
    // Standing right on top of a flower counts as facing it.
    const cos = d < 0.25 ? 1 : (dx * forward[0] + dz * forward[1]) / d;
    if (cos < minCos) return;
    const score = d * (2 - cos); // nearer and more central wins
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}
