import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Raycaster, Vector2, Vector3 } from 'three';
import { useGameStore, type Focus } from '../../state/gameStore.ts';
import { flowerFocus, flowerIndex } from '../flowers/flowerIndex.ts';
import { chooseFlowerFocus } from '../flowers/focus.ts';
import { selectEvents } from '../input/inputState.ts';
import { playerPose } from '../player/playerPose.ts';
import { allPickables, getPickable, pickAt, type Pickable } from './pickables.ts';

/** Touch: hint for arrows within this distance that are roughly in view. */
const TOUCH_HINT_RANGE = 7;
const TOUCH_HINT_CONE = Math.cos((50 * Math.PI) / 180);

const SELECT_KEYS = new Set(['KeyE', 'Enter', 'NumpadEnter']);

/** Selects whatever is currently focused (used by E, Enter and the touch button). */
export function selectFocused(): void {
  const { focus, phase, uiPanel } = useGameStore.getState();
  if (phase !== 'exploring' || uiPanel !== 'none' || !focus) return;
  getPickable(focus.id)?.onSelect();
}

/**
 * Decides what the visitor is focused on each frame, in priority order:
 *   1. desktop: whatever is under the crosshair (arrow or flower)
 *   2. the nearest flower in front, within reach (walk up to a flower)
 *   3. touch: the nearest arrow ahead, as a hint
 * and runs selections from clicks, taps and the E key.
 */
export function InteractionSystem({ crosshair }: { crosshair: boolean }) {
  const camera = useThree((s) => s.camera);
  const canvas = useThree((s) => s.gl.domElement);
  const raycaster = useMemo(() => new Raycaster(), []);
  const ndc = useMemo(() => new Vector2(), []);
  const scratch = useMemo(() => new Vector3(), []);
  const scratchPos = useMemo(() => new Vector3(), []);

  // Clicks and taps select what's under the pointer; a desktop click with
  // nothing under the crosshair still selects the flower you're standing at.
  useEffect(
    () =>
      selectEvents.on(({ x, y, source }) => {
        if (useGameStore.getState().phase !== 'exploring') return;
        const rect = canvas.getBoundingClientRect();
        ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
        const hit = pickAt(raycaster, camera, ndc);
        if (hit) hit.onSelect();
        else if (source !== 'touch' && useGameStore.getState().focus?.kind === 'flower') selectFocused();
      }),
    [camera, canvas, ndc, raycaster],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!SELECT_KEYS.has(e.code) || e.repeat) return;
      selectFocused();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useFrame(() => {
    const store = useGameStore.getState();
    if (store.phase !== 'exploring' || !playerPose.active) {
      store.setFocus(null);
      return;
    }

    let focus: Focus | null = null;
    const asFocus = (p: Pickable): Focus => {
      if (p.kind === 'flower') {
        const planting = flowerIndex.plantings.find((f) => `flower:${f.song.id}` === p.id);
        if (planting) return flowerFocus(planting);
      }
      return { kind: p.kind, id: p.id, label: p.label };
    };

    // 1. Crosshair
    if (crosshair && store.pointerLocked) {
      ndc.set(0, 0);
      const hit = pickAt(raycaster, camera, ndc);
      if (hit) focus = asFocus(hit);
    }

    // 2. Walk-up flower focus
    if (!focus) {
      const i = chooseFlowerFocus(playerPose.position, playerPose.yaw, flowerIndex.positions);
      const planting = i >= 0 ? flowerIndex.plantings[i] : undefined;
      if (planting) focus = flowerFocus(planting);
    }

    // 3. Touch arrow hint
    if (!focus && !crosshair) {
      const forward = camera.getWorldDirection(scratch);
      let best = TOUCH_HINT_RANGE;
      for (const p of allPickables()) {
        if (p.kind !== 'arrow') continue;
        const pos = p.object.getWorldPosition(scratchPos);
        const dx = pos.x - camera.position.x;
        const dz = pos.z - camera.position.z;
        const d = Math.hypot(dx, dz);
        if (d >= best || d < 0.5) continue;
        const facing = (dx * forward.x + dz * forward.z) / (d * Math.hypot(forward.x, forward.z) || 1);
        if (facing < TOUCH_HINT_CONE) continue;
        best = d;
        focus = asFocus(p);
      }
    }

    store.setFocus(focus);
  });

  return null;
}
