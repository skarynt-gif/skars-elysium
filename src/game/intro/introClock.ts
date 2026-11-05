/**
 * Mutable intro progress, read every frame by the gate and camera.
 * Lives outside React state on purpose: it changes 60 times a second.
 */
export const introClock = {
  /** Seconds since PRESS START. */
  elapsed: 0,
  /** Set when a returning visitor skips the cutscene. */
  skipRequested: false,
};
