/**
 * Equal-power crossfade: as one song fades out and the next fades in, the
 * combined loudness stays steady (a plain linear fade dips in the middle).
 *
 * Returned as a list of (time offset, gain) points so it can be scheduled
 * with linear ramps, which, unlike value curves, can be safely interrupted
 * by another crossfade at any moment.
 */
export function equalPowerPoints(duration: number, steps: number, direction: 'in' | 'out', from = direction === 'in' ? 0 : 1) {
  const points: [number, number][] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    // Fade-in follows sin, fade-out follows cos, scaled from the current level.
    const shape = direction === 'in' ? Math.sin((t * Math.PI) / 2) : Math.cos((t * Math.PI) / 2);
    const gain = direction === 'in' ? from + (1 - from) * shape : from * shape;
    points.push([t * duration, gain]);
  }
  return points;
}

export const CROSSFADE_SECONDS = 0.5;
export const CROSSFADE_STEPS = 10;
