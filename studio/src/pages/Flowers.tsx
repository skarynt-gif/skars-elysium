/**
 * Flower editor: each song's flower type, colors, size, label and
 * description, with a live 3D preview drawn by the game's own flower code.
 */
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { FLOWER_SPECIES } from '../../../src/content/types.ts';
import { flowerSpecies } from '../../../src/content/flowerRules.ts';
import { api, type CollectionRow, type SongRow } from '../api.ts';
import { Field, Segmented, TextField } from '../components.tsx';
import { COLOR_SWATCHES, SPECIES_INFO, flowerLook, songOf } from '../flowerLook.ts';
import { FlowerPreview } from '../FlowerPreview.tsx';
import { bedTypeLabel, groupByBed, songBadge } from '../format.ts';
import { save, useStudio } from '../store.ts';

type Draft = Partial<Pick<SongRow, 'flower_species' | 'flower_color' | 'flower_core' | 'flower_scale' | 'flower_hue'>>;

export function FlowersPage({ songId }: { songId: string | null }) {
  const garden = useStudio((s) => s.garden);
  if (!garden) return <p className="studio-loading">Loading flowers…</p>;
  const song = songId ? garden.songs.find((s) => s.id === songId) ?? null : null;

  return (
    <div className={`split${song ? ' split--detail' : ''}`}>
      <aside className="split__list" aria-label="Flowers">
        {groupByBed(garden.collections, garden.songs).map(({ bed, songs }) => (
          <section key={bed.id} className="list-group">
            <h3 className="list-group__title">
              {bed.title} <span className="muted">· {bedTypeLabel(bed.type)}</span>
            </h3>
            <ul className="rows">
              {songs.map((s) => {
                const look = flowerLook(s, bed, 'bloom');
                return (
                  <li key={s.id}>
                    <a className={`row${s.id === songId ? ' row--on' : ''}`} href={`#/flowers/${encodeURIComponent(s.id)}`}>
                      <span className="swatch" style={{ background: look.palette.petal }} aria-hidden="true">
                        <span className="swatch__core" style={{ background: look.palette.core }} />
                      </span>
                      <span className="row__title">{s.title}</span>
                      <span className="muted small">{SPECIES_INFO[flowerSpecies(songOf(s))].name}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </aside>
      <section className="split__detail">
        {song ? (
          <FlowerEditor key={song.id} song={song} bed={garden.collections.find((c) => c.id === song.collection_id)} />
        ) : (
          <div className="empty-state">
            <p className="empty-state__title">Pick a flower</p>
            <p className="muted">Every song is a flower. Choose one to change how it looks in the garden.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function FlowerEditor({ song, bed }: { song: SongRow; bed: CollectionRow | undefined }) {
  // Local overrides show instantly in the preview; they're saved a moment later.
  const [draft, setDraft] = useState<Draft>({});
  const [mode, setMode] = useState<'now' | 'bloom'>('bloom');
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Record<string, unknown>>({});

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        flush();
      }
    },
    [],
  );

  const view: SongRow = { ...song, ...draft };
  const look = useMemo(() => flowerLook(view, bed, mode), [JSON.stringify(view), bed?.auto_bloom, bed?.type, mode]);
  // Color pickers start from the flower's open-bloom colors, even while previewing a bud.
  const bloomPalette = mode === 'bloom' ? look.palette : flowerLook(view, bed, 'bloom').palette;
  const autoSpecies = flowerSpecies(songOf({ ...view, flower_species: null }));
  const badge = songBadge(song);

  function flush() {
    const fields = pending.current;
    pending.current = {};
    timer.current = null;
    if (Object.keys(fields).length === 0) return;
    save(() => api.updateSong(song.id, fields)).then(
      () => setError(null),
      (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    );
  }

  /** Change one setting: preview now, save shortly after (sliders and color pickers fire a lot). */
  const change = (column: keyof Draft, field: string, value: string | number | null, delay = 450) => {
    setDraft((d) => ({ ...d, [column]: value }));
    pending.current[field] = value;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, delay);
  };

  const hidden = look.state === 'sprout';
  return (
    <article className="editor" aria-label={`Flower for ${song.title}`}>
      <header className="editor__head">
        <a className="editor__back" href="#/flowers">
          ← All flowers
        </a>
        <h2 className="editor__title">{song.title}</h2>
        <span className={`badge badge--${badge.tone}`}>{badge.label}</span>
      </header>
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}

      <div className="flower-layout">
        <div className="flower-layout__preview">
          <FlowerPreview look={look} />
          {(song.status === 'upcoming' || song.status === 'unreleased') && (
            <Segmented
              label="Preview"
              value={mode}
              options={[
                { value: 'bloom', label: 'In bloom' },
                { value: 'now', label: song.status === 'unreleased' ? 'In the vault' : 'Before release' },
              ]}
              onChange={setMode}
            />
          )}
          {look.state === 'bud' && <p className="field__hint">Before release it’s a golden bud: your colors appear when it blooms.</p>}
          {hidden && <p className="field__hint">A teaser shows as a small “???” sprout; the label and description stay hidden too.</p>}
        </div>

        <div className="flower-layout__controls">
          <div className="field">
            <span className="field__label">Flower type</span>
            <div className="species" role="radiogroup" aria-label="Flower type">
              <button
                type="button"
                role="radio"
                aria-checked={!view.flower_species}
                className={`species__item${!view.flower_species ? ' species__item--on' : ''}`}
                onClick={() => change('flower_species', 'flowerSpecies', null, 0)}
              >
                <strong>Auto</strong>
                <span>{SPECIES_INFO[autoSpecies].name}, from the genre</span>
              </button>
              {FLOWER_SPECIES.map((sp) => (
                <button
                  key={sp}
                  type="button"
                  role="radio"
                  aria-checked={view.flower_species === sp}
                  className={`species__item${view.flower_species === sp ? ' species__item--on' : ''}`}
                  onClick={() => change('flower_species', 'flowerSpecies', sp, 0)}
                  title={SPECIES_INFO[sp].about}
                >
                  <strong>{SPECIES_INFO[sp].name}</strong>
                  <span>{SPECIES_INFO[sp].about}</span>
                </button>
              ))}
            </div>
          </div>

          <ColorField
            id="petal-color"
            label="Petal color"
            value={view.flower_color ?? null}
            fallback={bloomPalette.petal}
            autoHint="The flower type’s own colors (spirals cycle through the rainbow)"
            onChange={(v, delay) => change('flower_color', 'flowerColor', v, delay)}
          />
          <ColorField
            id="core-color"
            label="Heart color"
            value={view.flower_core ?? null}
            fallback={bloomPalette.core}
            autoHint="The flower type’s own heart color"
            onChange={(v, delay) => change('flower_core', 'flowerCore', v, delay)}
          />

          <SliderField
            id="flower-size"
            label="Size"
            value={view.flower_scale ?? 1}
            min={0.5}
            max={2}
            step={0.05}
            format={(v) => `${Math.round(v * 100)}%`}
            isAuto={view.flower_scale === null || view.flower_scale === undefined}
            onChange={(v) => change('flower_scale', 'flowerScale', v)}
            onAuto={() => change('flower_scale', 'flowerScale', null, 0)}
          />
          {!view.flower_color && (
            <SliderField
              id="flower-hue"
              label="Color shift"
              value={view.flower_hue ?? 0}
              min={-180}
              max={180}
              step={1}
              format={(v) => `${v > 0 ? '+' : ''}${Math.round(v)}°`}
              hint="Nudges the petals around the color wheel. By default each flower gets a small random shift so beds don’t look cloned."
              isAuto={view.flower_hue === null || view.flower_hue === undefined}
              onChange={(v) => change('flower_hue', 'flowerHue', v)}
              onAuto={() => change('flower_hue', 'flowerHue', null, 0)}
            />
          )}

          <TextField
            id="flower-label"
            label="Label (optional)"
            value={song.flower_label}
            maxLength={24}
            placeholder="e.g. NEW, FEAT. NOVA"
            hint="Shown next to the title when visitors walk up to the flower."
            onSave={(v) => save(() => api.updateSong(song.id, { flowerLabel: v }))}
          />
          <TextField
            id="song-description"
            label="Description (optional)"
            value={song.description}
            multiline
            maxLength={600}
            hint="A few lines shown in the player and on the song’s card."
            onSave={(v) => save(() => api.updateSong(song.id, { description: v }))}
          />
        </div>
      </div>
    </article>
  );
}

function ColorField({
  id,
  label,
  value,
  fallback,
  autoHint,
  onChange,
}: {
  id: string;
  label: string;
  value: string | null;
  fallback: string;
  autoHint: string;
  onChange: (value: string | null, delay?: number) => void;
}) {
  return (
    <Field id={id} label={label} hint={value ? undefined : `Auto: ${autoHint}.`}>
      <div className="color-row">
        <input
          id={id}
          type="color"
          className="color-input"
          value={value ?? fallback}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        />
        {COLOR_SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            className={`swatch-btn${value === c ? ' swatch-btn--on' : ''}`}
            style={{ background: c }}
            aria-label={`Use ${c}`}
            onClick={() => onChange(c, 0)}
          />
        ))}
        <button type="button" className={`btn btn--small${value ? ' btn--ghost' : ''}`} onClick={() => onChange(null, 0)} aria-pressed={!value}>
          Auto
        </button>
      </div>
    </Field>
  );
}

function SliderField({
  id,
  label,
  value,
  min,
  max,
  step,
  format,
  hint,
  isAuto,
  onChange,
  onAuto,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  hint?: string;
  isAuto: boolean;
  onChange: (v: number) => void;
  onAuto: () => void;
}) {
  return (
    <Field id={id} label={`${label}: ${isAuto ? 'Auto' : format(value)}`} hint={hint}>
      <div className="slider-row">
        <input
          id={id}
          type="range"
          className="slider"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(Number(e.target.value))}
        />
        <button type="button" className={`btn btn--small${isAuto ? '' : ' btn--ghost'}`} onClick={onAuto} aria-pressed={isAuto}>
          Auto
        </button>
      </div>
    </Field>
  );
}
