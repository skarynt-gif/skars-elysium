import { useMemo } from 'react';
import type { Decoration, GardenEnvironment } from '../../content/types.ts';
import { useGameStore } from '../../state/gameStore.ts';
import { decorationColliders } from './decorations.ts';
import { DEFAULT_ENVIRONMENT } from './environment.ts';
import { COLLIDERS, type Collider } from './layout.ts';

const NO_DECORATIONS: Decoration[] = [];

/** Decorations placed in the Creator Studio (none until the song list loads). */
export function useDecorations(): Decoration[] {
  return useGameStore((s) => (s.content.status === 'ready' ? s.content.manifest.garden?.decorations ?? NO_DECORATIONS : NO_DECORATIONS));
}

export function useEnvironment(): GardenEnvironment {
  return useGameStore((s) => (s.content.status === 'ready' ? s.content.manifest.garden?.environment ?? DEFAULT_ENVIRONMENT : DEFAULT_ENVIRONMENT));
}

/** Everything solid: the fixed garden plus the Studio's decorations. */
export function useColliders(): readonly Collider[] {
  const decorations = useDecorations();
  return useMemo(() => (decorations.length ? [...COLLIDERS, ...decorations.flatMap(decorationColliders)] : COLLIDERS), [decorations]);
}
