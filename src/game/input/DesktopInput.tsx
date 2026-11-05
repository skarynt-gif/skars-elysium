import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { GAME_CONFIG } from '../../config/gameConfig.ts';
import { startGesture } from '../../platform/startGesture.ts';
import { useGameStore } from '../../state/gameStore.ts';
import { MOVEMENT_KEYS } from './keyboard.ts';
import { addLook, inputState, resetInput, selectEvents } from './inputState.ts';

/** Browsers can report a huge jump on the first mouse move after locking; ignore those. */
const MAX_MOUSE_JUMP = 250;

function requestLock(element: HTMLElement) {
  try {
    // Newer browsers return a promise that rejects if locking is refused
    // (e.g. relocking too soon after Esc); that's harmless here.
    const result = element.requestPointerLock() as unknown as Promise<void> | undefined;
    result?.catch?.(() => {});
  } catch {
    // Pointer lock unsupported: the visitor can still move with the keyboard.
  }
}

/**
 * Keyboard movement and mouse-look (pointer lock) for desktop.
 * Touch devices use <TouchControls/> instead, but keyboards attached to
 * tablets still work through the keyboard half of this.
 */
export function DesktopInput({ mouseLook }: { mouseLook: boolean }) {
  const canvas = useThree((s) => s.gl.domElement);

  // --- Keyboard
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (!MOVEMENT_KEYS.has(e.code)) return;
      if (useGameStore.getState().phase !== 'exploring') return;
      inputState.keys.add(e.code);
      // Stop arrow keys from scrolling anything.
      if (e.code.startsWith('Arrow')) e.preventDefault();
    };
    const onUp = (e: KeyboardEvent) => inputState.keys.delete(e.code);
    const onBlur = () => resetInput();
    const onVisibility = () => document.hidden && resetInput();
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // --- Mouse look via pointer lock
  useEffect(() => {
    if (!mouseLook) return;

    // PRESS START is a real click/keypress, so the mouse can be captured right then.
    const offStart = startGesture.onStart(() => requestLock(canvas));

    const onLockChange = () => {
      const locked = document.pointerLockElement === canvas;
      useGameStore.getState().setPointerLocked(locked);
      if (!locked) resetInput();
    };
    const onMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return;
      if (Math.abs(e.movementX) > MAX_MOUSE_JUMP || Math.abs(e.movementY) > MAX_MOUSE_JUMP) return;
      const { lookSensitivity } = useGameStore.getState().settings;
      const k = GAME_CONFIG.player.mouseLookSpeed * lookSensitivity;
      addLook(e.movementX * k, e.movementY * k);
    };
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0 || useGameStore.getState().phase !== 'exploring') return;
      if (document.pointerLockElement === canvas) {
        // Clicking while exploring selects whatever is under the crosshair.
        const rect = canvas.getBoundingClientRect();
        selectEvents.emit({ x: rect.width / 2, y: rect.height / 2, source: 'mouse' });
      } else {
        requestLock(canvas);
      }
    };

    document.addEventListener('pointerlockchange', onLockChange);
    document.addEventListener('mousemove', onMove);
    canvas.addEventListener('mousedown', onMouseDown);
    return () => {
      offStart();
      document.removeEventListener('pointerlockchange', onLockChange);
      document.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mousedown', onMouseDown);
    };
  }, [canvas, mouseLook]);

  return null;
}

/** Lets the "click to explore" overlay recapture the mouse. */
export function relockPointer(): void {
  const canvas = document.querySelector<HTMLCanvasElement>('.game-canvas canvas');
  if (canvas) requestLock(canvas);
}
