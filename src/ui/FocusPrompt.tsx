import { selectFocused } from '../game/interaction/InteractionSystem.tsx';
import { useGameStore } from '../state/gameStore.ts';

/**
 * Retro game prompt near the bottom of the screen:
 *   at a flower        → "♪ SLOW BURN · ARTIST   [E] LISTEN"  (touch: a LISTEN button)
 *   aiming at an arrow → "▶ VELVET HOURS  [CLICK]"
 *   auto-walking       → "TRAVELING TO VELVET HOURS · MOVE TO STOP"
 */
export function FocusPrompt({ touch }: { touch: boolean }) {
  const phase = useGameStore((s) => s.phase);
  const focus = useGameStore((s) => s.focus);
  const travelLabel = useGameStore((s) => s.travelLabel);
  if (phase !== 'exploring') return null;

  if (travelLabel) {
    return (
      <div className="focus-prompt" role="status">
        <span className="focus-prompt__label">TRAVELING TO {travelLabel.toUpperCase()}</span>
        <span className="focus-prompt__hint">MOVE TO STOP</span>
      </div>
    );
  }

  if (!focus) return null;

  if (focus.kind === 'flower') {
    return (
      <div className="focus-prompt focus-prompt--flower" role="status">
        <span className="focus-prompt__text">
          <span className="focus-prompt__label">♪ {focus.label.toUpperCase()}</span>
          {focus.detail && <span className="focus-prompt__detail">{focus.detail}</span>}
        </span>
        {touch ? (
          <button
            type="button"
            className="focus-prompt__button"
            onPointerDown={(e) => {
              // Don't let the tap fall through to the look/joystick layer.
              e.stopPropagation();
              selectFocused();
            }}
          >
            {focus.action}
          </button>
        ) : (
          <span className="focus-prompt__hint">[E] {focus.action}</span>
        )}
      </div>
    );
  }

  return (
    <div className="focus-prompt" role="status">
      <span className="focus-prompt__label">▶ {focus.label.toUpperCase()}</span>
      <span className="focus-prompt__hint">[{touch ? 'TAP ARROW' : 'CLICK'}]</span>
    </div>
  );
}
