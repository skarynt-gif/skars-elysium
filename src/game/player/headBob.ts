/**
 * Walking camera bob, driven by distance walked (not time), so it stops the
 * moment the visitor stops and quickens naturally when running.
 */
export interface BobState {
  /** Advances with distance; one full cycle = two footsteps. */
  phase: number;
  /** Eases in/out so starting and stopping isn't abrupt (0..1). */
  intensity: number;
}

export interface BobOffset {
  /** Vertical offset in meters (dips on each footstep). */
  y: number;
  /** Side-to-side sway in meters, along the camera's right vector. */
  x: number;
}

export const BOB = {
  stepLength: 0.8,
  walkAmplitude: 0.035,
  runAmplitude: 0.055,
  smoothing: 8,
} as const;

export function stepBob(
  state: BobState,
  distanceMoved: number,
  speed: number,
  speeds: { walk: number; run: number },
  dt: number,
  enabled: boolean,
): { state: BobState; offset: BobOffset } {
  const targetIntensity = enabled ? Math.min(1, speed / 1.0) : 0;
  const blend = 1 - Math.exp(-BOB.smoothing * Math.max(0, dt));
  const intensity = state.intensity + (targetIntensity - state.intensity) * blend;
  const phase = (state.phase + (distanceMoved / BOB.stepLength) * Math.PI) % (Math.PI * 2);

  // 0 at walking speed, 1 at running speed.
  const runMix = Math.min(1, Math.max(0, (speed - speeds.walk) / (speeds.run - speeds.walk)));
  const amplitude = (BOB.walkAmplitude + (BOB.runAmplitude - BOB.walkAmplitude) * runMix) * intensity;

  return {
    state: { phase, intensity },
    offset: {
      y: -Math.abs(Math.sin(phase)) * amplitude,
      x: Math.sin(phase) * amplitude * 0.5,
    },
  };
}
