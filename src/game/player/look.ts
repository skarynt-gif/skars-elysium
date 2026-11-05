/** Camera look: yaw wraps freely, pitch stops just short of straight up/down. */
export const PITCH_LIMIT = (85 * Math.PI) / 180;

export interface LookState {
  yaw: number;
  pitch: number;
}

/**
 * Applies a look delta in "look units" (mouse pixels or touch pixels already
 * scaled by sensitivity, in radians).
 */
export function applyLook(state: LookState, deltaYaw: number, deltaPitch: number, invertY = false): LookState {
  const pitch = state.pitch + (invertY ? deltaPitch : -deltaPitch);
  let yaw = state.yaw - deltaYaw;
  // Keep yaw in [−π, π] so it never grows without bound.
  yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
  return { yaw, pitch: Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch)) };
}

/** Yaw/pitch that look from `from` toward `to` (for handing over from the intro camera). */
export function lookAtAngles(from: [number, number, number], to: [number, number, number]): LookState {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  return {
    yaw: Math.atan2(-dx, -dz),
    pitch: Math.atan2(dy, Math.hypot(dx, dz)),
  };
}
