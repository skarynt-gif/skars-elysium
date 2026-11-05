/**
 * Decorations and atmosphere: place preset statues, columns, lanterns,
 * benches, urns, archways, trees and hedges on the garden map, and tune the
 * sky, fog and floating particles within ranges that always look right.
 */
import { useRef, useState, type ChangeEvent } from 'react';
import { DECORATION_PRESETS_LIST, type Decoration, type DecorationPreset } from '../../../src/content/types.ts';
import { DECORATION_LIMITS, DECORATION_PRESETS, placementProblem } from '../../../src/game/world/decorations.ts';
import {
  DEFAULT_ENVIRONMENT,
  ENVIRONMENT_RANGES,
  skyPalette,
  type EnvironmentKey,
} from '../../../src/game/world/environment.ts';
import { GAME_CONFIG } from '../../../src/config/gameConfig.ts';
import { api, type DecorationRow, type GardenEnvironment } from '../api.ts';
import { ConfirmButton, Field } from '../components.tsx';
import { GardenMap, draftAssignment } from '../GardenMap.tsx';
import { save, useStudio } from '../store.ts';

const PRESET_ABOUT: Record<DecorationPreset, string> = {
  statue: 'Marble figure on a pedestal',
  column: 'Tall marble column',
  'broken-column': 'Weathered stump with a fallen drum',
  lantern: 'Bronze post with a warm glow',
  bench: 'Marble garden bench',
  urn: 'Tall urn on a plinth',
  archway: 'Two columns and a lintel; walk through it',
  cypress: 'Tall, slim dark-green tree',
  'olive-tree': 'Gnarled silvery-green tree',
  hedge: 'A short wall of hedge',
};

const ENV_TEXT: Record<EnvironmentKey, { label: string; low: string; high: string; format: (v: number) => string }> = {
  skyWarmth: { label: 'Sky warmth', low: 'Dusk', high: 'Golden hour', format: (v) => (v === 0 ? 'Sunset' : v > 0 ? `${Math.round(v * 100)}% golden` : `${Math.round(-v * 100)}% dusk`) },
  fog: { label: 'Mist', low: 'Clear', high: 'Misty', format: (v) => `${Math.round(v * 100)}%` },
  particles: { label: 'Fireflies and pollen', low: 'None', high: 'Lots', format: (v) => `${Math.round(v * 100)}%` },
  butterflies: { label: 'Butterflies', low: 'None', high: 'Lots', format: (v) => `${Math.round(v * 100)}%` },
  clouds: { label: 'Clouds', low: 'None', high: 'Thick', format: (v) => `${Math.round(v * 100)}%` },
};

type Mode = { kind: 'idle' } | { kind: 'place'; preset: DecorationPreset } | { kind: 'move'; id: string };

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function DecorPage() {
  const garden = useStudio((s) => s.garden);
  const [mode, setMode] = useState<Mode>({ kind: 'idle' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hover, setHover] = useState<[number, number] | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  if (!garden) return <p className="studio-loading">Loading…</p>;

  const decorations = garden.decorations;
  const selected = decorations.find((d) => d.id === selectedId) ?? null;
  const full = decorations.length >= DECORATION_LIMITS.max;

  /** What would be placed (or where the moved one would go) under the pointer. */
  const ghost: Decoration | null = hover
    ? mode.kind === 'place'
      ? { id: '__new', preset: mode.preset, x: hover[0], z: hover[1], rotation: 0, scale: 1 }
      : mode.kind === 'move' && selected
        ? { ...selected, x: hover[0], z: hover[1] }
        : null
    : null;
  const ghostProblem = ghost ? placementProblem(ghost, decorations) : null;

  const onGround = (x: number, z: number) => {
    if (mode.kind === 'place') {
      const candidate = { id: '__new', preset: mode.preset, x, z, rotation: 0, scale: 1 };
      const problem = placementProblem(candidate, decorations);
      if (problem) return setMessage({ text: problem, error: true });
      save(() => api.createDecoration({ preset: mode.preset, x, z }))
        .then((r) => {
          setSelectedId(r.id);
          setMessage({ text: `${DECORATION_PRESETS[mode.preset].name} placed. Click again to place another, or press Done.`, error: false });
        })
        .catch((e: unknown) => setMessage({ text: errorText(e), error: true }));
    } else if (mode.kind === 'move' && selected) {
      save(() => api.updateDecoration(selected.id, { x, z }))
        .then(() => {
          setMode({ kind: 'idle' });
          setMessage(null);
        })
        .catch((e: unknown) => setMessage({ text: errorText(e), error: true }));
    } else {
      setSelectedId(null);
    }
  };

  return (
    <div className="beds-page">
      <section className="beds-page__map">
        <GardenMap
          assignment={draftAssignment(garden.collections)}
          onGround={onGround}
          onHover={mode.kind === 'idle' ? undefined : setHover}
          label="Garden map: decorations"
        >
          {decorations.map((d) => (
            <DecorationMark
              key={d.id}
              decoration={d}
              selected={d.id === selectedId}
              faded={mode.kind === 'move' && d.id === selectedId}
              onSelect={() => {
                if (mode.kind === 'idle') setSelectedId(d.id);
              }}
            />
          ))}
          {ghost && <DecorationMark decoration={ghost} ghost={ghostProblem ? 'bad' : 'good'} />}
        </GardenMap>
        <p className={`map-help${message?.error ? ' error' : ''}`} role="status">
          {message?.text ??
            (mode.kind === 'place'
              ? `Click open ground to place a ${DECORATION_PRESETS[mode.preset].name.toLowerCase()}. Green = fits, red = in the way.`
              : mode.kind === 'move'
                ? 'Click where it should go.'
                : 'Pick a decoration from the catalog, or click one on the map to edit it.')}
        </p>
      </section>

      <section className="beds-page__list">
        <div className="toolbar">
          <h1 className="summary__title toolbar__title">Decorations</h1>
          {mode.kind !== 'idle' && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                if (mode.kind === 'place') setSelectedId(null);
                setMode({ kind: 'idle' });
                setHover(null);
                setMessage(null);
              }}
            >
              Done
            </button>
          )}
        </div>
        <p className="muted small">
          {decorations.length} of {DECORATION_LIMITS.max} placed. Paths, beds, the plaza, the sanctuary and the grove always stay clear, so visitors can
          walk everywhere.
        </p>

        {selected && mode.kind !== 'place' ? (
          <DecorationEditor
            key={selected.id}
            decoration={selected}
            moving={mode.kind === 'move'}
            onMove={() => {
              setMode({ kind: 'move', id: selected.id });
              setMessage(null);
            }}
            onClose={() => setSelectedId(null)}
            onError={(text) => setMessage({ text, error: true })}
          />
        ) : (
          <div className="catalog" role="radiogroup" aria-label="Decoration catalog">
            {DECORATION_PRESETS_LIST.map((preset) => (
              <button
                key={preset}
                type="button"
                role="radio"
                aria-checked={mode.kind === 'place' && mode.preset === preset}
                className={`catalog__item${mode.kind === 'place' && mode.preset === preset ? ' catalog__item--on' : ''}`}
                disabled={full}
                onClick={() => {
                  setMode({ kind: 'place', preset });
                  setSelectedId(null);
                  setMessage(null);
                }}
              >
                <PresetIcon preset={preset} />
                <span>
                  <strong>{DECORATION_PRESETS[preset].name}</strong>
                  <span className="catalog__about">{PRESET_ABOUT[preset]}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        <Atmosphere environment={garden.environment} />
      </section>
    </div>
  );
}

const MARK_COLORS: Partial<Record<DecorationPreset, string>> = {
  cypress: '#24391d',
  'olive-tree': '#6d8a4c',
  hedge: '#2c4422',
  lantern: '#e8c15a',
};

function DecorationMark({
  decoration: d,
  selected = false,
  faded = false,
  ghost,
  onSelect,
}: {
  decoration: Decoration;
  selected?: boolean;
  faded?: boolean;
  ghost?: 'good' | 'bad';
  onSelect?: () => void;
}) {
  const info = DECORATION_PRESETS[d.preset];
  const fill = ghost ? (ghost === 'good' ? '#8fc29a' : '#e2685f') : (MARK_COLORS[d.preset] ?? '#f4ecdc');
  return (
    <g
      className={`deco${selected ? ' deco--selected' : ''}${ghost ? ' deco--ghost' : ''}`}
      transform={`translate(${d.x} ${d.z}) rotate(${d.rotation}) scale(${d.scale})`}
      opacity={faded ? 0.35 : 1}
      onClick={
        onSelect
          ? (e: { stopPropagation(): void }) => {
              e.stopPropagation();
              onSelect();
            }
          : undefined
      }
      role={onSelect ? 'button' : undefined}
      aria-label={onSelect ? `${info.name} (${d.id})` : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onKeyDown={
        onSelect
          ? (e: { key: string }) => {
              if (e.key === 'Enter') onSelect();
            }
          : undefined
      }
      pointerEvents={ghost ? 'none' : undefined}
    >
      <circle r={info.footprint} className="deco__footprint" />
      {info.solids.map(([x, z, r], i) => (
        <circle key={i} cx={x} cy={z} r={r} fill={fill} className="deco__solid" />
      ))}
    </g>
  );
}

function PresetIcon({ preset }: { preset: DecorationPreset }) {
  const info = DECORATION_PRESETS[preset];
  const size = info.footprint + 0.2;
  return (
    <svg className="catalog__icon" viewBox={`${-size} ${-size} ${size * 2} ${size * 2}`} aria-hidden="true">
      <circle r={info.footprint} className="deco__footprint" />
      {info.solids.map(([x, z, r], i) => (
        <circle key={i} cx={x} cy={z} r={r} fill={MARK_COLORS[preset] ?? '#f4ecdc'} />
      ))}
    </svg>
  );
}

function DecorationEditor({
  decoration: d,
  moving,
  onMove,
  onClose,
  onError,
}: {
  decoration: DecorationRow;
  moving: boolean;
  onMove: () => void;
  onClose: () => void;
  onError: (text: string) => void;
}) {
  const [rotation, setRotation] = useState(d.rotation);
  const [scale, setScale] = useState(d.scale);
  const update = (fields: Record<string, unknown>) =>
    save(() => api.updateDecoration(d.id, fields)).catch((e: unknown) => {
      onError(errorText(e));
      setRotation(d.rotation);
      setScale(d.scale);
    });
  const nudge = (dx: number, dz: number) => void update({ x: d.x + dx, z: d.z + dz });

  return (
    <div className="card deco-editor">
      <div className="toolbar">
        <h2 className="card__title toolbar__title">{DECORATION_PRESETS[d.preset].name}</h2>
        <button type="button" className="btn btn--ghost btn--small" onClick={onClose}>
          Back to catalog
        </button>
      </div>
      <Field id="deco-rotation" label={`Facing: ${rotation}°`}>
        <div className="slider-row">
          <input
            id="deco-rotation"
            type="range"
            className="slider"
            min={0}
            max={345}
            step={15}
            value={rotation}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setRotation(Number(e.target.value))}
            onPointerUp={() => void update({ rotation })}
            onKeyUp={() => void update({ rotation })}
          />
        </div>
      </Field>
      <Field id="deco-scale" label={`Size: ${Math.round(scale * 100)}%`}>
        <div className="slider-row">
          <input
            id="deco-scale"
            type="range"
            className="slider"
            min={DECORATION_LIMITS.minScale}
            max={DECORATION_LIMITS.maxScale}
            step={0.05}
            value={scale}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setScale(Number(e.target.value))}
            onPointerUp={() => void update({ scale })}
            onKeyUp={() => void update({ scale })}
          />
        </div>
      </Field>
      <div className="field">
        <span className="field__label">Position</span>
        <div className="row">
          <button type="button" className={`btn btn--small${moving ? '' : ' btn--ghost'}`} onClick={onMove} aria-pressed={moving}>
            {moving ? 'Click the map…' : 'Move on the map'}
          </button>
          <span className="nudge" aria-label="Nudge by half a meter">
            <button type="button" className="icon-btn" aria-label="Nudge north" onClick={() => nudge(0, -0.5)}>
              ▲
            </button>
            <button type="button" className="icon-btn" aria-label="Nudge west" onClick={() => nudge(-0.5, 0)}>
              ◀
            </button>
            <button type="button" className="icon-btn" aria-label="Nudge east" onClick={() => nudge(0.5, 0)}>
              ▶
            </button>
            <button type="button" className="icon-btn" aria-label="Nudge south" onClick={() => nudge(0, 0.5)}>
              ▼
            </button>
          </span>
        </div>
      </div>
      <ConfirmButton
        label="Remove"
        confirm="Remove this decoration?"
        onConfirm={() =>
          save(() => api.deleteDecoration(d.id))
            .then(onClose)
            .catch((e: unknown) => onError(errorText(e)))
        }
      />
    </div>
  );
}

function Atmosphere({ environment }: { environment: GardenEnvironment | null }) {
  const saved = environment ?? DEFAULT_ENVIRONMENT;
  const [draft, setDraft] = useState<GardenEnvironment>(saved);
  const [error, setError] = useState<string | null>(null);
  const changed = (Object.keys(ENVIRONMENT_RANGES) as EnvironmentKey[]).some((k) => draft[k] !== DEFAULT_ENVIRONMENT[k]);
  const sky = skyPalette(GAME_CONFIG.palette, draft.skyWarmth);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitNow = (key: EnvironmentKey, value: number) =>
    save(() => api.saveEnvironment({ [key]: value })).then(
      () => setError(null),
      (e: unknown) => setError(errorText(e)),
    );
  /** Arrow keys fire repeatedly: save once they settle. */
  const commit = (key: EnvironmentKey, value: number, delay = 0) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void commitNow(key, value), delay);
  };

  return (
    <section className="card atmosphere" aria-label="Atmosphere">
      <div className="toolbar">
        <h2 className="card__title toolbar__title">Atmosphere</h2>
        {changed && (
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() =>
              save(() => api.saveEnvironment({ reset: true })).then(() => setDraft(DEFAULT_ENVIRONMENT), (e: unknown) => setError(errorText(e)))
            }
          >
            Reset to the original sunset
          </button>
        )}
      </div>
      <div
        className="sky-swatch"
        aria-hidden="true"
        style={{ background: `linear-gradient(${sky.skyZenith}, ${sky.skyUpper} 35%, ${sky.skyPink} 62%, ${sky.skyHorizon} 82%, ${sky.fog})` }}
      />
      {(Object.keys(ENVIRONMENT_RANGES) as EnvironmentKey[]).map((key) => {
        const r = ENVIRONMENT_RANGES[key];
        const t = ENV_TEXT[key];
        return (
          <Field key={key} id={`env-${key}`} label={`${t.label}: ${t.format(draft[key])}`}>
            <div className="slider-row slider-row--labelled">
              <span className="muted small">{t.low}</span>
              <input
                id={`env-${key}`}
                type="range"
                className="slider"
                min={r.min}
                max={r.max}
                step={0.05}
                value={draft[key]}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setDraft((d) => ({ ...d, [key]: Number(e.target.value) }))}
                onPointerUp={() => commit(key, draft[key])}
                onKeyUp={() => commit(key, draft[key], 400)}
              />
              <span className="muted small">{t.high}</span>
            </div>
          </Field>
        );
      })}
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
      <p className="muted small">Every setting stays within a range that looks right and runs smoothly on phones.</p>
    </section>
  );
}
