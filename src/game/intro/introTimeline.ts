import { WORLD, type Vec2 } from '../world/layout.ts';

/**
 * The gate-opening cutscene, as pure functions of time (seconds since the
 * visitor pressed start). Kept free of Three.js so it can be unit-tested.
 *
 *   0.0s  gate creaks open (2.4s)
 *   0.9s  camera begins gliding through the gate (4.4s)
 *   5.3s  control passes to the visitor
 */
export const INTRO = {
  gateOpenDuration: 2.4,
  cameraDelay: 0.9,
  cameraDuration: 4.4,
  /** Fully open angle of each gate leaf, radians (≈100°). */
  gateOpenAngle: 1.75,
  startPosition: [0, WORLD.gate.z + 7] as Vec2,
  endPosition: [0, 14.5] as Vec2,
  /** Fountain top, where the camera looks throughout. */
  lookAt: [0, 2.2, 0] as const,
} as const;

export const INTRO_DURATION = INTRO.cameraDelay + INTRO.cameraDuration;

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
/** Heavy gate: slow start, slight overshoot settle. */
const easeGate = (t: number) => {
  const c = 1.4;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
};

/** 0 = closed, 1 = fully open. */
export function gateOpenAmount(elapsed: number): number {
  return easeGate(clamp01(elapsed / INTRO.gateOpenDuration));
}

/** Camera ground position during the intro. */
export function introCameraPosition(elapsed: number): Vec2 {
  const t = easeInOut(clamp01((elapsed - INTRO.cameraDelay) / INTRO.cameraDuration));
  const [sx, sz] = INTRO.startPosition;
  const [ex, ez] = INTRO.endPosition;
  return [sx + (ex - sx) * t, sz + (ez - sz) * t];
}

export function introFinished(elapsed: number): boolean {
  return elapsed >= INTRO_DURATION;
}
