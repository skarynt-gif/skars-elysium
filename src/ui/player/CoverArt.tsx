import { useState } from 'react';
import { PixelIcon } from '../icons.tsx';

/**
 * Album art presented as a gold coin that slowly turns while music plays.
 * Falls back to a pixel lyre when a song has no artwork (or it fails to load).
 */
export function CoverArt({ src, spinning, size }: { src?: string | undefined; spinning: boolean; size: 'small' | 'large' }) {
  const [failed, setFailed] = useState<string | null>(null);
  const showImage = src && failed !== src;
  return (
    <div className={`cover cover--${size}${spinning ? ' cover--spinning' : ''}`} aria-hidden="true">
      <div className="cover__face">
        {showImage ? (
          <img src={src} alt="" crossOrigin="anonymous" draggable={false} onError={() => setFailed(src)} />
        ) : (
          <PixelIcon name="lyre" size={size === 'large' ? 56 : 18} />
        )}
      </div>
    </div>
  );
}
