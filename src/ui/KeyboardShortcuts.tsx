import { useEffect } from 'react';
import { playNext, playPrevious, togglePlay } from '../audio/music.ts';
import { useGameStore } from '../state/gameStore.ts';
import { openMenu } from './HudButtons.tsx';
import { closePanel, openPlayerPanel } from './player/MusicPlayer.tsx';

/**
 * Desktop shortcuts while exploring:
 *   Space    play / pause          [ ]   previous / next
 *   M        music panel           O     settings
 *   Esc      close an open panel (the browser also uses Esc to release the mouse)
 */
export function KeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { phase, uiPanel, currentSongId } = useGameStore.getState();
      if (phase !== 'exploring' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      // Don't hijack keys while a slider or button has keyboard focus.
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;

      switch (e.code) {
        case 'Space':
          if (target?.tagName === 'BUTTON') return; // let Space press the focused button
          e.preventDefault();
          if (currentSongId) togglePlay();
          break;
        case 'BracketLeft':
          playPrevious();
          break;
        case 'BracketRight':
          playNext();
          break;
        case 'KeyM':
          if (uiPanel === 'player') closePanel(false);
          else if (currentSongId) openPlayerPanel();
          break;
        case 'KeyO':
          if (uiPanel === 'menu') closePanel(false);
          else openMenu();
          break;
        case 'Escape':
          if (uiPanel !== 'none') useGameStore.getState().setUiPanel('none');
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return null;
}
