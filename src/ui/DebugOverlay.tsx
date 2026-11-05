import type { DeviceCapabilities } from '../platform/capabilities.ts';
import { DEBUG_FLAGS } from '../platform/flags.ts';
import { useGameStore } from '../state/gameStore.ts';

/**
 * Developer diagnostics. Visible during development, or on the live site by
 * adding ?debug to the URL — handy when testing on a real phone.
 */

export function DebugOverlay({ caps }: { caps: DeviceCapabilities }) {
  const phase = useGameStore((s) => s.phase);
  const content = useGameStore((s) => s.content);
  const quality = useGameStore((s) => s.quality);
  const renderSize = useGameStore((s) => s.renderSize);
  const fps = useGameStore((s) => s.fps);
  const autoTier = useGameStore((s) => s.autoTier);
  if (!DEBUG_FLAGS.debug) return null;

  let contentLine = 'loading…';
  if (content.status === 'failed') contentLine = `FAILED — ${content.message}`;
  if (content.status === 'ready') {
    const errors = content.issues.filter((i) => i.severity === 'error').length;
    contentLine =
      `${content.manifest.collections.length} beds · ${content.manifest.songs.length} songs · ` +
      `${errors} errors · ${content.issues.length - errors} warnings`;
  }

  return (
    <div className="debug-overlay" aria-hidden="true">
      <div>phase: {phase}</div>
      <div>
        quality: {quality ? `${quality.tier} (target ${quality.renderHeight}p)` : '—'}
        {autoTier ? ' · auto-adjusted' : ''}
      </div>
      <div>fps: {fps ?? '—'}</div>
      <div>
        frame:{' '}
        {renderSize ? `${renderSize.width}×${renderSize.height} at ${renderSize.scale}x` : 'retro off (full resolution)'}
        {renderSize && !DEBUG_FLAGS.wobble ? ' · wobble off' : ''}
        {renderSize && !DEBUG_FLAGS.dither ? ' · dither off' : ''}
      </div>
      <div>
        device: {caps.touch ? 'touch' : 'mouse'}
        {caps.isIOS ? ' · iOS' : ''}
        {caps.smallScreen ? ' · phone' : ''}
      </div>
      <div>content: {contentLine}</div>
    </div>
  );
}
