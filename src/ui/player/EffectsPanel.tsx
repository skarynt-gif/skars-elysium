import {
  PRESETS,
  SPEED_OPTIONS,
  delaySeconds,
  matchingPreset,
  reverbSeconds,
  reverbSpaceName,
} from '../../audio/effectsMath.ts';
import { useGameStore } from '../../state/gameStore.ts';
import { PixelSlider } from '../PixelSlider.tsx';

const pct = (v: number) => `${Math.round(v * 100)}%`;

/**
 * Speed, reverb and delay controls. These process the real audio (Web Audio)
 * and stay in effect across songs and visits.
 */
export function EffectsPanel() {
  const effects = useGameStore((s) => s.effects);
  const setEffects = useGameStore((s) => s.setEffects);
  const active = matchingPreset(effects);

  return (
    <div className="effects">
      <div className="effects__group">
        <span className="effects__heading">PRESETS</span>
        <div className="effects__presets">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`pixel-button pixel-button--text${active === p.id ? ' is-selected' : ''}`}
              aria-pressed={active === p.id}
              onClick={() => setEffects(p.settings)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="effects__group">
        <span className="effects__heading">SPEED</span>
        <div className="effects__speeds" role="radiogroup" aria-label="Playback speed">
          {SPEED_OPTIONS.map((speed) => (
            <button
              key={speed}
              type="button"
              role="radio"
              aria-checked={effects.speed === speed}
              className={`pixel-button${effects.speed === speed ? ' is-selected' : ''}`}
              onClick={() => setEffects({ speed })}
            >
              {speed}x
            </button>
          ))}
        </div>
        <button
          type="button"
          className="toggle"
          role="switch"
          aria-checked={effects.preservePitch}
          onClick={() => setEffects({ preservePitch: !effects.preservePitch })}
        >
          <span>KEEP PITCH</span>
          <span className={`toggle__box${effects.preservePitch ? ' is-on' : ''}`}>{effects.preservePitch ? 'ON' : 'OFF'}</span>
        </button>
      </div>

      <div className="effects__group">
        <span className="effects__heading">REVERB</span>
        <PixelSlider
          label="SIZE"
          value={effects.reverbSize}
          min={0}
          max={1}
          onChange={(v) => setEffects({ reverbSize: v })}
          format={(v) => `${reverbSpaceName(v)} ${reverbSeconds(v).toFixed(1)}S`}
        />
        <PixelSlider label="WET / DRY" value={effects.reverbMix} min={0} max={1} onChange={(v) => setEffects({ reverbMix: v })} format={pct} />
      </div>

      <div className="effects__group">
        <span className="effects__heading">DELAY</span>
        <PixelSlider
          label="TIME"
          value={effects.delayTime}
          min={0}
          max={1}
          onChange={(v) => setEffects({ delayTime: v })}
          format={(v) => `${Math.round(delaySeconds(v) * 1000)}MS`}
        />
        <PixelSlider
          label="FEEDBACK"
          value={effects.delayFeedback}
          min={0}
          max={1}
          onChange={(v) => setEffects({ delayFeedback: v })}
          format={pct}
        />
        <PixelSlider label="WET / DRY" value={effects.delayMix} min={0} max={1} onChange={(v) => setEffects({ delayMix: v })} format={pct} />
      </div>
    </div>
  );
}
