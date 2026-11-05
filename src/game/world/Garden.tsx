import { useEffect, useMemo } from 'react';
import { GAME_CONFIG } from '../../config/gameConfig.ts';
import { useGameStore } from '../../state/gameStore.ts';
import { sunDirection } from './atmosphere.ts';
import { Decorations } from './Decorations.tsx';
import { EntranceGate } from './EntranceGate.tsx';
import { FlowerBeds } from './FlowerBeds.tsx';
import { Ground } from './Ground.tsx';
import { Grove } from './Grove.tsx';
import { Landmarks } from './Landmarks.tsx';
import { assignBeds } from './layout.ts';
import { Mountains } from './Mountains.tsx';
import { Sanctuary } from './Sanctuary.tsx';
import { Sky } from './Sky.tsx';
import { Vegetation } from './Vegetation.tsx';

/** The whole explorable world. */
export function Garden() {
  const content = useGameStore((s) => s.content);
  const collections = content.status === 'ready' ? content.manifest.collections : null;
  const assignment = useMemo(() => assignBeds(collections ?? []), [collections]);

  useEffect(() => {
    if (assignment.overflow.length) {
      console.warn(
        `[garden] No free bed for: ${assignment.overflow.map((c) => c.id).join(', ')}. ` +
          'Add more plots in layout.ts or move these collections to another area.',
      );
    }
  }, [assignment]);

  const sun = sunDirection();
  const { palette } = GAME_CONFIG;

  return (
    <>
      <hemisphereLight args={[palette.hemiSky, palette.hemiGround, 1.15]} />
      {/* Low warm sun; no real-time shadows (blob shadows instead), like the era. */}
      <directionalLight position={[sun[0] * 60, sun[1] * 60 + 8, sun[2] * 60]} color={palette.sunLight} intensity={1.7} />

      <Sky />
      <Mountains />
      <Ground />
      <Landmarks />
      <Vegetation />
      <Decorations />
      <FlowerBeds assignment={assignment} />
      <Sanctuary epTitle={assignment.sanctuary.find((b) => b.collection)?.collection?.title ?? null} />
      <Grove />
      <EntranceGate />
    </>
  );
}
