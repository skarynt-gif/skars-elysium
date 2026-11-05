import { relockPointer } from '../game/input/DesktopInput.tsx';
import { useGameStore } from '../state/gameStore.ts';

/**
 * Desktop only. While exploring:
 *   mouse captured  → a small pixel crosshair (aim at arrows/flowers, click to select)
 *   mouse released  → "CLICK TO EXPLORE" with a controls reminder
 */
export function ExploreOverlay() {
  const phase = useGameStore((s) => s.phase);
  const locked = useGameStore((s) => s.pointerLocked);
  const panel = useGameStore((s) => s.uiPanel);
  if (phase !== 'exploring' || panel !== 'none') return null;

  if (locked) return <div className="crosshair" aria-hidden="true" />;

  return (
    <div className="explore-prompt" onClick={relockPointer} role="button" tabIndex={0} aria-label="Click to explore">
      <div className="pixel-panel explore-prompt__panel">
        <p className="explore-prompt__title">CLICK TO EXPLORE</p>
        <dl className="explore-prompt__keys">
          <dt>WASD / ARROWS</dt>
          <dd>WALK</dd>
          <dt>SHIFT</dt>
          <dd>RUN</dd>
          <dt>MOUSE</dt>
          <dd>LOOK</dd>
          <dt>CLICK</dt>
          <dd>SELECT</dd>
          <dt>SPACE</dt>
          <dd>PLAY / PAUSE</dd>
          <dt>[ ]</dt>
          <dd>PREV / NEXT SONG</dd>
          <dt>M / O</dt>
          <dd>MUSIC / SETTINGS</dd>
          <dt>ESC</dt>
          <dd>RELEASE MOUSE</dd>
        </dl>
      </div>
    </div>
  );
}
