import { useEffect } from 'react';
import { startGesture } from '../platform/startGesture.ts';
import { useGameStore } from '../state/gameStore.ts';
import { setupMediaSession, updateMediaSession } from './mediaSession.ts';
import { applyEffects, findSong, getEngine, playNext, playPrevious, seekTo, trackFor } from './music.ts';

/**
 * Glue between the game and the audio engine (renders nothing):
 *   PRESS START          → unlock audio (must happen inside that tap)
 *   flower selected      → load and crossfade to its song
 *   song ends            → next song in the same bed
 *   engine state changes → store (for the player UI) and lock screen
 */
export function MusicController() {
  useEffect(() => {
    const engine = getEngine();
    const offStart = startGesture.onStart(() => engine.unlock());

    const offState = engine.subscribe((state) => {
      useGameStore.getState().setPlayback(state);
      const song = findSong(state.trackId);
      updateMediaSession(song ? trackFor(song) : null, state);
    });

    const offEnded = engine.onEnded(() => playNext());

    setupMediaSession({
      play: () => engine.resume(),
      pause: () => engine.pause(),
      next: playNext,
      previous: playPrevious,
      seek: seekTo,
    });

    // Every selection (flower, next/previous, auto-advance) arrives here.
    const offRequests = useGameStore.subscribe((state, prev) => {
      if (state.songRequest === prev.songRequest) return;
      const song = findSong(state.currentSongId);
      const track = song ? trackFor(song) : null;
      // Buds without a preview only show their details card; music keeps playing.
      if (track) void engine.play(track);
    });

    const offVolume = useGameStore.subscribe((state, prev) => {
      if (state.volume !== prev.volume) engine.setVolume(state.volume);
    });
    engine.setVolume(useGameStore.getState().volume);

    // Effects and speed persist across songs: applied to the live chain whenever they change.
    const offEffects = useGameStore.subscribe((state, prev) => {
      if (state.effects !== prev.effects) applyEffects(state.effects);
    });
    applyEffects(useGameStore.getState().effects);

    return () => {
      offStart();
      offState();
      offEnded();
      offRequests();
      offVolume();
      offEffects();
    };
  }, []);

  return null;
}
