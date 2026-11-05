import type { EngineState, Track } from './engine.ts';

/**
 * Lock-screen, notification-shade and headphone-button controls, with title,
 * artist and cover art. Silently does nothing on browsers without support.
 */
export interface MediaHandlers {
  play: () => void;
  pause: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
}

const supported = () => typeof navigator !== 'undefined' && 'mediaSession' in navigator;

export function setupMediaSession(handlers: MediaHandlers): void {
  if (!supported()) return;
  const set = (action: MediaSessionAction, fn: MediaSessionActionHandler | null) => {
    try {
      navigator.mediaSession.setActionHandler(action, fn);
    } catch {
      // Some browsers don't support every action.
    }
  };
  set('play', handlers.play);
  set('pause', handlers.pause);
  set('nexttrack', handlers.next);
  set('previoustrack', handlers.previous);
  set('seekto', (details) => {
    if (typeof details.seekTime === 'number') handlers.seek(details.seekTime);
  });
}

export function updateMediaSession(track: Track | null, state: EngineState): void {
  if (!supported()) return;
  try {
    if (track) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album,
        artwork: track.artwork ? [{ src: track.artwork, sizes: '512x512' }] : [],
      });
    }
    navigator.mediaSession.playbackState = state.status === 'playing' ? 'playing' : state.status === 'idle' ? 'none' : 'paused';
    if (state.duration > 0 && Number.isFinite(state.duration)) {
      navigator.mediaSession.setPositionState({
        duration: state.duration,
        position: Math.min(state.position, state.duration),
        playbackRate: 1,
      });
    }
  } catch {
    // Position state can throw on odd values mid-load; it's cosmetic.
  }
}
