import type { MoveInput } from '../player/movement.ts';

/**
 * Maps held keys to movement. Uses physical key codes (KeyW, not "w"), so
 * WASD works on AZERTY and other layouts too.
 */
const FORWARD = ['KeyW', 'ArrowUp'];
const BACK = ['KeyS', 'ArrowDown'];
const LEFT = ['KeyA', 'ArrowLeft'];
const RIGHT = ['KeyD', 'ArrowRight'];
const RUN = ['ShiftLeft', 'ShiftRight'];

export const MOVEMENT_KEYS = new Set([...FORWARD, ...BACK, ...LEFT, ...RIGHT, ...RUN]);

export function keysToMove(held: ReadonlySet<string>): MoveInput {
  const any = (codes: string[]) => codes.some((c) => held.has(c));
  return {
    x: (any(RIGHT) ? 1 : 0) - (any(LEFT) ? 1 : 0),
    y: (any(FORWARD) ? 1 : 0) - (any(BACK) ? 1 : 0),
    run: any(RUN),
  };
}
