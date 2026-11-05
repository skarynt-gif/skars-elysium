/** The media library: every song file and artwork in storage. */
import { useState } from 'react';
import { api, fileUrl, type MediaRow } from '../api.ts';
import { ConfirmButton } from '../components.tsx';
import { timeAgo } from '../format.ts';
import { refreshMedia, useStudio } from '../store.ts';
import { formatBytes, formatDuration } from '../upload.ts';

const KIND_NAMES = { audio: 'Full songs', preview: 'Previews', cover: 'Artwork' } as const;

export function FilesPage() {
  const media = useStudio((s) => s.media);
  const garden = useStudio((s) => s.garden);
  const [error, setError] = useState<string | null>(null);

  const usedBy = (key: string): string[] => {
    if (!garden) return [];
    return [
      ...garden.songs.filter((s) => s.audio === key || s.preview === key || s.cover === key).map((s) => s.title),
      ...garden.collections.filter((c) => c.cover === key).map((c) => `${c.title} (bed)`),
    ];
  };
  const total = media.reduce((sum, m) => sum + m.size, 0);

  return (
    <>
      <section className="summary">
        <h1 className="summary__title">Files</h1>
        <p className="muted">
          {media.length} files, {formatBytes(total)} of your 10 GB free storage. Add files from a song’s page in Music.
          Files a published version uses are kept so you can always roll back.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>
      {(Object.keys(KIND_NAMES) as (keyof typeof KIND_NAMES)[]).map((kind) => {
        const files = media.filter((m) => m.kind === kind);
        if (files.length === 0) return null;
        return (
          <section key={kind} className="card">
            <h2 className="card__title">{KIND_NAMES[kind]}</h2>
            <ul className="files">
              {files.map((file: MediaRow) => {
                const used = usedBy(file.key);
                return (
                  <li key={file.key} className="file">
                    {kind === 'cover' ? (
                      <img className="file__art" src={fileUrl(file.key)!} alt="" width={44} height={44} loading="lazy" />
                    ) : (
                      <audio className="file__audio" controls preload="none" src={fileUrl(file.key)!} />
                    )}
                    <span className="file__name">
                      {file.original_name ?? file.key.split('/').pop()}
                      <span className="muted">
                        {' '}
                        {file.size ? formatBytes(file.size) : 'missing from storage'}
                        {file.duration ? ` · ${formatDuration(file.duration)}` : ''} · added {timeAgo(file.created_at)}
                      </span>
                      <span className="file__use">{used.length ? `Used by ${used.join(', ')}` : 'Not used in the draft'}</span>
                    </span>
                    {used.length === 0 && (
                      <ConfirmButton
                        label="Delete"
                        confirm="Delete this file?"
                        onConfirm={() =>
                          api
                            .deleteMedia(file.key)
                            .then(() => {
                              setError(null);
                              return refreshMedia();
                            })
                            .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
                        }
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </>
  );
}
