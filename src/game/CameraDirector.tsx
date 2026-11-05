import { useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { GAME_CONFIG } from '../config/gameConfig.ts';
import { markVisited } from '../platform/visitMemory.ts';
import { useGameStore } from '../state/gameStore.ts';
import { introClock } from './intro/introClock.ts';
import { INTRO, INTRO_DURATION, introCameraPosition, introFinished } from './intro/introTimeline.ts';

/**
 * Owns the camera until the visitor gets control:
 *   title     → waits outside the closed gate with a gentle idle sway
 *   entering  → plays the gate-opening glide
 *   exploring → hands off (player/PlayerController.tsx takes over)
 */
export function CameraDirector() {
  const camera = useThree((s) => s.camera);
  const phase = useGameStore((s) => s.phase);

  useEffect(() => {
    // Fresh intro each time; a skip requested at the same moment (dev shortcut) is kept.
    if (phase === 'entering') introClock.elapsed = 0;
  }, [phase]);

  useFrame(({ clock }, delta) => {
    const state = useGameStore.getState();
    const eye = GAME_CONFIG.player.eyeHeight;
    const [lx, ly, lz] = INTRO.lookAt;

    if (state.phase === 'booting' || state.phase === 'title') {
      const [x, z] = INTRO.startPosition;
      const t = clock.elapsedTime;
      camera.position.set(x + Math.sin(t * 0.3) * 0.15, eye + Math.sin(t * 0.5) * 0.04, z);
      camera.lookAt(lx, ly, lz);
      return;
    }

    if (state.phase === 'entering') {
      // Clamp long frames (tab switch) so the cutscene never jumps.
      introClock.elapsed += Math.min(delta, 0.1);
      if (introClock.skipRequested) introClock.elapsed = INTRO_DURATION;
      const [x, z] = introCameraPosition(introClock.elapsed);
      camera.position.set(x, eye, z);
      camera.lookAt(lx, ly, lz);
      if (introFinished(introClock.elapsed)) {
        markVisited();
        state.setPhase('exploring');
      }
    }
  });

  return null;
}
