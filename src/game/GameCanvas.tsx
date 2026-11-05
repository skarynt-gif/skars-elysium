import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useEffect, useState } from 'react';
import { GAME_CONFIG } from '../config/gameConfig.ts';
import type { QualitySettings } from '../config/quality.ts';
import { DEBUG_FLAGS } from '../platform/flags.ts';
import { useGameStore } from '../state/gameStore.ts';
import { CameraDirector } from './CameraDirector.tsx';
import { RetroRenderer } from './render/RetroRenderer.tsx';
import { Garden } from './world/Garden.tsx';
import { DesktopInput } from './input/DesktopInput.tsx';
import { PlayerController } from './player/PlayerController.tsx';
import { NavigationArrows } from './navigation/NavigationArrows.tsx';
import { FlowerField } from './flowers/FlowerField.tsx';
import { Butterflies } from './ambient/Butterflies.tsx';
import { AirParticles } from './ambient/AirParticles.tsx';
import { FountainWater } from './ambient/FountainWater.tsx';
import { Clouds } from './ambient/Clouds.tsx';
import { Collectibles } from './collectibles/Collectibles.tsx';
import { AmbientController } from '../audio/ambient/AmbientController.tsx';
import { PerformanceMonitor } from './PerformanceMonitor.tsx';
import type { QualityTier } from '../config/quality.ts';
import { InteractionSystem } from './interaction/InteractionSystem.tsx';
import { skyPalette } from './world/environment.ts';
import { useEnvironment } from './world/useGardenSettings.ts';

interface Props {
  quality: QualitySettings;
  /** Mouse-look with pointer lock (desktop). Touch devices use on-screen controls. */
  mouseLook: boolean;
  /** Highest tier the automatic governor may climb to on this device. */
  autoTierCeiling: QualityTier;
  touch: boolean;
}

/**
 * Owns the WebGL canvas. <RetroRenderer/> takes over drawing to produce the
 * PS1 look; <CameraDirector/> runs the title view and gate intro.
 */
/** Background and distance fog, tuned by the Studio's sky warmth and fog settings. */
function Atmosphere({ drawDistance }: { drawDistance: number }) {
  const env = useEnvironment();
  const fog = skyPalette(GAME_CONFIG.palette, env.skyWarmth).fog;
  return (
    <>
      <color attach="background" args={[fog]} />
      <fog attach="fog" args={[fog, 12 / env.fog, drawDistance / env.fog]} />
    </>
  );
}

export function GameCanvas({ quality, mouseLook, autoTierCeiling, touch }: Props) {
  const phase = useGameStore((s) => s.phase);

  // Stop drawing while the tab is hidden: saves battery and heat on phones.
  const [hidden, setHidden] = useState(() => document.hidden);
  useEffect(() => {
    const onChange = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  // Stop the page itself from scrolling, zooming or bouncing on phones;
  // touch gestures belong to the game controls.
  useEffect(() => {
    const prevent = (e: Event) => e.preventDefault();
    // Panels (player, settings) may be taller than a small phone screen and
    // must still scroll; everything else is locked to the game.
    const preventOutsidePanels = (e: Event) => {
      if (e.target instanceof Element && e.target.closest('.panel-backdrop')) return;
      e.preventDefault();
    };
    document.addEventListener('gesturestart', prevent);
    document.addEventListener('touchmove', preventOutsidePanels, { passive: false });
    return () => {
      document.removeEventListener('gesturestart', prevent);
      document.removeEventListener('touchmove', preventOutsidePanels);
    };
  }, []);

  return (
    <Canvas
      className="game-canvas"
      // Pixel art never needs more than 1x device pixels; the retro pass
      // renders at an even lower internal resolution.
      dpr={1}
      // No filmic tone mapping: retro colors should stay exactly as authored.
      flat
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      frameloop={hidden ? 'never' : 'always'}
      onCreated={({ gl }) => {
        // Phones can drop the 3D context under memory pressure. Prevent the
        // default so the browser may restore it, and show a recovery screen.
        const canvas = gl.domElement;
        canvas.addEventListener('webglcontextlost', (e: Event) => {
          e.preventDefault();
          useGameStore.getState().setGraphicsLost(true);
        });
        canvas.addEventListener('webglcontextrestored', () => useGameStore.getState().setGraphicsLost(false));
      }}
      // Far plane reaches the mountains; fog (not the far plane) limits how far the garden is visible.
      camera={{ fov: 70, near: 0.1, far: 500, position: [0, GAME_CONFIG.player.eyeHeight, 45] }}
    >
      <Atmosphere drawDistance={quality.drawDistance} />
      <Garden />
      <NavigationArrows />
      <FlowerField />
      <Clouds />
      <FountainWater />
      <Butterflies />
      <AirParticles />
      <Collectibles />
      <AmbientController />
      <PerformanceMonitor ceiling={autoTierCeiling} touch={touch} />
      <CameraDirector />
      <PlayerController />
      <DesktopInput mouseLook={mouseLook} />
      <InteractionSystem crosshair={mouseLook} />
      {DEBUG_FLAGS.orbit && phase === 'exploring' && <OrbitControls target={[0, 1.5, 0]} makeDefault />}
      <RetroRenderer quality={quality} />
    </Canvas>
  );
}
