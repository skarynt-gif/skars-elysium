/**
 * The Studio page's shared state: the draft garden, the media library and
 * the autosave indicator. Every edit goes straight to the server, which
 * answers with the updated garden, so what you see is always what's saved.
 */
import { create } from 'zustand';
import { api, ApiError, type DraftGarden, type MediaRow, type StudioStatus } from './api.ts';

export type SaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; at: number } | { kind: 'error'; message: string };

interface StudioState {
  status: StudioStatus | null;
  /** Fatal problem loading the Studio at all (locked, offline). */
  fatal: ApiError | null;
  garden: DraftGarden | null;
  media: MediaRow[];
  save: SaveState;
  /** In-flight saves; the indicator shows "Saving…" until all finish. */
  pending: number;
}

export const useStudio = create<StudioState>()(() => ({
  status: null,
  fatal: null,
  garden: null,
  media: [],
  save: { kind: 'idle' },
  pending: 0,
}));

const asApiError = (error: unknown) =>
  error instanceof ApiError ? error : new ApiError(error instanceof Error ? error.message : String(error), 0);

export async function loadStudio(): Promise<void> {
  try {
    const status = await api.status();
    useStudio.setState({ status, fatal: null });
    if (status.database.ok) {
      const [garden, media] = await Promise.all([api.garden(), api.media().catch(() => ({ files: [] }))]);
      useStudio.setState({ garden, media: media.files });
    }
  } catch (error) {
    useStudio.setState({ fatal: asApiError(error) });
  }
}

export async function refreshStatus(): Promise<void> {
  try {
    useStudio.setState({ status: await api.status() });
  } catch {
    // The next save will surface any problem.
  }
}

export async function refreshMedia(): Promise<void> {
  const { files } = await api.media();
  useStudio.setState({ media: files });
}

/**
 * Runs one save. On success the server's garden replaces ours; on failure
 * the error is shown in the indicator and re-thrown for the form to show
 * next to the field.
 */
export async function save<T extends DraftGarden>(action: () => Promise<T>): Promise<T> {
  useStudio.setState((s) => ({ pending: s.pending + 1, save: { kind: 'saving' } }));
  try {
    const garden = await action();
    useStudio.setState((s) => ({
      garden: {
        collections: garden.collections,
        songs: garden.songs,
        decorations: garden.decorations,
        environment: garden.environment,
        issues: garden.issues,
      },
      pending: s.pending - 1,
      save: s.pending - 1 > 0 ? { kind: 'saving' } : { kind: 'saved', at: Date.now() },
    }));
    void refreshStatus();
    return garden;
  } catch (error) {
    const err = asApiError(error);
    useStudio.setState((s) => ({ pending: s.pending - 1, save: { kind: 'error', message: err.message } }));
    if (err.code === 'auth') useStudio.setState({ fatal: err });
    throw err;
  }
}
