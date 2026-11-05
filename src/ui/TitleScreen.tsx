import { useCallback, useEffect, useState } from 'react';
import { GAME_CONFIG } from '../config/gameConfig.ts';
import { introClock } from '../game/intro/introClock.ts';
import { startGesture } from '../platform/startGesture.ts';
import { hasVisitedBefore } from '../platform/visitMemory.ts';
import { useGameStore } from '../state/gameStore.ts';

const IGNORED_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'Escape']);

/**
 * Artist name over the closed gates, then a blinking PRESS START.
 * The press itself is the browser "user gesture" that later stages rely on
 * (audio unlock, mouse capture), so it runs startGesture synchronously.
 */
export function TitleScreen({ touch }: { touch: boolean }) {
  const phase = useGameStore((s) => s.phase);
  const content = useGameStore((s) => s.content);
  const setPhase = useGameStore((s) => s.setPhase);
  const [returning] = useState(() => hasVisitedBefore());

  const start = useCallback(() => {
    const current = useGameStore.getState().phase;
    if (current === 'title') {
      startGesture.run();
      setPhase('entering');
    } else if (current === 'entering' && returning) {
      introClock.skipRequested = true;
    }
  }, [returning, setPhase]);

  useEffect(() => {
    if (phase !== 'title' && phase !== 'entering') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || IGNORED_KEYS.has(e.key)) return;
      start();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, start]);

  if (phase === 'exploring' || phase === 'paused') return null;

  const leaving = phase === 'entering';
  const prompt = touch ? 'TAP TO START' : 'PRESS START';

  return (
    <div
      className={`title-screen${leaving ? ' title-screen--leaving' : ''}`}
      onPointerDown={start}
      role="button"
      aria-label={phase === 'title' ? `${prompt}: enter the garden` : undefined}
      tabIndex={0}
    >
      <div className="title-screen__vignette" />
      <div className="title-screen__logo">
        <div className="greek-key" aria-hidden="true" />
        <h1 className="title-screen__name">{GAME_CONFIG.gameTitle}</h1>
        <div className="greek-key" aria-hidden="true" />
      </div>

      <div className="title-screen__bottom">
        {phase === 'booting' && <p className="title-screen__loading">LOADING</p>}
        {phase === 'title' && <p className="title-screen__prompt">{prompt}</p>}
        {leaving && returning && <p className="title-screen__skip">{touch ? 'TAP' : 'PRESS ANY KEY'} TO SKIP</p>}
        {content.status === 'failed' && phase === 'title' && (
          <p className="title-screen__notice">The song list couldn't load. The garden is open, but beds may be empty.</p>
        )}
      </div>
    </div>
  );
}
