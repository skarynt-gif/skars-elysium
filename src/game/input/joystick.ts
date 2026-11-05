import type { MoveInput } from '../player/movement.ts';

/**
 * Virtual joystick math. The joystick appears wherever the thumb lands
 * (floating stick), so it works for any hand size and grip.
 */
export const JOYSTICK = {
  /** Max knob travel in CSS pixels. */
  radius: 56,
  /** Ignore tiny thumb drift near the center (fraction of radius). */
  deadZone: 0.15,
  /** Pushing past this fraction of the radius = run. */
  runThreshold: 0.92,
} as const;

/**
 * Converts the thumb's offset from where it landed (screen pixels, y down)
 * into movement input, plus the clamped knob offset for drawing.
 */
export function joystickInput(dx: number, dy: number, config = JOYSTICK): { move: MoveInput; knob: [number, number] } {
  const distance = Math.hypot(dx, dy);
  const clamped = Math.min(distance, config.radius);
  const nx = distance > 0 ? dx / distance : 0;
  const ny = distance > 0 ? dy / distance : 0;
  const knob: [number, number] = [nx * clamped, ny * clamped];

  const raw = clamped / config.radius;
  if (raw < config.deadZone) return { move: { x: 0, y: 0, run: false }, knob };

  // Rescale so movement starts smoothly from zero just outside the dead zone.
  const strength = (raw - config.deadZone) / (1 - config.deadZone);
  return {
    // Screen y points down; forward is up.
    move: { x: nx * strength, y: -ny * strength, run: raw >= config.runThreshold },
    knob,
  };
}

/** A touch counts as a tap (select an arrow/flower) if it was short and barely moved. */
export function isTap(durationMs: number, travelPx: number): boolean {
  return durationMs < 300 && travelPx < 12;
}
