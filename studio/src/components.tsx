/** Small building blocks shared by the Studio pages. */
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { ApiError, fileUrl, type ContentIssue, type MediaKind, type MediaRow } from './api.ts';
import { issueWhere, plural } from './format.ts';
import { useStudio } from './store.ts';
import { ACCEPT, formatBytes, formatDuration, isAudioFile, isImageFile, uploadFile } from './upload.ts';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

// ---------- autosaving fields ----------

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  id: string;
}

export function Field({ label, hint, error, children, id }: FieldProps) {
  return (
    <div className={`field${error ? ' field--error' : ''}`}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="field__error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="field__hint">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * Text that saves itself: a moment after you stop typing, and when you leave
 * the field. Outside changes (another tab, a server correction) show up unless
 * you're mid-edit.
 */
export function TextField({
  id,
  label,
  value,
  onSave,
  hint,
  multiline = false,
  maxLength,
  placeholder,
}: {
  id: string;
  label: string;
  value: string | null;
  onSave: (value: string) => Promise<unknown>;
  hint?: ReactNode;
  multiline?: boolean;
  maxLength?: number;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value ?? '');
  const [error, setError] = useState<string | null>(null);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saved = useRef(value ?? '');

  useEffect(() => {
    saved.current = value ?? '';
    if (!dirty.current) setDraft(value ?? '');
  }, [value]);

  const flush = async (text: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (text === saved.current) {
      dirty.current = false;
      // Typing back the saved value undoes a failed edit: nothing is unsaved any more.
      if (error) {
        setError(null);
        if (useStudio.getState().save.kind === 'error') useStudio.setState({ save: { kind: 'saved', at: Date.now() } });
      }
      return;
    }
    try {
      await onSave(text);
      saved.current = text;
      setError(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      dirty.current = false;
    }
  };

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const change = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const next = e.target.value;
    setDraft(next);
    dirty.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(next), 900);
  };

  const common = {
    id,
    value: draft,
    onChange: change,
    onBlur: () => void flush(draft),
    maxLength,
    placeholder,
    className: 'input',
  };
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      {multiline ? <textarea rows={4} {...common} /> : <input type="text" {...common} />}
    </Field>
  );
}

export function SelectField({
  id,
  label,
  value,
  options,
  onSave,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onSave: (value: string) => Promise<unknown>;
  hint?: ReactNode;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <select
        id={id}
        className="input"
        value={value}
        onChange={(e: ChangeEvent<HTMLSelectElement>) => {
          onSave(e.target.value).then(
            () => setError(null),
            (err: unknown) => setError(errorText(err)),
          );
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** A row of mutually exclusive buttons (radio group). */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            className={`segmented__item${o.value === value ? ' segmented__item--on' : ''}`}
            title={o.hint}
            onClick={() => o.value !== value && onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (on: boolean) => void; hint?: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.checked)} />
      <span className="toggle__track" aria-hidden="true" />
      <span>
        <span className="toggle__label">{label}</span>
        {hint && <span className="toggle__hint">{hint}</span>}
      </span>
    </label>
  );
}

// ---------- media ----------

interface DropEventLike {
  preventDefault(): void;
  dataTransfer: DataTransfer | null;
}

/** Shared drag-and-drop handling: highlights while a file hovers. */
export function useDrop(onFiles: (files: File[]) => void) {
  const [over, setOver] = useState(false);
  return {
    over,
    handlers: {
      onDragOver: (e: DropEventLike) => {
        e.preventDefault();
        if (!over) setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: DropEventLike) => {
        e.preventDefault();
        setOver(false);
        const files = Array.from(e.dataTransfer?.files ?? []);
        if (files.length) onFiles(files);
      },
    },
  };
}

const KIND_LABEL: Record<MediaKind, string> = { audio: 'full song', preview: 'preview snippet', cover: 'cover art' };

/**
 * One media slot (full song, preview, or cover): shows what's there, plays
 * it, and takes a new file by drop, by browsing, or from the library.
 */
export function MediaSlot({
  kind,
  title,
  value,
  onChange,
  description,
}: {
  kind: MediaKind;
  title: string;
  value: string | null;
  onChange: (key: string | null) => Promise<unknown>;
  description?: string;
}) {
  const media = useStudio((s) => s.media);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);
  const file = value ? media.find((m) => m.key === value) : undefined;

  const take = async (files: File[]) => {
    const chosen = files[0];
    if (!chosen) return;
    const fits = kind === 'cover' ? isImageFile(chosen) : isAudioFile(chosen);
    if (!fits) {
      setError(kind === 'cover' ? 'That isn’t an image. Use a JPG, PNG or WebP.' : 'That isn’t audio. Use an MP3, M4A or WAV.');
      return;
    }
    setError(null);
    setProgress(0);
    try {
      const uploaded = await uploadFile(kind, chosen, (p) => setProgress(p.total ? p.loaded / p.total : 0));
      useStudio.setState((s) => ({ media: [uploaded, ...s.media] }));
      await onChange(uploaded.key);
    } catch (e) {
      setError(errorText(e));
      if (e instanceof ApiError && e.code === 'auth') useStudio.setState({ fatal: e });
    } finally {
      setProgress(null);
    }
  };
  const { over, handlers } = useDrop((files) => void take(files));
  const choices = media.filter((m) => m.kind === kind && m.size > 0);
  const url = fileUrl(value);

  return (
    <div className={`slot${over ? ' slot--over' : ''}${value ? '' : ' slot--empty'}`} {...handlers}>
      <div className="slot__head">
        <span className="slot__title">{title}</span>
        {description && <span className="slot__desc">{description}</span>}
      </div>

      {progress !== null ? (
        <div className="progress" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="progress__bar" style={{ width: `${Math.round(progress * 100)}%` }} />
          <span className="progress__label">Uploading… {Math.round(progress * 100)}%</span>
        </div>
      ) : value && url ? (
        <div className="slot__current">
          {kind === 'cover' ? (
            <img className="slot__cover" src={url} alt="" width={72} height={72} />
          ) : (
            <audio className="slot__audio" controls preload="none" src={url} />
          )}
          <span className="slot__meta">
            {file?.original_name ?? value.split('/').pop()}
            {file && file.size > 0 && ` · ${formatBytes(file.size)}`}
            {file?.duration ? ` · ${formatDuration(file.duration)}` : ''}
            {file && file.size === 0 && <strong className="warn"> · missing from storage, upload it again</strong>}
          </span>
        </div>
      ) : (
        <p className="slot__empty">Drop a file here, or</p>
      )}

      <div className="slot__actions">
        <button type="button" className="btn btn--small" onClick={() => input.current?.click()} disabled={progress !== null}>
          {value ? 'Replace…' : 'Choose file…'}
        </button>
        {choices.length > 0 && (
          <button type="button" className="btn btn--small btn--ghost" onClick={() => setPicking(!picking)} aria-expanded={picking}>
            From library
          </button>
        )}
        {value && (
          <button
            type="button"
            className="btn btn--small btn--ghost"
            onClick={() => onChange(null).catch((e: unknown) => setError(errorText(e)))}
          >
            Remove
          </button>
        )}
        <input
          ref={input}
          type="file"
          accept={ACCEPT[kind]}
          hidden
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            void take(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
      </div>

      {picking && (
        <ul className="picker" aria-label={`Choose a ${KIND_LABEL[kind]} from the library`}>
          {choices.map((m: MediaRow) => (
            <li key={m.key}>
              <button
                type="button"
                className={`picker__item${m.key === value ? ' picker__item--on' : ''}`}
                onClick={() => {
                  setPicking(false);
                  onChange(m.key).catch((e: unknown) => setError(errorText(e)));
                }}
              >
                {kind === 'cover' && <img src={fileUrl(m.key)!} alt="" width={28} height={28} />}
                <span>{m.original_name ?? m.key.split('/').pop()}</span>
                <span className="muted">
                  {formatBytes(m.size)}
                  {m.duration ? ` · ${formatDuration(m.duration)}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// ---------- feedback ----------

/** "songs[3] \"slow-burn\"" → "Song “Slow Burn”", using names from the draft when possible. */
function useIssueWhere(): (issue: ContentIssue) => string {
  const garden = useStudio((s) => s.garden);
  return (issue) => {
    const generic = issueWhere(issue);
    const id = /"([^"]+)"/.exec(issue.path)?.[1];
    if (!id || !garden) return generic;
    const song = issue.path.startsWith('songs') ? garden.songs.find((s) => s.id === id) : undefined;
    const bed = issue.path.startsWith('collections') ? garden.collections.find((c) => c.id === id) : undefined;
    return song ? `Song “${song.title}”` : bed ? `Bed “${bed.title}”` : generic;
  };
}

export function IssueList({ issues, title }: { issues: ContentIssue[]; title?: string }) {
  const where = useIssueWhere();
  if (issues.length === 0) return null;
  const errors = issues.filter((i) => i.severity === 'error');
  return (
    <details className={`issues ${errors.length ? 'issues--error' : ''}`} open={errors.length > 0}>
      <summary>
        {title ??
          (errors.length
            ? `${plural(errors.length, 'problem')} to fix before publishing`
            : `${plural(issues.length, 'note')} about your garden`)}
      </summary>
      <ul>
        {issues.map((issue, index) => (
          <li key={index} className={`issue issue--${issue.severity}`}>
            {/* The game skips broken entries ("Skipped."); here they're simply things to fix. */}
            <strong>{where(issue)}:</strong> {issue.message.replace(/^Skipped\. /, '')}
          </li>
        ))}
      </ul>
    </details>
  );
}

export function SaveIndicator() {
  const save = useStudio((s) => s.save);
  if (save.kind === 'idle') return null;
  if (save.kind === 'saving') return <span className="save save--busy">Saving…</span>;
  if (save.kind === 'saved') return <span className="save save--ok">All changes saved</span>;
  return (
    <span className="save save--error" title={save.message}>
      Not saved: {save.message}
    </span>
  );
}

/** A button that asks "are you sure?" inline before doing something destructive. */
export function ConfirmButton({ label, confirm, onConfirm }: { label: string; confirm: string; onConfirm: () => Promise<unknown> }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!asking) {
    return (
      <button type="button" className="btn btn--danger btn--small" onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  }
  return (
    <span className="confirm">
      <span>{confirm}</span>
      <button
        type="button"
        className="btn btn--danger btn--small"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          onConfirm().finally(() => {
            setBusy(false);
            setAsking(false);
          });
        }}
      >
        Yes
      </button>
      <button type="button" className="btn btn--ghost btn--small" onClick={() => setAsking(false)}>
        No
      </button>
    </span>
  );
}
