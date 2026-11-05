/**
 * Save, preview, publish: see what changed, try it in the real game
 * privately, put it live, and go back to any earlier version.
 */
import { useEffect, useState, type ChangeEvent } from 'react';
import { api, ApiError, type Change, type ContentIssue, type Version } from '../api.ts';
import { ConfirmButton, IssueList } from '../components.tsx';
import { formatMoment, plural, timeAgo } from '../format.ts';
import { loadStudio, refreshStatus, useStudio } from '../store.ts';

const KIND_LABEL: Record<Change['kind'], string> = { added: 'New', removed: 'Removed', changed: 'Changed' };
const WHAT_LABEL: Record<Change['what'], string> = { song: 'song', bed: 'bed', decorations: '', atmosphere: '' };

export function PublishPage() {
  const status = useStudio((s) => s.status);
  const garden = useStudio((s) => s.garden);
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [issues, setIssues] = useState<ContentIssue[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string; problems?: string[] } | null>(null);

  const reload = async () => {
    const [c, v] = await Promise.all([api.changes(), api.versions()]);
    setChanges(c.changes);
    setIssues(c.issues);
    setVersions(v.versions);
  };
  useEffect(() => {
    void reload().catch((e: unknown) => setResult({ ok: false, text: e instanceof Error ? e.message : String(e) }));
    // Re-check whenever the draft changes (edits made in other tabs of the Studio).
  }, [garden]);

  const errors = issues.filter((i) => i.severity === 'error');
  const canPublish = Boolean(changes && changes.length > 0 && errors.length === 0 && !busy);
  const gardenUrl = status?.gardenUrl;

  const publish = async () => {
    setBusy(true);
    setResult(null);
    try {
      const { version } = await api.publish(note.trim());
      setNote('');
      setResult({ ok: true, text: `Version ${version.id} is live. Visitors see it on their next visit (or reload).` });
      await Promise.all([reload(), refreshStatus()]);
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(String(e), 0);
      setResult({ ok: false, text: err.message, problems: err.problems });
    } finally {
      setBusy(false);
    }
  };

  const restore = async (v: Version) => {
    setResult(null);
    try {
      await api.restore(v.id);
      setResult({ ok: true, text: `Version ${v.id} is live again, and your draft now matches it.` });
      await loadStudio();
      await reload();
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(String(e), 0);
      setResult({ ok: false, text: err.message, problems: err.problems });
    }
  };

  return (
    <>
      <section className="summary">
        <h1 className="summary__title">Publish</h1>
        <p className="muted">
          Everything you change in the Studio is saved as a private draft. Visitors keep seeing the last published version until you publish.
        </p>
      </section>

      {status?.live.changedOutside && (
        <p className="card card--alert-soft" role="alert">
          The live garden was changed outside the Studio (for example with <code>npm run publish-media</code>). Publishing will replace those
          changes. To keep them instead, use <strong>Home → Start over from the live garden</strong>.
        </p>
      )}

      <section className="card card--feature">
        <h2 className="card__title">1. Check your changes</h2>
        {changes === null ? (
          <p className="muted">Comparing with the live garden…</p>
        ) : changes.length === 0 ? (
          <p>No changes since the last publish. The live garden matches your draft.</p>
        ) : (
          <ul className="changes">
            {changes.map((c, i) => (
              <li key={i} className={`change change--${c.kind}`}>
                <span className="change__kind">{KIND_LABEL[c.kind]}</span>
                <span>
                  {WHAT_LABEL[c.what] && <span className="muted">{WHAT_LABEL[c.what]} </span>}
                  <strong>{c.name}</strong>
                  {c.details.length > 0 && <span className="muted"> · {c.details.join(', ')}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
        <IssueList issues={issues} />
      </section>

      <section className="card">
        <h2 className="card__title">2. Try it privately</h2>
        <p>Walk through your draft garden in the real game. Only you can open it, and nothing goes live.</p>
        <a className="btn btn--ghost" href="/preview/" target="_blank" rel="noopener">
          Open private preview ↗
        </a>
      </section>

      <section className="card card--feature">
        <h2 className="card__title">3. Publish</h2>
        <label className="field__label" htmlFor="publish-note">
          Note for your history (optional)
        </label>
        <input
          id="publish-note"
          className="input"
          maxLength={200}
          placeholder="e.g. First Light is out"
          value={note}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setNote(e.target.value)}
        />
        <div className="row publish-row">
          <button type="button" className="btn btn--big" disabled={!canPublish} onClick={() => void publish()}>
            {busy ? 'Publishing…' : 'Publish to the garden'}
          </button>
          {errors.length > 0 && <span className="error">Fix {plural(errors.length, 'problem')} above first.</span>}
          {gardenUrl && result?.ok && (
            <a className="btn btn--ghost" href={gardenUrl} target="_blank" rel="noopener">
              Open the garden ↗
            </a>
          )}
        </div>
        {result && (
          <div className={result.ok ? 'notice notice--ok' : 'notice notice--error'} role={result.ok ? 'status' : 'alert'}>
            <p>{result.text}</p>
            {result.problems && result.problems.length > 0 && (
              <ul>
                {result.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="card__title">History</h2>
        <p className="muted small">Every published version is kept. Restoring one makes it live again and replaces your draft with it.</p>
        <ol className="versions">
          {versions.map((v, i) => (
            <li key={v.id} className="version">
              <span className="version__id">v{v.id}</span>
              <span className="version__main">
                <strong>{v.note ?? 'Published'}</strong>
                {i === 0 && <span className="badge badge--live">Live</span>}
                <span className="muted small">
                  {timeAgo(v.createdAt)} ({formatMoment(v.createdAt)}) · {v.author} · {plural(v.songs, 'song')}, {plural(v.collections, 'bed')}
                </span>
              </span>
              {i > 0 && (
                <ConfirmButton
                  label="Restore"
                  confirm={`Make v${v.id} live again and replace your draft?`}
                  onConfirm={() => restore(v)}
                />
              )}
            </li>
          ))}
          {versions.length === 0 && <li className="muted">Nothing published from the Studio yet.</li>}
        </ol>
      </section>
    </>
  );
}
