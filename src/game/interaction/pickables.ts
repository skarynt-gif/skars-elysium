import type { Camera, Object3D, Raycaster, Vector2 } from 'three';

/**
 * Everything the visitor can select (navigation arrows and flowers)
 * registers here. One raycast against all of them means a tap or click
 * always selects the nearest thing under the pointer, never two at once.
 */
export type PickableKind = 'arrow' | 'flower';

export interface Pickable {
  id: string;
  kind: PickableKind;
  /** Invisible hit shape (bigger than the model, so it's easy to tap). */
  object: Object3D;
  label: string;
  /** Farthest distance (meters) at which this can be selected. */
  maxDistance: number;
  onSelect: () => void;
}

const registry = new Map<string, Pickable>();

export function registerPickable(pickable: Pickable): () => void {
  registry.set(pickable.id, pickable);
  return () => {
    if (registry.get(pickable.id) === pickable) registry.delete(pickable.id);
  };
}

export function getPickable(id: string): Pickable | undefined {
  return registry.get(id);
}

export function allPickables(): IterableIterator<Pickable> {
  return registry.values();
}

/** Nearest pickable under a screen point (normalized device coordinates). */
export function pickAt(raycaster: Raycaster, camera: Camera, ndc: Vector2): Pickable | null {
  raycaster.setFromCamera(ndc, camera);
  let best: Pickable | null = null;
  let bestDistance = Infinity;
  for (const p of registry.values()) {
    const hits = raycaster.intersectObject(p.object, false);
    const hit = hits[0];
    if (hit && hit.distance <= p.maxDistance && hit.distance < bestDistance) {
      best = p;
      bestDistance = hit.distance;
    }
  }
  return best;
}
