import type { DeviceCapabilities } from '../platform/capabilities.ts';

export type QualityTier = 'low' | 'medium' | 'high';

/**
 * Per-tier rendering budgets. The retro look renders the 3D scene at a small
 * internal height and upscales it with hard pixels (game/render), so phones draw
 * far fewer pixels than a normal 3D site.
 */
export interface QualitySettings {
  tier: QualityTier;
  /** Internal render height in pixels before pixel-perfect upscaling. */
  renderHeight: number;
  /** Multiplier applied to particle, firefly and butterfly counts. */
  particleScale: number;
  /** Distance (meters) at which fog fully hides the world and drawing stops. */
  drawDistance: number;
  /** Max foliage instances per bed/cluster. */
  foliageDensity: number;
  /** Subtle PS1 vertex wobble. Disabled for reduced-motion visitors. */
  vertexSnap: boolean;
}

export const QUALITY_PRESETS: Record<QualityTier, Omit<QualitySettings, 'vertexSnap'>> = {
  low: { tier: 'low', renderHeight: 240, particleScale: 0.35, drawDistance: 45, foliageDensity: 0.5 },
  medium: { tier: 'medium', renderHeight: 320, particleScale: 0.7, drawDistance: 65, foliageDensity: 0.8 },
  high: { tier: 'high', renderHeight: 448, particleScale: 1, drawDistance: 90, foliageDensity: 1 },
};

/** Picks a starting tier; platform/performanceGovernor.ts adjusts it live. */
export function chooseQualityTier(caps: DeviceCapabilities): QualityTier {
  if (!caps.webgl2) return 'low';
  const lowMemory = caps.deviceMemoryGb !== null && caps.deviceMemoryGb <= 3;
  const fewCores = caps.cpuCores !== null && caps.cpuCores <= 4;
  if (caps.touch && caps.smallScreen) {
    return lowMemory || fewCores ? 'low' : 'medium';
  }
  if (lowMemory) return 'medium';
  return 'high';
}

export function buildQualitySettings(tier: QualityTier, caps: DeviceCapabilities): QualitySettings {
  return { ...QUALITY_PRESETS[tier], vertexSnap: !caps.prefersReducedMotion };
}
