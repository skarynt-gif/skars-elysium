import { useGameStore } from '../state/gameStore.ts';
import { PixelIcon } from './icons.tsx';
import { openPlayerPanel } from './player/MusicPlayer.tsx';

/** Opens the settings menu (desktop: frees the mouse). */
export function openMenu(): void {
  useGameStore.getState().setUiPanel('menu');
  if (document.pointerLockElement) document.exitPointerLock();
}

/**
 * Small corner buttons: settings, and a music button that brings the player
 * back after it was hidden. Always reachable on phones; on desktop they're
 * clickable whenever the mouse is free.
 */
export function HudButtons() {
  const phase = useGameStore((s) => s.phase);
  const panel = useGameStore((s) => s.uiPanel);
  const playerOpen = useGameStore((s) => s.playerOpen);
  const hasSong = useGameStore((s) => s.currentSongId !== null);
  if (phase !== 'exploring' || panel !== 'none') return null;

  return (
    <nav className="hud-buttons" aria-label="Game menu" onPointerDown={(e) => e.stopPropagation()}>
      {hasSong && !playerOpen && (
        <button type="button" className="pixel-button" onClick={openPlayerPanel} aria-label="Show music player">
          <PixelIcon name="note" size={18} />
        </button>
      )}
      <button type="button" className="pixel-button" onClick={openMenu} aria-label="Settings">
        <PixelIcon name="menu" size={18} />
      </button>
    </nav>
  );
}
