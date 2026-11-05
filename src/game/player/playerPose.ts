import type { Vec2 } from '../world/layout.ts';

/**
 * Where the visitor is and where they're looking, updated every frame by the
 * player controller. Read by navigation, flower focus, collectibles,
 * butterflies and bloom celebrations.
 */
export const playerPose = {
  position: [0, 14.5] as Vec2,
  yaw: 0,
  pitch: 0,
  /** Ground speed in m/s. */
  speed: 0,
  /** True once the visitor has control. */
  active: false,
};
