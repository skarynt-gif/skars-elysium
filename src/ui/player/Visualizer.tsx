import { useEffect, useRef } from 'react';
import { getEngine } from '../../audio/music.ts';

const BARS = 16;
const ROWS = 8;

/**
 * Pixel-block spectrum bars driven by the real audio (Web Audio analyser).
 * Only animates while visible and playing, to save battery.
 */
export function Visualizer({ active }: { active: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const analyser = getEngine().getAnalyser();
    const data = new Uint8Array(analyser?.frequencyBinCount ?? 128);
    const levels = new Float32Array(BARS);
    let frame = 0;

    const draw = () => {
      if (analyser && active) analyser.getByteFrequencyData(data);
      else data.fill(0);
      ctx.clearRect(0, 0, el.width, el.height);
      const cellW = el.width / BARS;
      const cellH = el.height / ROWS;
      for (let b = 0; b < BARS; b++) {
        // Log-ish spacing: more bars for lows and mids, where music lives.
        const from = Math.floor((b / BARS) ** 1.7 * data.length * 0.75);
        const to = Math.max(from + 1, Math.floor(((b + 1) / BARS) ** 1.7 * data.length * 0.75));
        let sum = 0;
        for (let i = from; i < to; i++) sum += data[i] ?? 0;
        const target = sum / (to - from) / 255;
        // Fast attack, slow fall: classic stereo-meter feel.
        levels[b] = target > levels[b]! ? target : levels[b]! * 0.9;
        const lit = Math.round(levels[b]! * ROWS);
        for (let r = 0; r < ROWS; r++) {
          const on = r < lit;
          ctx.fillStyle = !on ? 'rgba(232,193,90,0.12)' : r >= ROWS - 2 ? '#ff6f91' : r >= ROWS - 4 ? '#ff9a4d' : '#e8c15a';
          ctx.fillRect(b * cellW + 1, el.height - (r + 1) * cellH + 1, cellW - 2, cellH - 2);
        }
      }
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [active]);

  return <canvas ref={canvas} className="visualizer" width={128} height={40} aria-hidden="true" />;
}
