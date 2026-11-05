import { useEffect, useState } from 'react';
import { displayTitle } from '../content/flowerRules.ts';
import { formatCountdown } from '../content/releases.ts';
import { findSong, stateOf } from '../audio/music.ts';
import { useGameStore } from '../state/gameStore.ts';
import { PixelIcon } from './icons.tsx';
import { closePanel } from './player/MusicPlayer.tsx';

/**
 * Selecting a golden bud (or a "???" teaser sprout): the song's title,
 * COMING SOON, its release date with a live countdown, and a PREVIEW button
 * when a snippet exists. Vault songs without audio use the same card.
 */
export function ComingSoonCard({ touch }: { touch: boolean }) {
  const panel = useGameStore((s) => s.uiPanel);
  const songId = useGameStore((s) => s.detailSongId);
  const content = useGameStore((s) => s.content);
  const [now, setNow] = useState(() => Date.now());

  const open = panel === 'details' && songId !== null;
  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [open]);

  if (!open || content.status !== 'ready') return null;
  const song = findSong(songId);
  if (!song) return null;
  const state = stateOf(song);
  const collection = content.manifest.collections.find((c) => c.id === song.collectionId);
  const releaseAt = song.releaseDate ? Date.parse(song.releaseDate) : null;
  const remaining = releaseAt !== null ? releaseAt - now : null;
  const isVault = state === 'ghost';
  const canPreview = Boolean(song.preview) && state !== 'sprout';

  const heading = isVault ? 'FROM THE VAULT' : state === 'bloom' ? 'OUT NOW' : 'COMING SOON';
  const dateText =
    releaseAt !== null
      ? new Date(releaseAt).toLocaleString(undefined, {
          weekday: 'short',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
      : null;

  const preview = () => {
    // Previews play through the same engine, so the visitor's effects apply too.
    useGameStore.getState().requestSong(song.id);
    closePanel(touch);
  };

  return (
    <div className="panel-backdrop" onPointerDown={(e) => e.stopPropagation()}>
      <section className="soon-card pixel-panel" role="dialog" aria-label={`${heading}: ${displayTitle(song, state)}`}>
        <header className="panel-header">
          <span className="panel-header__title">
            <PixelIcon name="lyre" size={14} /> {heading}
          </span>
          <button type="button" className="pixel-button" onClick={() => closePanel(touch)} aria-label="Close">
            <PixelIcon name="close" size={16} />
          </button>
        </header>
        <div className="greek-key greek-key--panel" aria-hidden="true" />

        <h2 className="soon-card__title">{displayTitle(song, state)}</h2>
        {collection && state !== 'sprout' && <p className="soon-card__ep">{collection.title}</p>}
        {state === 'sprout' && <p className="soon-card__ep">SOMETHING IS GROWING HERE…</p>}
        {state !== 'sprout' && song.flower?.label && <p className="song-tag">{song.flower.label.toUpperCase()}</p>}
        {state !== 'sprout' && song.description && <p className="song-description">{song.description}</p>}

        {remaining !== null && remaining > 0 && (
          <div className="soon-card__countdown" aria-live="off">
            <span className="soon-card__label">BLOOMS IN</span>
            <span className="soon-card__clock">{formatCountdown(remaining)}</span>
          </div>
        )}
        {remaining !== null && remaining <= 0 && state !== 'bloom' && <p className="soon-card__label">ANY MOMENT NOW…</p>}
        {dateText && <p className="soon-card__date">{dateText.toUpperCase()}</p>}

        {canPreview ? (
          <button type="button" className="pixel-button pixel-button--text pixel-button--primary" onClick={preview}>
            <PixelIcon name="play" size={14} /> PLAY PREVIEW
          </button>
        ) : (
          <p className="soon-card__note">{isVault ? 'THIS ONE STAYS IN THE VAULT FOR NOW.' : 'NO PREVIEW YET. CHECK BACK SOON.'}</p>
        )}
      </section>
    </div>
  );
}
