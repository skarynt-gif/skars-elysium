/**
 * Facts about the visitor's device. Detection (which needs a browser) is kept
 * separate from the decisions made from those facts (pure, testable), so the
 * quality rules can be unit-tested without a browser.
 */
export interface DeviceCapabilities {
  webgl2: boolean;
  touch: boolean;
  /**
   * Primary input is a finger (phones, tablets). Touchscreen laptops report
   * touch but a fine primary pointer, so they keep mouse controls.
   */
  coarsePointer: boolean;
  /** Narrow phone-sized screen. */
  smallScreen: boolean;
  /** navigator.deviceMemory in GB when the browser reports it (Chrome/Android only). */
  deviceMemoryGb: number | null;
  /** Logical CPU cores, when reported. */
  cpuCores: number | null;
  prefersReducedMotion: boolean;
  isIOS: boolean;
}

export function detectCapabilities(): DeviceCapabilities {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const canvas = document.createElement('canvas');
  const webgl2 = !!canvas.getContext('webgl2');

  // iPadOS reports itself as a Mac, so touch support is used to tell them apart.
  const isIOS =
    /iPhone|iPad|iPod/.test(nav.userAgent) ||
    (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);

  return {
    webgl2,
    touch: nav.maxTouchPoints > 0 || 'ontouchstart' in window,
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
    smallScreen: Math.min(window.screen.width, window.screen.height) < 600,
    deviceMemoryGb: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    cpuCores: typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null,
    prefersReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    isIOS,
  };
}
