import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { QualityTier } from '../config/quality.ts';
import { DEFAULT_GOVERNOR, MOBILE_GOVERNOR, createGovernor, type Governor } from '../platform/performanceGovernor.ts';
import { useGameStore } from '../state/gameStore.ts';

/**
 * Measures the frame rate and, when graphics are on Auto, steps quality
 * down on a struggling device (or back up when it has headroom).
 */
export function PerformanceMonitor({ ceiling, touch }: { ceiling: QualityTier; touch: boolean }) {
  const governor = useRef<Governor | null>(null);
  const qualityChoice = useGameStore((s) => s.settings.quality);
  const lastFps = useRef(0);

  // Restart the governor whenever the visitor picks Auto again.
  useEffect(() => {
    const start = useGameStore.getState().quality?.tier ?? ceiling;
    governor.current = qualityChoice === 'auto' ? createGovernor(start, ceiling, touch ? MOBILE_GOVERNOR : DEFAULT_GOVERNOR) : null;
    if (qualityChoice !== 'auto') useGameStore.getState().setAutoTier(null);
  }, [qualityChoice, ceiling, touch]);

  // A second, passive governor just measures FPS for the debug panel (even when quality is fixed).
  const measure = useRef(createGovernor('high', 'high'));

  useFrame((_, delta) => {
    const store = useGameStore.getState();
    // Only judge real gameplay; the title screen and menus aren't representative.
    if (store.phase !== 'exploring') return;
    measure.current.frame(delta);
    if (measure.current.fps !== lastFps.current) {
      lastFps.current = measure.current.fps;
      store.setFps(Math.round(measure.current.fps));
    }
    const change = governor.current?.frame(delta);
    if (change) store.setAutoTier(change);
  });

  return null;
}
