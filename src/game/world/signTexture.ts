import { CanvasTexture } from 'three';
import { GAME_CONFIG } from '../../config/gameConfig.ts';
import { configurePixelTexture } from '../render/pixelTexture.ts';
import { wrapSignText } from './signText.ts';

export const PIXEL_FONT = '"Press Start 2P", ui-monospace, monospace';

/** Resolves once the pixel font is ready (or immediately if it can't load). */
export async function pixelFontReady(): Promise<void> {
  try {
    await document.fonts?.load(`8px ${PIXEL_FONT}`);
  } catch {
    // Fall back to monospace; signs still render.
  }
}

/**
 * Paints a bronze plaque with a gold border and the title in pixel type.
 * 192×48 texture → 24 characters × 3 lines at 8px.
 */
export function createSignTexture(title: string): CanvasTexture {
  const width = 192;
  const height = 48;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable for sign text.');

  const { uiPurple, uiBronze, uiGold } = GAME_CONFIG.palette;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = uiBronze;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = uiPurple;
  ctx.fillRect(2, 2, width - 4, height - 4);
  ctx.fillStyle = uiGold;
  // Pixel border with corner studs
  ctx.fillRect(3, 3, width - 6, 1);
  ctx.fillRect(3, height - 4, width - 6, 1);
  ctx.fillRect(3, 3, 1, height - 6);
  ctx.fillRect(width - 4, 3, 1, height - 6);
  for (const [x, y] of [[5, 5], [width - 7, 5], [5, height - 7], [width - 7, height - 7]]) ctx.fillRect(x!, y!, 2, 2);

  const lines = wrapSignText(title, 22, 3);
  ctx.font = `8px ${PIXEL_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lineHeight = 12;
  const top = height / 2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, i) => {
    ctx.fillStyle = '#3a2410';
    ctx.fillText(line, width / 2 + 1, top + i * lineHeight + 1);
    ctx.fillStyle = uiGold;
    ctx.fillText(line, width / 2, top + i * lineHeight);
  });

  return configurePixelTexture(new CanvasTexture(canvas), false);
}
