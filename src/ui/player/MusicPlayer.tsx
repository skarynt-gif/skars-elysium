import { findSong, playNext, playPrevious, seekTo, stateOf, togglePlay, trackFor } from '../../audio/music.ts';
import { formatTime } from '../../audio/queue.ts';
import { displayTitle } from '../../content/flowerRules.ts';
import { relockPointer } from '../../game/input/DesktopInput.tsx';
import { useGameStore } from '../../state/gameStore.ts';
import { PixelIcon } from '../icons.tsx';
import { PixelSlider } from '../PixelSlider.tsx';
import { CoverArt } from './CoverArt.tsx';
import { Visualizer } from './Visualizer.tsx';
import { EffectsPanel } from './EffectsPanel.tsx';

/** Opens the full player (desktop: frees the mouse so sliders can be dragged). */
export function openPlayerPanel(): void {
  const store = useGameStore.getState();
  store.setPlayerOpen(true);
  store.setUiPanel('player');
  if (document.pointerLockElement) document.exitPointerLock();
}

/** Back to the compact bar (desktop: recaptures the mouse; this runs inside a click). */
export function closePanel(touch: boolean): void {
  useGameStore.getState().setUiPanel('none');
  if (!touch) relockPointer();
}

/**
 * The retro fantasy music player: a compact bar while exploring, and a full
 * panel with artwork, progress, controls, volume, a live visualizer, and
 * speed/reverb/delay effects.
 */
export function MusicPlayer({ touch }: { touch: boolean }) {
  const phase = useGameStore((s) => s.phase);
  const playerOpen = useGameStore((s) => s.playerOpen);
  const panel = useGameStore((s) => s.uiPanel);
  const currentSongId = useGameStore((s) => s.currentSongId);
  const content = useGameStore((s) => s.content);
  const playback = useGameStore((s) => s.playback);

  // Computed fresh each render (cheap): a bud that blooms mid-visit updates immediately.
  const info = (() => {
    const song = findSong(currentSongId);
    if (!song || content.status !== 'ready') return null;
    const collection = content.manifest.collections.find((c) => c.id === song.collectionId);
    return {
      song,
      album: collection?.title ?? '',
      cover: song.cover ?? collection?.cover,
      playable: trackFor(song) !== null,
      state: stateOf(song),
    };
  })();

  if (phase !== 'exploring' || !info) return null;
  const expanded = panel === 'player';
  if (!playerOpen && !expanded) return null;

  const isLoaded = playback.trackId === info.song.id;
  const playing = isLoaded && playback.status === 'playing';
  const loading = playback.status === 'loading' && isLoaded;

  let status: string | null = null;
  if (playback.error) status = playback.error.toUpperCase();
  else if (loading) status = 'LOADING…';
  else if (isLoaded && playback.status === 'blocked') status = touch ? 'TAP ▶ TO PLAY' : 'PRESS ▶ TO PLAY';
  else if (!info.playable && (info.state === 'bud' || info.state === 'sprout')) status = 'COMING SOON';
  else if (!info.playable) status = 'NOT AVAILABLE TO PLAY';

  const releaseDate = info.song.releaseDate
    ? new Date(info.song.releaseDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  const controls = (size: number) => (
    <div className="player__controls">
      <button type="button" className="pixel-button" onClick={playPrevious} aria-label="Previous song">
        <PixelIcon name="prev" size={size} />
      </button>
      <button
        type="button"
        className="pixel-button pixel-button--primary"
        onClick={togglePlay}
        disabled={!info.playable}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        <PixelIcon name={playing || loading ? 'pause' : 'play'} size={size} />
      </button>
      <button type="button" className="pixel-button" onClick={playNext} aria-label="Next song">
        <PixelIcon name="next" size={size} />
      </button>
    </div>
  );

  const progress = isLoaded ? playback.position / (playback.duration || 1) : 0;

  if (!expanded) {
    return (
      <section className="player-bar pixel-panel" aria-label="Music player" onPointerDown={(e) => e.stopPropagation()}>
        <CoverArt src={info.cover} spinning={playing} size="small" />
        <div className="player-bar__text">
          <span className="player-bar__title">{displayTitle(info.song, info.state)}</span>
          <span className="player-bar__artist">{status ?? info.song.artist}</span>
        </div>
        <button type="button" className="pixel-button" onClick={togglePlay} disabled={!info.playable} aria-label={playing ? 'Pause' : 'Play'}>
          <PixelIcon name={playing || loading ? 'pause' : 'play'} size={16} />
        </button>
        <button type="button" className="pixel-button" onClick={playNext} aria-label="Next song">
          <PixelIcon name="next" size={16} />
        </button>
        <button type="button" className="pixel-button" onClick={openPlayerPanel} aria-label="Open full player">
          <PixelIcon name="up" size={16} />
        </button>
        <button
          type="button"
          className="pixel-button"
          onClick={() => useGameStore.getState().setPlayerOpen(false)}
          aria-label="Hide player (music keeps playing)"
        >
          <PixelIcon name="close" size={16} />
        </button>
        <div className="player-bar__progress" style={{ width: `${progress * 100}%` }} />
      </section>
    );
  }

  return (
    <div className="panel-backdrop" onPointerDown={(e) => e.stopPropagation()}>
      <section className="player-panel pixel-panel" role="dialog" aria-label="Music player">
        <header className="panel-header">
          <span className="panel-header__title">
            <PixelIcon name="note" size={14} /> NOW PLAYING
          </span>
          <button type="button" className="pixel-button" onClick={() => closePanel(touch)} aria-label="Close full player">
            <PixelIcon name="down" size={16} />
          </button>
        </header>
        <div className="greek-key greek-key--panel" aria-hidden="true" />

        <div className="player-panel__main">
          <CoverArt src={info.cover} spinning={playing} size="large" />
          <div className="player-panel__info">
            <h2 className="player-panel__title">{displayTitle(info.song, info.state)}</h2>
            {info.state !== 'sprout' && info.song.flower?.label && <p className="song-tag">{info.song.flower.label.toUpperCase()}</p>}
            <p className="player-panel__artist">{info.song.artist}</p>
            {info.album && <p className="player-panel__album">{info.album}</p>}
            {info.state === 'bud' && releaseDate && <p className="player-panel__release">RELEASES {releaseDate.toUpperCase()}</p>}
            {status && <p className="player-panel__status">{status}</p>}
          </div>
        </div>
        {info.state !== 'sprout' && info.song.description && <p className="song-description">{info.song.description}</p>}

        <div className="player-panel__progress">
          <PixelSlider
            label="Song position"
            hideLabel
            value={isLoaded ? playback.position : 0}
            min={0}
            max={isLoaded && playback.duration > 0 ? playback.duration : 1}
            step={0.5}
            disabled={!isLoaded || !(playback.duration > 0)}
            onChange={seekTo}
            format={formatTime}
          />
          <div className="player-panel__times">
            <span>{formatTime(isLoaded ? playback.position : 0)}</span>
            <span>{formatTime(isLoaded ? playback.duration : 0)}</span>
          </div>
        </div>

        {controls(22)}

        <div className="player-panel__row">
          <VolumeControl />
          <Visualizer active={playing} />
        </div>

        <EffectsPanel />

      </section>
    </div>
  );
}

function VolumeControl() {
  const volume = useGameStore((s) => s.volume);
  const setVolume = useGameStore((s) => s.setVolume);
  return (
    <div className="volume">
      <button
        type="button"
        className="pixel-button"
        aria-label={volume > 0 ? 'Mute' : 'Unmute'}
        onClick={() => setVolume(volume > 0 ? 0 : 0.8)}
      >
        <PixelIcon name={volume > 0 ? 'volume' : 'mute'} size={16} />
      </button>
      <PixelSlider label="Volume" hideLabel value={volume} min={0} max={1} onChange={setVolume} format={(v) => `${Math.round(v * 100)}%`} />
    </div>
  );
}
