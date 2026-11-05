import type { QualityTier } from '../config/quality.ts';

/**
 * Watches the frame rate and steps graphics quality down when a device
 * struggles, and cautiously back up when it has plenty of headroom.
 *
 * Built to never flicker between settings:
 *   - decisions use a few seconds of frames, not single spikes
 *   - after any change, it waits before judging again
 *   - stepping up needs a long, consistently smooth stretch
 *   - once it has stepped down from a tier, it won't climb back above the
 *     tier that proved too heavy
 */
const TIERS: readonly QualityTier[] = ['low', 'medium', 'high'];

export interface GovernorConfig {
  /** Below this average FPS, step down. */
  downFps: number;
  /** Above this average FPS (sustained), step up. */
  upFps: number;
  /** Seconds of frames per judgement window. */
  windowSeconds: number;
  /** Seconds to wait after a change before judging again. */
  cooldownSeconds: number;
  /** Consecutive smooth windows required before stepping up. */
  upWindows: number;
}

export const DEFAULT_GOVERNOR: GovernorConfig = {
  downFps: 40,
  upFps: 57,
  windowSeconds: 3,
  cooldownSeconds: 6,
  upWindows: 6,
};

/** Phones throttle to 30fps in low-power mode; don't punish that as "struggling". */
export const MOBILE_GOVERNOR: GovernorConfig = { ...DEFAULT_GOVERNOR, downFps: 26, upFps: 55 };

export interface Governor {
  /** Feed one frame's duration in seconds. Returns a new tier when it decides to change. */
  frame(dt: number): QualityTier | null;
  readonly tier: QualityTier;
  /** Latest measured average FPS (for the debug panel). */
  readonly fps: number;
}

export function createGovernor(start: QualityTier, maxTier: QualityTier, config: GovernorConfig = DEFAULT_GOVERNOR): Governor {
  let tier = start;
  let ceiling = TIERS.indexOf(maxTier);
  let windowTime = 0;
  let windowFrames = 0;
  let cooldown = config.cooldownSeconds; // let the scene settle after loading
  let smoothWindows = 0;
  let fps = 60;

  return {
    frame(dt) {
      // Ignore absurd frames (tab switches, breakpoints): they say nothing about steady performance.
      if (!(dt > 0) || dt > 0.5) return null;
      if (cooldown > 0) {
        cooldown -= dt;
        return null;
      }
      windowTime += dt;
      windowFrames++;
      if (windowTime < config.windowSeconds) return null;

      fps = windowFrames / windowTime;
      windowTime = 0;
      windowFrames = 0;
      const index = TIERS.indexOf(tier);

      if (fps < config.downFps && index > 0) {
        ceiling = Math.min(ceiling, index - 1); // that tier was too heavy
        tier = TIERS[index - 1]!;
        cooldown = config.cooldownSeconds;
        smoothWindows = 0;
        return tier;
      }
      if (fps >= config.upFps && index < ceiling) {
        smoothWindows++;
        if (smoothWindows >= config.upWindows) {
          tier = TIERS[index + 1]!;
          cooldown = config.cooldownSeconds;
          smoothWindows = 0;
          return tier;
        }
      } else {
        smoothWindows = 0;
      }
      return null;
    },
    get tier() {
      return tier;
    },
    get fps() {
      return fps;
    },
  };
}

/** Suggest rotating to landscape on phones held upright (dismissable, never forced). */
export function suggestLandscape(width: number, height: number, coarsePointer: boolean): boolean {
  return coarsePointer && height > width * 1.15 && Math.min(width, height) < 600;
}
