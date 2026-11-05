import type { Vec2 } from '../world/layout.ts';

/**
 * Following a route: position by distance travelled, a gentle speed curve
 * (ease in, cruise, ease out), and where the camera should face.
 */
export const TRAVEL = {
  cruiseSpeed: 4.2,
  minSpeed: 0.6,
  easeIn: 1.4,
  easeOut: 2.2,
  /** Look this far ahead along the route when turning, so turns lead into curves. */
  lookAhead: 1.8,
} as const;

export interface Route {
  points: Vec2[];
  /** Cumulative distance at each point. */
  distances: number[];
  length: number;
  /** Yaw to face on arrival (radians), e.g. toward the flower bed. */
  arrivalYaw: number;
}

export function buildRoute(points: readonly Vec2[], arrivalYaw: number): Route {
  const distances = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    distances.push(distances[i - 1]! + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  return { points: [...points], distances, length: distances[distances.length - 1] ?? 0, arrivalYaw };
}

/** Point on the route at a given distance (clamped to the ends). */
export function pointAt(route: Route, s: number): Vec2 {
  const { points, distances, length } = route;
  if (points.length === 1 || s <= 0) return points[0]!;
  if (s >= length) return points[points.length - 1]!;
  let i = 1;
  while (distances[i]! < s) i++;
  const s0 = distances[i - 1]!;
  const s1 = distances[i]!;
  const t = s1 === s0 ? 0 : (s - s0) / (s1 - s0);
  const a = points[i - 1]!;
  const b = points[i]!;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Speed at distance s: eases in from the start and settles at the end. */
export function speedAt(route: Route, s: number): number {
  const fromStart = (s + 0.25) / TRAVEL.easeIn;
  const toEnd = (route.length - s) / TRAVEL.easeOut + 0.12;
  const factor = Math.max(0, Math.min(1, fromStart, toEnd));
  return Math.max(TRAVEL.minSpeed, TRAVEL.cruiseSpeed * factor);
}

/** Yaw that faces from a toward b (0 = north / −z). */
export function yawToward(a: Vec2, b: Vec2): number {
  return Math.atan2(-(b[0] - a[0]), -(b[1] - a[1]));
}

/** Shortest signed difference between two angles. */
export function angleDelta(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

/** Where the camera should be facing at distance s: along the route, blending to the arrival direction. */
export function desiredYaw(route: Route, s: number, currentYaw: number): number {
  const here = pointAt(route, s);
  const ahead = pointAt(route, s + TRAVEL.lookAhead);
  const along = Math.hypot(ahead[0] - here[0], ahead[1] - here[1]) > 0.05 ? yawToward(here, ahead) : currentYaw;
  // Over the final stretch, turn toward the destination's facing.
  const blend = Math.max(0, Math.min(1, 1 - (route.length - s) / TRAVEL.easeOut));
  return along + angleDelta(along, route.arrivalYaw) * blend;
}

export interface TravelState {
  route: Route;
  /** Distance travelled so far. */
  s: number;
}

/** Advances along the route; returns the new state and whether it has arrived. */
export function stepTravel(state: TravelState, dt: number): { state: TravelState; arrived: boolean; speed: number } {
  const speed = speedAt(state.route, state.s);
  const s = Math.min(state.route.length, state.s + speed * Math.max(0, dt));
  return { state: { ...state, s }, arrived: s >= state.route.length - 1e-6, speed };
}
