import { useGameStore } from '../../state/gameStore.ts';
import { playerPose } from '../player/playerPose.ts';
import { planTravel } from './arrows.ts';
import type { TravelState } from './travel.ts';

/**
 * The current auto-walk, if any. The player controller advances it each
 * frame; any movement input cancels it.
 */
export const travel: {
  current: TravelState | null;
  /** Set when the visitor looks around mid-trip: stop steering their view. */
  userSteering: boolean;
} = { current: null, userSteering: false };

export function startTravel(destination: string, label: string): boolean {
  const { groveFound, setTravelLabel } = useGameStore.getState();
  const route = planTravel(playerPose.position, destination, groveFound);
  if (!route || route.length < 0.3) return false;
  travel.current = { route, s: 0 };
  travel.userSteering = false;
  setTravelLabel(label);
  return true;
}

export function stopTravel(): void {
  if (!travel.current) return;
  travel.current = null;
  useGameStore.getState().setTravelLabel(null);
}
