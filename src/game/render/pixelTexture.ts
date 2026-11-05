import {
  CanvasTexture,
  NearestFilter,
  NearestMipmapNearestFilter,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three';

/**
 * Pixel-art texture settings: hard pixel edges up close (no blur), and
 * stepped mipmaps far away so distant marble doesn't sparkle, while still
 * looking blocky like 90s hardware.
 */
export function configurePixelTexture<T extends Texture>(texture: T, repeat = true): T {
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestMipmapNearestFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = SRGBColorSpace;
  if (repeat) {
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
  }
  texture.needsUpdate = true;
  return texture;
}

/**
 * Paints a small texture in code (e.g. 32×32 marble). Lets the garden ship
 * with procedurally drawn pixel textures before any hand-made art exists;
 * loaded PNGs go through configurePixelTexture the same way.
 */
export function createPixelTexture(
  size: number,
  paint: (ctx: CanvasRenderingContext2D, size: number) => void,
): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available for texture painting.');
  ctx.imageSmoothingEnabled = false;
  paint(ctx, size);
  return configurePixelTexture(new CanvasTexture(canvas));
}
