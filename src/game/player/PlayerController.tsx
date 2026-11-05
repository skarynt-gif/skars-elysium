import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { GAME_CONFIG } from '../../config/gameConfig.ts';
import { DEBUG_FLAGS } from '../../platform/flags.ts';
import { useGameStore } from '../../state/gameStore.ts';
import { currentMove, takeLook } from '../input/inputState.ts';
import { insideGrove } from '../navigation/arrows.ts';
import { angleDelta, desiredYaw, pointAt, stepTravel } from '../navigation/travel.ts';
import { stopTravel, travel } from '../navigation/travelState.ts';
import { resolveCollisions } from './collision.ts';
import { INTRO } from '../intro/introTimeline.ts';
import { WORLD } from '../world/layout.ts';
import { useColliders } from '../world/useGardenSettings.ts';
import type { CollisionWorld } from './collision.ts';
import { stepBob, type BobState } from './headBob.ts';
import { applyLook, lookAtAngles, type LookState } from './look.ts';
import { basis, stepMovement, type MovementConfig, type PlayerState } from './movement.ts';
import { playerPose } from './playerPose.ts';

const P = GAME_CONFIG.player;
const MOVEMENT: MovementConfig = {
  walkSpeed: P.walkSpeed,
  runSpeed: P.runSpeed,
  acceleration: P.acceleration,
  deceleration: P.deceleration,
  radius: P.radius,
};

/**
 * First-person controller. Takes over the camera from the intro exactly where
 * it ended, so there is no visible jump. There is no player model: the camera
 * is the visitor's eyes.
 */
export function PlayerController() {
  const camera = useThree((s) => s.camera);
  const player = useRef<PlayerState | null>(null);
  const look = useRef<LookState>({ yaw: 0, pitch: 0 });
  const bob = useRef<BobState>({ phase: 0, intensity: 0 });
  // Fixed landmarks plus any decorations placed in the Creator Studio.
  const colliders = useColliders();
  const COLLISION_WORLD = useMemo<CollisionWorld>(() => ({ colliders, walkRadius: WORLD.walkRadius }), [colliders]);

  useFrame((_, delta) => {
    const { phase, settings } = useGameStore.getState();
    if (phase !== 'exploring' || DEBUG_FLAGS.orbit) {
      player.current = null;
      playerPose.active = false;
      takeLook(); // discard look input made during menus/cutscenes
      stopTravel();
      return;
    }

    if (!player.current) {
      const from: [number, number, number] = [camera.position.x, camera.position.y, camera.position.z];
      look.current = lookAtAngles(from, [...INTRO.lookAt]);
      player.current = { position: [camera.position.x, camera.position.z], velocity: [0, 0], yaw: look.current.yaw };
    }

    // Long frames (tab switch, hitch) are capped; movement also sub-steps internally.
    const dt = Math.min(delta, 0.25);

    const lookDelta = takeLook();
    look.current = applyLook(look.current, lookDelta.yaw, lookDelta.pitch, settings.invertY);

    const move = currentMove();
    // Any movement input takes back control immediately.
    if (travel.current && (move.x !== 0 || move.y !== 0)) stopTravel();
    // Looking around mid-trip is fine; we just stop steering the view.
    if (travel.current && (lookDelta.yaw !== 0 || lookDelta.pitch !== 0)) travel.userSteering = true;

    const before = player.current.position;
    let next: PlayerState;
    if (travel.current) {
      const step = stepTravel(travel.current, dt);
      const target = pointAt(step.state.route, step.state.s);
      const position = resolveCollisions(target, P.radius, COLLISION_WORLD);
      const velocity: [number, number] = [(position[0] - before[0]) / dt, (position[1] - before[1]) / dt];
      if (!travel.userSteering) {
        const ease = 1 - Math.exp(-5 * dt);
        const yaw = look.current.yaw + angleDelta(look.current.yaw, desiredYaw(step.state.route, step.state.s, look.current.yaw)) * ease;
        // Settle the gaze just below the horizon so the path ahead stays in view.
        const pitch = look.current.pitch + (-0.05 - look.current.pitch) * ease;
        look.current = { yaw: Math.atan2(Math.sin(yaw), Math.cos(yaw)), pitch };
      }
      travel.current = step.state;
      if (step.arrived) stopTravel();
      next = { position, velocity: step.arrived ? [0, 0] : velocity, yaw: look.current.yaw };
    } else {
      next = stepMovement({ ...player.current, yaw: look.current.yaw }, move, dt, MOVEMENT, COLLISION_WORLD);
    }
    player.current = next;

    // Walking into the hidden grove reveals its arrow from now on.
    if (!useGameStore.getState().groveFound && insideGrove(next.position)) {
      useGameStore.getState().discoverGrove();
    }

    const moved = Math.hypot(next.position[0] - before[0], next.position[1] - before[1]);
    const speed = Math.hypot(...next.velocity);
    const b = stepBob(bob.current, moved, speed, { walk: P.walkSpeed, run: P.runSpeed }, dt, settings.headBob);
    bob.current = b.state;

    const { right } = basis(look.current.yaw);
    camera.position.set(
      next.position[0] + right[0] * b.offset.x,
      P.eyeHeight + b.offset.y,
      next.position[1] + right[1] * b.offset.x,
    );
    camera.rotation.set(look.current.pitch, look.current.yaw, 0, 'YXZ');

    playerPose.position = next.position;
    playerPose.yaw = look.current.yaw;
    playerPose.pitch = look.current.pitch;
    playerPose.speed = speed;
    playerPose.active = true;
  });

  return null;
}
