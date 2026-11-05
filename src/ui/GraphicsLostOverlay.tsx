import { useEffect, useState } from 'react';
import { useGameStore } from '../state/gameStore.ts';

/**
 * Shown if the browser drops the 3D graphics (usually low memory on phones).
 * The browser normally restores them within a moment; if not, offer a reload.
 */
export function GraphicsLostOverlay() {
  const lost = useGameStore((s) => s.graphicsLost);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!lost) {
      setSlow(false);
      return;
    }
    const timer = window.setTimeout(() => setSlow(true), 4000);
    return () => window.clearTimeout(timer);
  }, [lost]);

  if (!lost) return null;
  return (
    <div className="panel-backdrop graphics-lost" role="alert">
      <div className="pixel-panel graphics-lost__panel">
        <p className="graphics-lost__title">RESTORING GRAPHICS…</p>
        {slow && (
          <>
            <p className="graphics-lost__text">YOUR DEVICE RAN LOW ON MEMORY. RELOADING USUALLY FIXES IT.</p>
            <button type="button" className="pixel-button pixel-button--text pixel-button--primary" onClick={() => window.location.reload()}>
              RELOAD THE GARDEN
            </button>
          </>
        )}
      </div>
    </div>
  );
}
