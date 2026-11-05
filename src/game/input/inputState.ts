import { createEmitter } from '../../lib/emitter.ts';
import type { MoveInput } from '../player/movement.ts';
import { keysToMove } from './keyboard.ts';

/**
 * Raw input from every device, gathered in one place and read once per
 * frame by the player controller. Mutable on purpose: input changes far too
 * often for React state.
 */
export const inputState = {
  keys: new Set<string>(),
  joystick: { x: 0, y: 0, run: false } as MoveInput,
  /** Look deltas (radians) accumulated since the last frame. */
  pendingYaw: 0,
  pendingPitch: 0,
};

/** Keyboard wins when both are in use; otherwise the touch joystick. */
export function currentMove(): MoveInput {
  const keys = keysToMove(inputState.keys);
  if (keys.x !== 0 || keys.y !== 0) return keys;
  return inputState.joystick;
}

export function addLook(yaw: number, pitch: number): void {
  inputState.pendingYaw += yaw;
  inputState.pendingPitch += pitch;
}

export function takeLook(): { yaw: number; pitch: number } {
  const delta = { yaw: inputState.pendingYaw, pitch: inputState.pendingPitch };
  inputState.pendingYaw = 0;
  inputState.pendingPitch = 0;
  return delta;
}

/** Clears everything, e.g. when the window loses focus mid-keypress. */
export function resetInput(): void {
  inputState.keys.clear();
  inputState.joystick = { x: 0, y: 0, run: false };
  takeLook();
}

/**
 * A "select" action at a screen point: a tap on mobile, or a click at the
 * crosshair on desktop. Navigation arrows and flowers
 * listen for these. Coordinates are CSS pixels.
 */
export const selectEvents = createEmitter<{ x: number; y: number; source: 'touch' | 'mouse' | 'key' }>();
