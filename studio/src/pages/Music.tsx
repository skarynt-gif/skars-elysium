/**
 * Music manager: every song (flower) in the draft, its files, and its release
 * state. Changes save as you go.
 */
import { useMemo, useState, type ChangeEvent } from 'react';
import { GENRES } from '../../../src/content/types.ts';
import { api, fileUrl, type CollectionRow, type SongRow } from '../api.ts';
import { ConfirmButton, Field, IssueList, MediaSlot, Segmented, SelectField, TextField, Toggle, useDrop } from '../components.tsx';
import {
  GENRE_LABELS,
  bedTypeLabel,
  groupByBed,
  releaseChoice,
  releaseChoiceFields,
  songAdvice,
  songBadge,
  toLocalInputs,
  zoneAbbreviation,
  type ReleaseChoice,
} from '../format.ts';
import { navigate } from '../router.ts';
import { refreshMedia, save, useStudio } from '../store.ts';
import { isAudioFile, uploadFile } from '../upload.ts';

const RELEASE_OPTIONS: { value: ReleaseChoice; label: string; hint: string }[] = [
  { value: 'released', label: 'Released', hint: 'In full bloom; fans can play the full song' },
  { value: 'upcoming', label: 'Upcoming', hint: 'A golden bud with a countdown' },
  { value: 'teaser', label: 'Teaser', hint: 'A small “???” sprout; title hidden' },
  { value: 'unreleased', label: 'Vault', hint: 'A pale ghost flower; preview only' },
];

/** "my_song-final (master).mp3" → "My Song Final" */
export function titleFromFile(name: string): string {
  const base = name
    .replace(/\.[^.]*$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\((?:final|master|mastered|mix|v\d+)[^)]*\)/gi, '')
    .replace(/\b(final|master|mastered|v\d+)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  const titled = base.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
  return titled.slice(0, 120) || 'New song';
}

export function MusicPage({ songId }: { songId: string | null }) {
  const garden = useStudio((s) => s.garden);
  const [query, setQuery] = useState('');
  if (!garden) return <p className="studio-loading">Loading songs…</p>;

  const song = songId ? garden.songs.find((s) => s.id === songId) ?? null : null;
  const q = query.trim().toLowerCase();
  const groups = groupByBed(garden.collections, garden.songs)
    .map((g) => ({ ...g, songs: q ? g.songs.filter((s) => s.title.toLowerCase().includes(q)) : g.songs }))
    .filter((g) => !q || g.songs.length > 0);

  return (
    <div className={`split${song ? ' split--detail' : ''}`}>
      <aside className="split__list" aria-label="Songs">
        <div className="toolbar">
          <input
            className="input input--search"
            type="search"
            placeholder="Find a song"
            aria-label="Find a song"
            value={query}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
          />
          <NewSongButton collections={garden.collections} />
        </div>
        <BulkDrop collections={garden.collections} />
        {garden.collections.length === 0 && (
          <p className="muted">
            Add a bed first (Beds tab) or import your live garden (Home), then add songs to it.
          </p>
        )}
        {groups.map(({ bed, songs }) => (
          <section key={bed.id} className="list-group">
            <h3 className="list-group__title">
              {bed.title} <span className="muted">· {bedTypeLabel(bed.type)}</span>
            </h3>
            {songs.length === 0 ? (
              <p className="muted list-group__empty">No songs yet</p>
            ) : (
              <ul className="rows">
                {songs.map((s) => {
                  const badge = songBadge(s);
                  const art = fileUrl(s.cover ?? bed.cover);
                  const hasProblem = garden.issues.some((i) => i.severity === 'error' && i.path.includes(`"${s.id}"`));
                  return (
                    <li key={s.id}>
                      <a className={`row${s.id === songId ? ' row--on' : ''}`} href={`#/music/${encodeURIComponent(s.id)}`}>
                        {art ? <img className="row__art" src={art} alt="" width={36} height={36} loading="lazy" /> : <span className="row__art row__art--blank" />}
                        <span className="row__title">
                          {hasProblem && <span className="dot dot--error" title="Needs attention" />}
                          {s.title}
                        </span>
                        <span className={`badge badge--${badge.tone}`}>{badge.label}</span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}
      </aside>

      <section className="split__detail">
        {song ? (
          <SongEditor key={song.id} song={song} collections={garden.collections} />
        ) : songId ? (
          <div className="card">
            <p>That song isn’t in your draft any more.</p>
            <a className="btn btn--ghost" href="#/music">
              Back to songs
            </a>
          </div>
        ) : (
          <div className="empty-state">
            <p className="empty-state__title">Pick a song to edit</p>
            <p className="muted">Or drop audio files on the left to add new songs in one go.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function NewSongButton({ collections }: { collections: CollectionRow[] }) {
  const [busy, setBusy] = useState(false);
  const first = collections[0];
  return (
    <button
      type="button"
      className="btn"
      disabled={!first || busy}
      onClick={() => {
        setBusy(true);
        save(() => api.createSong({ title: 'New song', collectionId: first!.id }))
          .then((result) => navigate(`/music/${result.id}`))
          .catch(() => {})
          .finally(() => setBusy(false));
      }}
    >
      + New song
    </button>
  );
}

/** Drop several audio files at once: each becomes a released song in the chosen bed. */
function BulkDrop({ collections }: { collections: CollectionRow[] }) {
  const [bedId, setBedId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const target = collections.find((c) => c.id === bedId) ?? collections[0];

  const add = async (files: File[]) => {
    if (!target || busy) return;
    const audio = files.filter(isAudioFile);
    const skipped = files.length - audio.length;
    setBusy(true);
    let added = 0;
    let lastId: string | null = null;
    const failures: string[] = [];
    for (const [i, file] of audio.entries()) {
      setMessage(`Uploading ${i + 1} of ${audio.length}: ${file.name}`);
      try {
        const uploaded = await uploadFile('audio', file);
        const result = await save(() =>
          api.createSong({ title: titleFromFile(file.name), collectionId: target.id, audio: uploaded.key, status: 'released' }),
        );
        lastId = result.id;
        added++;
      } catch (e) {
        failures.push(`${file.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    await refreshMedia().catch(() => {});
    setBusy(false);
    setMessage(
      [
        added ? `Added ${added} song${added === 1 ? '' : 's'} to ${target.title}. Check their titles and release states.` : '',
        skipped ? `Skipped ${skipped} file${skipped === 1 ? '' : 's'} that ${skipped === 1 ? 'isn’t' : 'aren’t'} audio.` : '',
        ...failures,
      ]
        .filter(Boolean)
        .join(' '),
    );
    if (lastId && added === 1) navigate(`/music/${lastId}`);
  };
  const { over, handlers } = useDrop((files) => void add(files));
  if (!target) return null;

  return (
    <div className={`bulk${over ? ' bulk--over' : ''}`} {...handlers}>
      <p className="bulk__text">
        {busy ? 'Working…' : 'Drop audio files here to add songs to'}{' '}
        {!busy && (
          <select
            className="input input--inline"
            aria-label="Bed for new songs"
            value={target.id}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setBedId(e.target.value)}
          >
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        )}
      </p>
      {message && (
        <p className="bulk__message" role="status">
          {message}
        </p>
      )}
    </div>
  );
}

function SongEditor({ song, collections }: { song: SongRow; collections: CollectionRow[] }) {
  const issues = useStudio((s) => s.garden?.issues ?? []);
  const bed = collections.find((c) => c.id === song.collection_id);
  const update = (fields: Record<string, unknown>) => save(() => api.updateSong(song.id, fields));
  const choice = releaseChoice(song);
  const mine = issues.filter((i) => i.path.includes(`"${song.id}"`));
  const advice = useMemo(() => songAdvice(song, Boolean(bed?.auto_bloom)), [song, bed?.auto_bloom]);
  const badge = songBadge(song);

  return (
    <article className="editor" aria-label={`Edit ${song.title}`}>
      <header className="editor__head">
        <a className="editor__back" href="#/music">
          ← All songs
        </a>
        <h2 className="editor__title">{song.title}</h2>
        <span className={`badge badge--${badge.tone}`}>{badge.label}</span>
      </header>

      <IssueList issues={mine} title={mine.some((i) => i.severity === 'error') ? 'Fix before publishing' : 'Notes'} />
      {advice.length > 0 && (
        <ul className="advice">
          {advice.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}

      <div className="form-grid">
        <TextField id="song-title" label="Title" value={song.title} maxLength={120} onSave={(v) => update({ title: v })} />
        <TextField id="song-artist" label="Artist" value={song.artist} maxLength={120} onSave={(v) => update({ artist: v })} />
        <SelectField
          id="song-bed"
          label="Bed"
          value={song.collection_id}
          options={collections.map((c) => ({ value: c.id, label: `${c.title} (${bedTypeLabel(c.type)})` }))}
          onSave={(v) => update({ collectionId: v })}
        />
        <SelectField
          id="song-genre"
          label="Genre"
          value={song.genre}
          hint="Sets the flower’s species unless you pick one in Flowers."
          options={GENRES.map((g) => ({ value: g, label: GENRE_LABELS[g] ?? g }))}
          onSave={(v) => update({ genre: v })}
        />
      </div>

      <Segmented label="Release state" value={choice} options={RELEASE_OPTIONS} onChange={(c) => void update(releaseChoiceFields(c)).catch(() => {})} />
      <p className="field__hint">{RELEASE_OPTIONS.find((o) => o.value === choice)?.hint}.</p>

      {(choice === 'upcoming' || choice === 'teaser') && (
        <div className="release-box">
          <ReleaseDate song={song} onSave={(v) => update({ releaseDate: v })} />
          {bed && (
            <Toggle
              label="Bloom automatically on the release date"
              hint={`Applies to every upcoming song in ${bed.title}. When off, the bud stays closed until you mark the song Released.`}
              checked={Boolean(bed.auto_bloom)}
              onChange={(on) => void save(() => api.updateCollection(bed.id, { autoBloom: on })).catch(() => {})}
            />
          )}
        </div>
      )}

      <h3 className="section-title section-title--small">Files</h3>
      <div className="slots">
        <MediaSlot
          kind="audio"
          title="Full song"
          description={choice === 'released' ? 'What fans hear' : 'Add before release'}
          value={song.audio}
          onChange={(key) => update({ audio: key })}
        />
        <MediaSlot
          kind="preview"
          title="Preview snippet"
          description="15–30 seconds, for upcoming and vault songs"
          value={song.preview}
          onChange={(key) => update({ preview: key })}
        />
        <MediaSlot
          kind="cover"
          title="Cover art"
          description={bed?.cover ? 'Optional: uses the bed’s cover otherwise' : 'Square works best'}
          value={song.cover}
          onChange={(key) => update({ cover: key })}
        />
      </div>

      <footer className="editor__foot">
        <ConfirmButton
          label="Delete song"
          confirm={`Delete “${song.title}” from the draft?`}
          onConfirm={() =>
            save(() => api.deleteSong(song.id))
              .then(() => navigate('/music'))
              .catch(() => {})
          }
        />
        <span className="muted">Its files stay in your media library.</span>
      </footer>
    </article>
  );
}

function ReleaseDate({ song, onSave }: { song: SongRow; onSave: (value: string | null) => Promise<unknown> }) {
  const initial = toLocalInputs(song.release_date);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time === '00:00' ? '' : initial.time);
  const [error, setError] = useState<string | null>(null);

  const commit = (nextDate: string, nextTime: string) => {
    const value = nextDate ? (nextTime ? `${nextDate}T${nextTime}` : nextDate) : null;
    onSave(value).then(
      () => setError(null),
      (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    );
  };

  return (
    <Field
      id="song-release-date"
      label="Release date"
      error={error}
      hint={`${time ? 'At that time' : 'At midnight'} ${zoneAbbreviation(song.release_date)} (New York time), for every fan everywhere.`}
    >
      <div className="date-row">
        <input
          id="song-release-date"
          className="input"
          type="date"
          value={date}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setDate(e.target.value);
            commit(e.target.value, time);
          }}
        />
        <input
          className="input"
          type="time"
          aria-label="Release time (optional)"
          value={time}
          disabled={!date}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setTime(e.target.value);
            commit(date, e.target.value);
          }}
        />
      </div>
    </Field>
  );
}
