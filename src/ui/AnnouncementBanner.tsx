import { useEffect } from 'react';
import { useGameStore } from '../state/gameStore.ts';

const SHOW_MS = 6000;

/** Big retro banner (e.g. "★ NEW RELEASE ★ FIRST LIGHT HAS BLOOMED"), auto-dismissed. */
export function AnnouncementBanner() {
  const announcement = useGameStore((s) => s.announcement);
  const phase = useGameStore((s) => s.phase);

  useEffect(() => {
    if (!announcement) return;
    const id = announcement.id;
    const timer = window.setTimeout(() => useGameStore.getState().clearAnnouncement(id), SHOW_MS);
    return () => window.clearTimeout(timer);
  }, [announcement]);

  if (!announcement || phase !== 'exploring') return null;
  return (
    <div className="announcement pixel-panel" role="status" key={announcement.id}>
      <span className="announcement__title">{announcement.title}</span>
      <span className="announcement__text">{announcement.text}</span>
    </div>
  );
}
