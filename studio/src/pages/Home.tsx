/** Home: setup status, import, and an overview of the draft. */
import { useState } from 'react';
import { api, ApiError, type DraftGarden, type ImportResult, type StudioStatus } from '../api.ts';
import { IssueList } from '../components.tsx';
import { areaLabel, bedTypeLabel, groupByBed, plural, songBadge, timeAgo } from '../format.ts';
import { loadStudio, useStudio } from '../store.ts';

const asApiError = (error: unknown) =>
  error instanceof ApiError ? error : new ApiError(error instanceof Error ? error.message : String(error), 0);

export function HomePage() {
  const status = useStudio((s) => s.status);
  const garden = useStudio((s) => s.garden);
  if (!status) return null;
  const hasDraft = Boolean(garden && garden.collections.length + garden.songs.length > 0);
  return (
    <>
      <Summary status={status} />
      <SystemChecks status={status} />
      <ImportCard status={status} onImported={() => void loadStudio()} />
      {hasDraft && garden && <GardenOverview garden={garden} />}
    </>
  );
}



export function Summary({ status }: { status: StudioStatus }) {
  const draft = status.draft;
  const published = status.lastPublish;
  return (
    <section className="summary">
      <h1 className="summary__title">Your garden</h1>
      <p className="summary__line">
        {draft
          ? draft.songs + draft.collections > 0
            ? `Your draft has ${plural(draft.songs, 'song')} in ${plural(draft.collections, 'bed')}.`
            : 'Your draft is empty.'
          : 'Connect the database to start your draft.'}{' '}
        {published
          ? `Last published ${timeAgo(published.createdAt)} (${published.note ?? 'no note'}).`
          : 'Nothing has been published from the Studio yet.'}
      </p>
      {draft && draft.changes > 0 ? (
        <p className="summary__line">
          <strong className="warn">{plural(draft.changes, 'unpublished change')}.</strong> <a href="#/publish">Review and publish</a>
        </p>
      ) : null}
      <p className="muted">
        Changes you make here stay private until you publish them. Visitors always see the last published version.
      </p>
    </section>
  );
}

function SystemChecks({ status }: { status: StudioStatus }) {
  const live = status.live;
  const rows: { label: string; ok: boolean; detail: string }[] = [
    { label: 'Sign-in', ok: true, detail: `Locked to your email (${status.email})` },
    { label: 'Database', ok: status.database.ok, detail: status.database.message },
    { label: 'Media storage', ok: status.storage.ok, detail: status.storage.message },
    {
      label: 'Live garden',
      ok: live.found,
      detail: live.found
        ? `${plural(live.songs ?? 0, 'song')} in ${plural(live.collections ?? 0, 'bed')}, updated ${timeAgo(live.updatedAt!)}`
        : status.storage.ok
          ? 'No song list published yet'
          : 'Waiting for media storage',
    },
  ];
  const allGood = rows.every((r) => r.ok);
  return (
    <section className="card">
      <h2 className="card__title">{allGood ? 'Everything is connected' : 'Setup'}</h2>
      <ul className="checks">
        {rows.map((r) => (
          <li key={r.label} className={`check ${r.ok ? 'check--ok' : 'check--todo'}`}>
            <span className="check__mark" aria-hidden="true">
              {r.ok ? '✓' : '!'}
            </span>
            <span className="check__label">{r.label}</span>
            <span className="check__detail">{r.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ImportCard({ status, onImported }: { status: StudioStatus; onImported: () => void }) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const draftEmpty = !status.draft || status.draft.songs + status.draft.collections === 0;
  const ready = status.database.ok && status.storage.ok && status.live.found;
  // Once the draft has content, importing is a rare "start over" action, tucked away.
  if (!draftEmpty && !confirming && !result) {
    return (
      <details className="card card--quiet">
        <summary className="card__summary">Start over from the live garden</summary>
        <p className="muted">
          Replaces your draft with exactly what visitors see right now. Unpublished changes are lost.
        </p>
        <button type="button" className="btn btn--danger" disabled={!ready} onClick={() => setConfirming(true)}>
          Replace my draft…
        </button>
      </details>
    );
  }

  const run = async (replace: boolean) => {
    setBusy(true);
    setError(null);
    try {
      setResult(await api.importLive(replace));
      setConfirming(false);
      onImported();
    } catch (e) {
      const err = asApiError(e);
      if (err.code === 'draft-not-empty') setConfirming(true);
      else setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card card--feature">
      {result ? (
        <>
          <h2 className="card__title">Garden imported</h2>
          <p>
            {plural(result.songs, 'song')} in {plural(result.collections, 'bed')} are now in your draft, and this version is
            saved as the first entry in your publish history.
          </p>
          <IssueList issues={result.issues} />
        </>
      ) : confirming ? (
        <>
          <h2 className="card__title">Replace your draft?</h2>
          <p>Your draft will be replaced with the live garden. Anything you haven’t published will be lost.</p>
          <div className="row">
            <button type="button" className="btn btn--danger" disabled={busy} onClick={() => void run(true)}>
              {busy ? 'Replacing…' : 'Yes, replace it'}
            </button>
            <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <h2 className="card__title">Bring in your current garden</h2>
          <p>
            Copies the beds and songs visitors see today into the Studio, so you can manage them here from now on. Nothing
            changes for visitors.
          </p>
          {!ready && (
            <p className="muted">
              {status.live.found ? 'Connect the database and media storage first.' : 'Available once a song list is published (DEPLOY.md step 5).'}
            </p>
          )}
          <button type="button" className="btn" disabled={!ready || busy} onClick={() => void run(false)}>
            {busy ? 'Importing…' : 'Import live garden'}
          </button>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function GardenOverview({ garden }: { garden: DraftGarden }) {
  const { collections, songs, issues } = garden;
  return (
    <section className="beds" aria-label="Draft garden">
      <h2 className="section-title">Beds in your draft</h2>
      <IssueList issues={issues} />
      <div className="beds__grid">
        {groupByBed(collections, songs).map(({ bed, songs: bedSongs }) => (
          <article key={bed.id} className="bed">
            <header className="bed__head">
              <h3 className="bed__title">{bed.title}</h3>
              <span className="bed__meta">
                {bedTypeLabel(bed.type)} · {areaLabel(bed.area)}
                {bed.auto_bloom ? ' · auto-bloom' : ''}
              </span>
            </header>
            {bedSongs.length === 0 ? (
              <p className="muted bed__empty">No songs yet</p>
            ) : (
              <ol className="bed__songs">
                {bedSongs.map((song) => {
                  const badge = songBadge(song);
                  return (
                    <li key={song.id} className="song">
                      <a className="song__title" href={`#/music/${encodeURIComponent(song.id)}`}>
                        {song.title}
                      </a>
                      <span className={`badge badge--${badge.tone}`}>{badge.label}</span>
                    </li>
                  );
                })}
              </ol>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
