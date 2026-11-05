import type { CSSProperties } from 'react';

/**
 * A native range input dressed as a bronze pixel slider. Native means it
 * works with mouse, touch and keyboard (arrow keys) and screen readers.
 */
export function PixelSlider({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
  format,
  hideLabel = false,
  disabled = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
  hideLabel?: boolean;
  disabled?: boolean;
}) {
  const fill = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <label className={`pixel-slider${hideLabel ? ' pixel-slider--bare' : ''}`}>
      {!hideLabel && (
        <span className="pixel-slider__row">
          <span>{label}</span>
          {format && <span className="pixel-slider__value">{format(value)}</span>}
        </span>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={hideLabel ? label : undefined}
        aria-valuetext={format ? format(value) : undefined}
        style={{ '--fill': `${fill}%` } as CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
        // Keep slider drags from also turning the camera on touch screens.
        onPointerDown={(e) => e.stopPropagation()}
      />
    </label>
  );
}
