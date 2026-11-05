import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../../state/gameStore.ts';
import { getEngine } from '../music.ts';
import { createAmbientEngine, type AmbientEngine } from './ambientEngine.ts';

let ambient: AmbientEngine | null = null;

/** The garden-sound engine, once audio has been unlocked by PRESS START. */
export function getAmbient(): AmbientEngine | null {
  return ambient;
}

/**
 * Feeds the ambient engine the visitor's ears (camera position and facing)
 * every frame, plus the volume setting and whether music is playing.
 */
export function AmbientController() {
  useFrame(({ camera }) => {
    const ctx = getEngine().getContext();
    if (!ctx) return; // not unlocked yet
    ambient ??= createAmbientEngine(ctx);
    const { phase, settings, playback, uiPanel } = useGameStore.getState();
    // Yaw from the camera's facing direction (works during the intro too).
    const yaw = Math.atan2(-camera.matrixWorld.elements[8]!, -camera.matrixWorld.elements[10]!);
    ambient.update(
      { x: camera.position.x, y: camera.position.y, z: camera.position.z, yaw },
      settings.ambientVolume * (uiPanel === 'none' ? 1 : 0.7),
      playback.status === 'playing',
      (phase === 'entering' || phase === 'exploring') && !document.hidden,
    );
  });
  return null;
}
