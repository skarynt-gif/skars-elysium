import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { GAME_CONFIG } from '../config/gameConfig.ts';
import { addLook, inputState, selectEvents } from '../game/input/inputState.ts';
import { isTap, joystickInput } from '../game/input/joystick.ts';
import { useGameStore } from '../state/gameStore.ts';

/** Left part of the screen moves; the rest looks around. */
const JOYSTICK_ZONE = 0.45;

interface TrackedPointer {
  id: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  startTime: number;
  travel: number;
}

/**
 * Phone and tablet controls:
 *   - left side: a floating joystick appears under the thumb (push fully to run)
 *   - right side: drag to look around; a quick tap selects (arrows, flowers)
 * Both thumbs work at the same time.
 */
export function TouchControls() {
  const phase = useGameStore((s) => s.phase);
  const stick = useRef<TrackedPointer | null>(null);
  const lookPointer = useRef<TrackedPointer | null>(null);
  const baseEl = useRef<HTMLDivElement>(null);
  const knobEl = useRef<HTMLDivElement>(null);
  const [showHint, setShowHint] = useState(true);

  // Clear the joystick if controls hide mid-touch (menu opened, etc.).
  useEffect(() => {
    if (phase !== 'exploring') {
      stick.current = null;
      lookPointer.current = null;
      inputState.joystick = { x: 0, y: 0, run: false };
    }
  }, [phase]);

  if (phase !== 'exploring') return null;

  const track = (e: PointerEvent): TrackedPointer => ({
    id: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    lastX: e.clientX,
    lastY: e.clientY,
    startTime: performance.now(),
    travel: 0,
  });

  const drawStick = (visible: boolean, x = 0, y = 0, knobX = 0, knobY = 0) => {
    if (!baseEl.current || !knobEl.current) return;
    baseEl.current.style.opacity = visible ? '1' : '0';
    baseEl.current.style.transform = `translate(${x}px, ${y}px)`;
    knobEl.current.style.transform = `translate(${knobX}px, ${knobY}px)`;
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setShowHint(false);
    const inJoystickZone = e.clientX < window.innerWidth * JOYSTICK_ZONE;
    if (inJoystickZone && !stick.current) {
      stick.current = track(e);
      drawStick(true, e.clientX, e.clientY);
    } else if (!lookPointer.current) {
      lookPointer.current = track(e);
    }
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const s = stick.current;
    if (s && s.id === e.pointerId) {
      const { move, knob } = joystickInput(e.clientX - s.startX, e.clientY - s.startY);
      inputState.joystick = move;
      drawStick(true, s.startX, s.startY, knob[0], knob[1]);
      return;
    }
    const l = lookPointer.current;
    if (l && l.id === e.pointerId) {
      const dx = e.clientX - l.lastX;
      const dy = e.clientY - l.lastY;
      l.travel += Math.hypot(dx, dy);
      l.lastX = e.clientX;
      l.lastY = e.clientY;
      const { lookSensitivity } = useGameStore.getState().settings;
      const k = (GAME_CONFIG.player.touchLookSweep / window.innerWidth) * lookSensitivity;
      addLook(dx * k, dy * k);
    }
  };

  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    if (stick.current?.id === e.pointerId) {
      stick.current = null;
      inputState.joystick = { x: 0, y: 0, run: false };
      drawStick(false);
    }
    const l = lookPointer.current;
    if (l?.id === e.pointerId) {
      lookPointer.current = null;
      if (e.type === 'pointerup' && isTap(performance.now() - l.startTime, l.travel)) {
        selectEvents.emit({ x: e.clientX, y: e.clientY, source: 'touch' });
      }
    }
  };

  return (
    <div
      className="touch-controls"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      <div ref={baseEl} className="joystick" aria-hidden="true">
        <div ref={knobEl} className="joystick__knob" />
      </div>
      {showHint && (
        <div className="touch-hint" aria-hidden="true">
          <span>◀ DRAG TO WALK</span>
          <span>DRAG TO LOOK ▶</span>
        </div>
      )}
    </div>
  );
}
