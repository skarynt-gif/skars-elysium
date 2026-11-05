/**
 * Garden beds: albums, EPs, singles, genre beds and the vault. Place them on
 * the map, edit them, and drag songs between them.
 */
import { useState, type ChangeEvent } from 'react';
import { COLLECTION_TYPES, GARDEN_AREAS } from '../../../src/content/types.ts';
import { api, type CollectionRow, type SongRow } from '../api.ts';
import { moveSong } from '../beds.ts';
import { ConfirmButton, Field, IssueList, MediaSlot, SelectField, TextField, Toggle } from '../components.tsx';
import { areaLabel, bedTypeLabel, plural, songBadge } from '../format.ts';
import { GardenMap, draftAssignment, spotName } from '../GardenMap.tsx';
import { navigate } from '../router.ts';
import { save, useStudio } from '../store.ts';

const TYPE_HINTS: Record<string, string> = {
  album: 'A full album',
  ep: 'An EP',
  single: 'Singles stand alone on little marble plinths',
  genre: 'A bed for a genre or mood',
  vault: 'Unreleased songs',
};

const AREA_HINTS: Record<string, string> = {
  main: 'Around the fountain (10 spots)',
  'ep-garden': 'Inside the walled EP sanctuary up north (3 spots)',
  hidden: 'The hidden grove fans have to discover (1 bed)',
};

export function BedsPage({ bedId }: { bedId: string | null }) {
  const garden = useStudio((s) => s.garden);
  const [dragging, setDragging] = useState<string | null>(null);
  if (!garden) return <p className="studio-loading">Loading beds…</p>;

  const assignment = draftAssignment(garden.collections);
  const selected = garden.collections.find((c) => c.id === bedId) ?? null;
  const spotOf = new Map<string, string>([
    ...assignment.main.filter((s) => s.collection).map((s) => [s.collection!.id, s.plot.id] as [string, string]),
    ...assignment.sanctuary.filter((s) => s.collection).map((s) => [s.collection!.id, s.plot.id] as [string, string]),
    ...(assignment.grove ? [[assignment.grove.id, 'grove'] as [string, string]] : []),
  ]);

  const onSpot = (spotId: string, occupant: string | null) => {
    if (selected && spotId !== 'grove' && occupant !== selected.id) {
      const sameArea =
        (selected.area === 'main' && spotId.startsWith('plot-')) || (selected.area === 'ep-garden' && spotId.startsWith('sanctuary-'));
      if (sameArea) {
        void save(() => api.updateCollection(selected.id, { plot: spotId })).catch(() => {});
        return;
      }
    }
    if (occupant) navigate(`/beds/${occupant}`);
  };

  const move = (songId: string, toBed: string, beforeId: string | null) => {
    void save(() => api.placeSongs(toBed, moveSong(garden, songId, toBed, beforeId))).catch(() => {});
  };

  const reorderBed = (id: string, delta: number) => {
    const ids = garden.collections.map((c) => c.id);
    const i = ids.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    void save(() => api.orderCollections(ids)).catch(() => {});
  };

  return (
    <div className="beds-page">
      <section className="beds-page__map">
        <GardenMap assignment={assignment} selectedBedId={selected?.id ?? null} onSpot={onSpot} label="Garden map: beds" />
        <p className="map-help">
          {selected
            ? selected.area === 'hidden'
              ? `“${selected.title}” lives in the hidden grove.`
              : `Click any ${selected.area === 'main' ? 'bed spot around the fountain' : 'sanctuary spot'} to move “${selected.title}” there. Taken spots swap.`
            : 'Click a bed on the map or in the list to select it.'}
        </p>
        {assignment.overflow.length > 0 && (
          <p className="error" role="alert">
            No room for: {assignment.overflow.map((c) => c.title).join(', ')}. Visitors won’t see{' '}
            {assignment.overflow.length === 1 ? 'it' : 'them'}. Move to another area or delete a bed.
          </p>
        )}
      </section>

      <section className="beds-page__list" aria-label="Beds">
        <div className="toolbar">
          <h1 className="summary__title toolbar__title">Beds</h1>
          <NewBed />
        </div>
        <p className="muted small">Drag songs between beds (or use “Move to” on phones). The order of beds decides which spots unpinned beds fill.</p>
        {garden.collections.map((bed, i) => {
          const songs = garden.songs.filter((s) => s.collection_id === bed.id).sort((a, b) => a.sort_order - b.sort_order);
          const open = bed.id === selected?.id;
          const spot = spotOf.get(bed.id);
          return (
            <article
              key={bed.id}
              className={`bed-card${open ? ' bed-card--open' : ''}${dragging ? ' bed-card--droppable' : ''}`}
              onDragOver={(e: { preventDefault(): void }) => dragging && e.preventDefault()}
              onDrop={(e: { preventDefault(): void }) => {
                e.preventDefault();
                if (dragging) move(dragging, bed.id, null);
                setDragging(null);
              }}
            >
              <header className="bed-card__head">
                <a className="bed-card__title" href={open ? '#/beds' : `#/beds/${encodeURIComponent(bed.id)}`} aria-expanded={open}>
                  {bed.title}
                </a>
                <span className="bed-card__meta">
                  {bedTypeLabel(bed.type)} · {plural(songs.length, 'song')} ·{' '}
                  {spot ? (spot === 'grove' ? 'Hidden grove' : spotName(spot)) : <strong className="warn">no room</strong>}
                  {bed.plot ? ' (pinned)' : ''}
                </span>
                <span className="bed-card__order">
                  <button type="button" className="icon-btn" aria-label={`Move ${bed.title} up`} disabled={i === 0} onClick={() => reorderBed(bed.id, -1)}>
                    ▲
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Move ${bed.title} down`}
                    disabled={i === garden.collections.length - 1}
                    onClick={() => reorderBed(bed.id, 1)}
                  >
                    ▼
                  </button>
                </span>
              </header>

              <ol className="bed-card__songs">
                {songs.map((song) => (
                  <SongChip
                    key={song.id}
                    song={song}
                    beds={garden.collections}
                    onDragStart={() => setDragging(song.id)}
                    onDragEnd={() => setDragging(null)}
                    onDropBefore={() => {
                      if (dragging && dragging !== song.id) move(dragging, bed.id, song.id);
                      setDragging(null);
                    }}
                    onMove={(to) => move(song.id, to, null)}
                  />
                ))}
                {songs.length === 0 && <li className="muted small">No songs. Drag one here, or add one in Music.</li>}
              </ol>

              {open && <BedEditor bed={bed} songCount={songs.length} />}
            </article>
          );
        })}
      </section>
    </div>
  );
}

function SongChip({
  song,
  beds,
  onDragStart,
  onDragEnd,
  onDropBefore,
  onMove,
}: {
  song: SongRow;
  beds: CollectionRow[];
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropBefore: () => void;
  onMove: (bedId: string) => void;
}) {
  const badge = songBadge(song);
  return (
    <li
      className="chip"
      draggable
      onDragStart={(e: { dataTransfer: DataTransfer | null }) => {
        e.dataTransfer?.setData('text/plain', song.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e: { preventDefault(): void }) => e.preventDefault()}
      onDrop={(e: { preventDefault(): void; stopPropagation(): void }) => {
        e.preventDefault();
        e.stopPropagation();
        onDropBefore();
      }}
    >
      <span className="chip__grip" aria-hidden="true">
        ⋮⋮
      </span>
      <span className="chip__title">{song.title}</span>
      <span className={`badge badge--${badge.tone}`}>{badge.label.split(' · ')[0]}</span>
      <a className="chip__edit" href={`#/music/${encodeURIComponent(song.id)}`} draggable={false} aria-label={`Edit ${song.title}`}>
        Edit
      </a>
      <select
        className="input input--tiny"
        aria-label={`Move ${song.title} to another bed`}
        value=""
        onChange={(e: ChangeEvent<HTMLSelectElement>) => e.target.value && onMove(e.target.value)}
      >
        <option value="">Move to…</option>
        {beds
          .filter((b) => b.id !== song.collection_id)
          .map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
            </option>
          ))}
      </select>
    </li>
  );
}

function BedEditor({ bed, songCount }: { bed: CollectionRow; songCount: number }) {
  const issues = useStudio((s) => s.garden?.issues ?? []);
  const update = (fields: Record<string, unknown>) => save(() => api.updateCollection(bed.id, fields));
  const mine = issues.filter((i) => i.path.includes(`"${bed.id}"`) && i.path.startsWith('collections'));
  const spots =
    bed.area === 'main'
      ? draftAssignment([]).main.map((s) => s.plot.id)
      : bed.area === 'ep-garden'
        ? draftAssignment([]).sanctuary.map((s) => s.plot.id)
        : [];

  return (
    <div className="bed-editor">
      <IssueList issues={mine} title="Notes" />
      <div className="form-grid">
        <TextField id={`bed-title-${bed.id}`} label="Name (shown on the bed’s sign)" value={bed.title} maxLength={80} onSave={(v) => update({ title: v })} />
        <SelectField
          id={`bed-type-${bed.id}`}
          label="Type"
          value={bed.type}
          hint={TYPE_HINTS[bed.type]}
          options={COLLECTION_TYPES.map((t) => ({ value: t, label: bedTypeLabel(t) }))}
          onSave={(v) => update({ type: v })}
        />
        <SelectField
          id={`bed-area-${bed.id}`}
          label="Part of the garden"
          value={bed.area}
          hint={AREA_HINTS[bed.area]}
          options={GARDEN_AREAS.map((a) => ({ value: a, label: areaLabel(a) }))}
          onSave={(v) => update({ area: v })}
        />
        {spots.length > 0 && (
          <SelectField
            id={`bed-spot-${bed.id}`}
            label="Spot"
            value={bed.plot ?? ''}
            hint="Or click a spot on the map."
            options={[{ value: '', label: 'Automatic (next free spot)' }, ...spots.map((s) => ({ value: s, label: spotName(s) }))]}
            onSave={(v) => update({ plot: v || null })}
          />
        )}
      </div>
      <Toggle
        label="Auto-bloom"
        hint="Upcoming songs in this bed open by themselves at their release time."
        checked={Boolean(bed.auto_bloom)}
        onChange={(on) => void update({ autoBloom: on }).catch(() => {})}
      />
      <TextField
        id={`bed-desc-${bed.id}`}
        label="Description (optional)"
        value={bed.description}
        multiline
        maxLength={600}
        onSave={(v) => update({ description: v })}
      />
      <MediaSlot kind="cover" title="Cover art" description="Shown for songs that don’t have their own" value={bed.cover} onChange={(key) => update({ cover: key })} />
      <footer className="editor__foot">
        {songCount === 0 ? (
          <ConfirmButton
            label="Delete bed"
            confirm={`Delete “${bed.title}”?`}
            onConfirm={() =>
              save(() => api.deleteCollection(bed.id))
                .then(() => navigate('/beds'))
                .catch(() => {})
            }
          />
        ) : (
          <span className="muted small">To delete this bed, move or delete its songs first.</span>
        )}
      </footer>
    </div>
  );
}

function NewBed() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState('album');
  const [area, setArea] = useState('main');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!open) {
    return (
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        + New bed
      </button>
    );
  }
  const create = () => {
    setBusy(true);
    save(() => api.createCollection({ title, type, area }))
      .then((r) => {
        setOpen(false);
        setTitle('');
        setError(null);
        navigate(`/beds/${r.id}`);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  };
  return (
    <form
      className="new-bed"
      onSubmit={(e: { preventDefault(): void }) => {
        e.preventDefault();
        create();
      }}
    >
      <Field id="new-bed-title" label="Name" error={error}>
        <input
          id="new-bed-title"
          className="input"
          value={title}
          maxLength={80}
          autoFocus
          onChange={(e: ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
        />
      </Field>
      <div className="row">
        <select className="input input--inline" aria-label="Type" value={type} onChange={(e: ChangeEvent<HTMLSelectElement>) => setType(e.target.value)}>
          {COLLECTION_TYPES.map((t) => (
            <option key={t} value={t}>
              {bedTypeLabel(t)}
            </option>
          ))}
        </select>
        <select className="input input--inline" aria-label="Part of the garden" value={area} onChange={(e: ChangeEvent<HTMLSelectElement>) => setArea(e.target.value)}>
          {GARDEN_AREAS.map((a) => (
            <option key={a} value={a}>
              {areaLabel(a)}
            </option>
          ))}
        </select>
      </div>
      <div className="row">
        <button type="submit" className="btn btn--small" disabled={busy || !title.trim()}>
          Add bed
        </button>
        <button type="button" className="btn btn--ghost btn--small" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
