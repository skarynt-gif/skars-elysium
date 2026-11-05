/**
 * Chooses the internal low-resolution frame size.
 *
 * Instead of stretching an exact 240p/320p frame (which makes some screen
 * pixels wider than others), we pick a whole-number scale factor and derive
 * the frame size from it. Every retro pixel is then exactly `scale` × `scale`
 * screen pixels, which is what keeps the pixel art crisp and even.
 */
export interface RenderSize {
  /** Internal frame width in retro pixels. */
  width: number;
  /** Internal frame height in retro pixels. */
  height: number;
  /** Screen pixels per retro pixel (always a whole number ≥ 1). */
  scale: number;
}

export function computeRenderSize(viewWidth: number, viewHeight: number, targetHeight: number): RenderSize {
  const w = Math.max(1, Math.floor(viewWidth));
  const h = Math.max(1, Math.floor(viewHeight));
  const scale = Math.max(1, Math.round(h / Math.max(1, targetHeight)));
  return {
    // Round up so the frame always covers the screen; the partial last pixel
    // is simply cropped at the edge.
    width: Math.ceil(w / scale),
    height: Math.ceil(h / scale),
    scale,
  };
}
