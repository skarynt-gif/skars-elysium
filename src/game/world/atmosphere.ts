import { seededRandom } from '../../lib/random.ts';

/**
 * Sunset settings shared by the sky, the sun light and the mountains.
 * The sun sits low in the north-west, ahead and to the left of a visitor
 * walking in from the gate, so the garden is lit with long golden light.
 */
export const SUN = { azimuthDeg: -30, elevationDeg: 6 } as const;

/** Unit vector pointing toward the sun (x, y, z). */
export function sunDirection(azimuthDeg = SUN.azimuthDeg, elevationDeg = SUN.elevationDeg): [number, number, number] {
  const az = (azimuthDeg * Math.PI) / 180;
  const el = (elevationDeg * Math.PI) / 180;
  return [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)];
}

export interface MountainLayer {
  radius: number;
  minHeight: number;
  maxHeight: number;
  color: string;
  seed: string;
}

/** Far layers are paler (closer to the sky), near layers darker: atmospheric depth. */
export const MOUNTAIN_LAYERS: readonly MountainLayer[] = [
  { radius: 230, minHeight: 22, maxHeight: 62, color: '#b56a92', seed: 'far' },
  { radius: 170, minHeight: 12, maxHeight: 38, color: '#8a4f86', seed: 'mid' },
  { radius: 120, minHeight: 4, maxHeight: 16, color: '#5f3a72', seed: 'near' },
];

/**
 * Height around a full circle of `segments` steps. The last value equals the
 * first so the ring closes without a seam.
 */
export function mountainProfile(layer: MountainLayer, segments: number): number[] {
  const rand = seededRandom(layer.seed);
  const waves = Array.from({ length: 4 }, (_, i) => ({
    frequency: [2, 5, 9, 17][i]!,
    phase: rand() * Math.PI * 2,
    weight: [0.45, 0.3, 0.17, 0.08][i]!,
  }));
  const heights: number[] = [];
  for (let i = 0; i < segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    let n = 0;
    for (const w of waves) n += w.weight * Math.sin(theta * w.frequency + w.phase);
    // Fold the noise to get sharper ridgelines.
    const ridged = 1 - Math.abs(n);
    heights.push(layer.minHeight + (layer.maxHeight - layer.minHeight) * Math.max(0, Math.min(1, ridged)));
  }
  heights.push(heights[0]!);
  return heights;
}
