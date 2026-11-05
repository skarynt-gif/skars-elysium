import { useGameStore } from '../state/gameStore.ts';
import { SENSITIVITY_RANGE, type QualityChoice } from '../state/prefs.ts';
import { PixelIcon } from './icons.tsx';
import { PixelSlider } from './PixelSlider.tsx';
import { COLLECTIBLES } from '../game/collectibles/collectibles.ts';
import { closePanel } from './player/MusicPlayer.tsx';

const QUALITY_OPTIONS: { value: QualityChoice; label: string }[] = [
  { value: 'auto', label: 'AUTO' },
  { value: 'low', label: 'LOW' },
  { value: 'medium', label: 'MED' },
  { value: 'high', label: 'HIGH' },
];

/** Pause-style settings menu. Every change is saved for the next visit. */
export function SettingsMenu({ touch }: { touch: boolean }) {
  const panel = useGameStore((s) => s.uiPanel);
  const phase = useGameStore((s) => s.phase);
  const settings = useGameStore((s) => s.settings);
  const update = useGameStore((s) => s.updateSettings);
  const volume = useGameStore((s) => s.volume);
  const setVolume = useGameStore((s) => s.setVolume);
  const laurels = useGameStore((s) => s.laurelsFound.length);
  if (panel !== 'menu' || phase !== 'exploring') return null;

  return (
    <div className="panel-backdrop" onPointerDown={(e) => e.stopPropagation()}>
      <section className="settings-panel pixel-panel" role="dialog" aria-label="Settings">
        <header className="panel-header">
          <span className="panel-header__title">
            <PixelIcon name="menu" size={14} /> SETTINGS
          </span>
          <button type="button" className="pixel-button" onClick={() => closePanel(touch)} aria-label="Close settings">
            <PixelIcon name="close" size={16} />
          </button>
        </header>
        <div className="greek-key greek-key--panel" aria-hidden="true" />

        <div className="settings-panel__body">
          <PixelSlider
            label="MUSIC VOLUME"
            value={volume}
            min={0}
            max={1}
            onChange={setVolume}
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <PixelSlider
            label="GARDEN SOUNDS"
            value={settings.ambientVolume}
            min={0}
            max={1}
            onChange={(v) => update({ ambientVolume: v })}
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <PixelSlider
            label="LOOK SPEED"
            value={settings.lookSensitivity}
            min={SENSITIVITY_RANGE[0]}
            max={SENSITIVITY_RANGE[1]}
            step={0.05}
            onChange={(v) => update({ lookSensitivity: v })}
            format={(v) => `${v.toFixed(2)}x`}
          />
          <Toggle label="INVERT LOOK" checked={settings.invertY} onChange={(v) => update({ invertY: v })} />
          <Toggle label="HEAD BOB" checked={settings.headBob} onChange={(v) => update({ headBob: v })} />

          <fieldset className="choice">
            <legend>GRAPHICS</legend>
            <div className="choice__options">
              {QUALITY_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={`pixel-button pixel-button--text${settings.quality === o.value ? ' is-selected' : ''}`}
                  aria-pressed={settings.quality === o.value}
                  onClick={() => update({ quality: o.value })}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </fieldset>

          <p className="settings-panel__laurels">
            LAURELS FOUND: {laurels} / {COLLECTIBLES.length}
          </p>

          <div className="settings-panel__help">
            {touch ? (
              <p>LEFT THUMB: WALK · PUSH FULLY: RUN · RIGHT THUMB: LOOK · TAP: SELECT</p>
            ) : (
              <p>WASD: WALK · SHIFT: RUN · MOUSE: LOOK · E/CLICK: SELECT · SPACE: PLAY/PAUSE · [ ]: PREV/NEXT · M: MUSIC</p>
            )}
          </div>

          <button type="button" className="pixel-button pixel-button--text pixel-button--primary" onClick={() => closePanel(touch)}>
            RESUME
          </button>
        </div>
      </section>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button type="button" className="toggle" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}>
      <span>{label}</span>
      <span className={`toggle__box${checked ? ' is-on' : ''}`}>{checked ? 'ON' : 'OFF'}</span>
    </button>
  );
}
