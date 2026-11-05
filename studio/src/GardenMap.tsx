/**
 * Top-down map of the garden, drawn from the game's own floor plan
 * (src/game/world/layout.ts), so what you arrange here is exactly where things
 * appear in the game. North (the EP sanctuary) is at the top; the entrance
 * gate is at the bottom.
 */
import type { ReactNode } from 'react';
import {
  BOUNDARY_HEDGES,
  COLUMNS,
  CYPRESS_AVENUE,
  GROVE_RING,
  OLIVE_TREES,
  PATHS,
  SANCTUARY_BED,
  STATUES,
  WORLD,
  type BedAssignment,
} from '../../src/game/world/layout.ts';
import { spotName } from './mapData.ts';

export { draftAssignment, spotName, toCollections } from './mapData.ts';

const VIEW = { minX: -40.5, minZ: -40.5, width: 81, height: 88 };
const short = (title: string, max = 14) => (title.length > max ? `${title.slice(0, max - 1)}…` : title);

export interface MapProps {
  assignment: BedAssignment;
  selectedBedId?: string | null;
  /** Clicked a bed spot (main or sanctuary). */
  onSpot?: (spotId: string, collectionId: string | null) => void;
  /** Clicked anywhere on the ground (world x/z), for placing things. */
  onGround?: (x: number, z: number) => void;
  /** Pointer moved over the map (world x/z), or left it (null). */
  onHover?: (point: [number, number] | null) => void;
  /** Extra drawings on top (decorations). Coordinates are world meters. */
  children?: ReactNode;
  label?: string;
}

export function GardenMap({ assignment, selectedBedId, onSpot, onGround, onHover, children, label = 'Garden map' }: MapProps) {
  const toWorld = (e: { clientX: number; clientY: number; currentTarget: Element }): [number, number] => {
    const svg = (e.currentTarget as SVGElement).ownerSVGElement ?? (e.currentTarget as SVGSVGElement);
    const box = svg.getBoundingClientRect();
    const x = VIEW.minX + ((e.clientX - box.left) / box.width) * VIEW.width;
    const z = VIEW.minZ + ((e.clientY - box.top) / box.height) * VIEW.height;
    return [Math.round(x * 10) / 10, Math.round(z * 10) / 10];
  };
  const clickGround = (e: { clientX: number; clientY: number; currentTarget: Element }) => {
    if (onGround) onGround(...toWorld(e));
  };
  const spotProps = (spotId: string, collectionId: string | null, title: string) =>
    onSpot
      ? {
          role: 'button',
          tabIndex: 0,
          'aria-label': title,
          onClick: (e: { stopPropagation(): void }) => {
            e.stopPropagation();
            onSpot(spotId, collectionId);
          },
          onKeyDown: (e: { key: string; preventDefault(): void }) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSpot(spotId, collectionId);
            }
          },
        }
      : {};

  const { sanctuary, grove } = WORLD;
  return (
    <svg
      className="map"
      viewBox={`${VIEW.minX} ${VIEW.minZ} ${VIEW.width} ${VIEW.height}`}
      role="img"
      aria-label={label}
      onPointerMove={onHover ? (e: { clientX: number; clientY: number; currentTarget: Element }) => onHover(toWorld(e)) : undefined}
      onPointerLeave={onHover ? () => onHover(null) : undefined}
    >
      <defs>
        <radialGradient id="map-grass" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="#5e7a3e" />
          <stop offset="100%" stopColor="#3f5a2c" />
        </radialGradient>
      </defs>

      {/* Ground (clickable when placing) */}
      <circle cx={0} cy={0} r={WORLD.boundaryRadius} fill="url(#map-grass)" onClick={clickGround} className={onGround ? 'map__ground--placing' : undefined} />
      {BOUNDARY_HEDGES.map((h, i) => (
        <circle key={i} cx={h.position[0]} cy={h.position[1]} r={0.9} fill="#2c4422" pointerEvents="none" />
      ))}

      <g pointerEvents="none">
        {PATHS.map((p) => (
          <line key={p.id} x1={p.from[0]} y1={p.from[1]} x2={p.to[0]} y2={p.to[1]} stroke="#cdb48a" strokeWidth={p.width} />
        ))}
        <line x1={WORLD.groveTrail.from[0]} y1={WORLD.groveTrail.from[1]} x2={WORLD.groveTrail.to[0]} y2={WORLD.groveTrail.to[1]} stroke="#8a7a52" strokeWidth={1.2} strokeDasharray="0.8 0.6" />
        <circle cx={0} cy={0} r={WORLD.plazaRadius} fill="#e3d6bc" />
        <circle cx={0} cy={0} r={WORLD.fountainRadius} fill="#6fb7c9" stroke="#f4ecdc" strokeWidth={0.5} />
        {COLUMNS.map((c, i) => (
          <circle key={`c${i}`} cx={c.position[0]} cy={c.position[1]} r={0.55} fill="#f4ecdc" />
        ))}
        {STATUES.map((s, i) => (
          <rect key={`s${i}`} x={s.position[0] - 0.6} y={s.position[1] - 0.6} width={1.2} height={1.2} fill="#f4ecdc" />
        ))}
        {[...CYPRESS_AVENUE, ...GROVE_RING].map((t, i) => (
          <circle key={`t${i}`} cx={t.position[0]} cy={t.position[1]} r={0.75} fill="#24391d" />
        ))}
        {OLIVE_TREES.map((t, i) => (
          <circle key={`o${i}`} cx={t.position[0]} cy={t.position[1]} r={1.4} fill="#6d8a4c" opacity={0.85} />
        ))}
        {/* Entrance gate */}
        <rect x={-WORLD.gate.pillarX - 0.5} y={WORLD.gate.z - 0.5} width={1} height={1} fill="#e8c15a" />
        <rect x={WORLD.gate.pillarX - 0.5} y={WORLD.gate.z - 0.5} width={1} height={1} fill="#e8c15a" />
        <text x={0} y={WORLD.gate.z + 4} className="map__note">
          ENTRANCE
        </text>
        {/* Sanctuary walls */}
        <rect
          x={sanctuary.center[0] - sanctuary.width / 2}
          y={sanctuary.center[1] - sanctuary.depth / 2}
          width={sanctuary.width}
          height={sanctuary.depth}
          fill="#d9c9a6"
          stroke="#e8c15a"
          strokeWidth={0.6}
        />
        <text x={0} y={sanctuary.center[1] - sanctuary.depth / 2 - 1.2} className="map__note">
          EP SANCTUARY
        </text>
      </g>

      {/* Main beds */}
      {assignment.main.map(({ plot, collection }) => {
        const selected = collection && collection.id === selectedBedId;
        const pinned = Boolean(collection?.plot === plot.id);
        return (
          <g
            key={plot.id}
            className={`map__spot${selected ? ' map__spot--selected' : ''}${collection ? '' : ' map__spot--free'}`}
            {...spotProps(plot.id, collection?.id ?? null, collection ? `${collection.title}, ${spotName(plot.id)}` : `Empty spot, ${spotName(plot.id)}`)}
          >
            <rect
              x={-WORLD.bed.width / 2}
              y={-WORLD.bed.depth / 2}
              width={WORLD.bed.width}
              height={WORLD.bed.depth}
              transform={`translate(${plot.center[0]} ${plot.center[1]}) rotate(${plot.angle})`}
              className="map__bed"
            />
            <text x={plot.center[0]} y={plot.center[1] + 0.5} className="map__label">
              {collection ? short(collection.title) : 'empty'}
            </text>
            {pinned && <circle cx={plot.center[0]} cy={plot.center[1] - 2.6} r={0.6} className="map__pin" />}
          </g>
        );
      })}

      {/* Sanctuary beds */}
      {assignment.sanctuary.map(({ plot, collection }) => {
        const selected = collection && collection.id === selectedBedId;
        return (
          <g
            key={plot.id}
            className={`map__spot${selected ? ' map__spot--selected' : ''}${collection ? '' : ' map__spot--free'}`}
            {...spotProps(plot.id, collection?.id ?? null, collection ? `${collection.title}, ${spotName(plot.id)}` : `Empty spot, ${spotName(plot.id)}`)}
          >
            <rect
              x={plot.center[0] - SANCTUARY_BED.width / 2}
              y={plot.center[1] - SANCTUARY_BED.depth / 2}
              width={SANCTUARY_BED.width}
              height={SANCTUARY_BED.depth}
              className="map__bed map__bed--gold"
            />
            {collection && (
              // Center bed's name above it, side beds' below, so neighbours never overlap.
              <text
                x={plot.center[0]}
                y={plot.id === 'sanctuary-center' ? plot.center[1] - SANCTUARY_BED.depth / 2 - 0.5 : plot.center[1] + SANCTUARY_BED.depth / 2 + 1.4}
                className="map__label map__label--small"
              >
                {short(collection.title, 9)}
              </text>
            )}
          </g>
        );
      })}

      {/* Hidden grove (vault) */}
      <g
        className={`map__spot${grove && assignment.grove?.id === selectedBedId ? ' map__spot--selected' : ''}`}
        {...(assignment.grove ? spotProps('grove', assignment.grove.id, `${assignment.grove.title}, hidden grove`) : {})}
      >
        <circle cx={grove.center[0]} cy={grove.center[1]} r={grove.radius - 0.8} className="map__bed map__bed--hidden" />
        <text x={grove.center[0]} y={grove.center[1] + 0.5} className="map__label map__label--small">
          {assignment.grove ? short(assignment.grove.title, 10) : 'hidden grove'}
        </text>
      </g>

      <g className="map__overlay">{children}</g>
    </svg>
  );
}
