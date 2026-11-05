import { useEffect, useState } from 'react';
import { suggestLandscape } from '../platform/performanceGovernor.ts';
import { useGameStore } from '../state/gameStore.ts';

/** On phones held upright: a small, dismissable "rotate for the best view" hint. Portrait still works. */
export function OrientationHint({ touch }: { touch: boolean }) {
  const phase = useGameStore((s) => s.phase);
  const [size, setSize] = useState(() => [window.innerWidth, window.innerHeight] as const);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const onResize = () => setSize([window.innerWidth, window.innerHeight]);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (dismissed || phase !== 'exploring' || !suggestLandscape(size[0], size[1], touch)) return null;
  return (
    <button
      type="button"
      className="orientation-hint pixel-panel"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => setDismissed(true)}
      aria-label="Tip: turn your phone sideways for the best view. Tap to dismiss."
    >
      TURN SIDEWAYS FOR THE BEST VIEW <span aria-hidden="true">×</span>
    </button>
  );
}
