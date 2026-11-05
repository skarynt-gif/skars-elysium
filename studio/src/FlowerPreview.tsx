import { useEffect, useRef, useState } from 'react';
import type { FlowerLook } from './flowerLook.ts';
import type { FlowerPreview as Preview } from './preview/flowerPreview.ts';

/** The live 3D flower. Three.js loads on demand, so the rest of the Studio stays light. */
export function FlowerPreview({ look }: { look: FlowerLook }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const preview = useRef<Preview | null>(null);
  const [failed, setFailed] = useState(false);
  const latest = useRef(look);
  latest.current = look;

  useEffect(() => {
    let cancelled = false;
    import('./preview/flowerPreview.ts')
      .then(({ mountFlowerPreview }) => {
        if (cancelled || !canvas.current) return;
        preview.current = mountFlowerPreview(canvas.current);
        preview.current.show(latest.current);
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      preview.current?.dispose();
      preview.current = null;
    };
  }, []);

  useEffect(() => {
    preview.current?.show(look);
  }, [look]);

  return (
    <div className="flower-preview">
      {failed ? (
        <p className="flower-preview__failed">The 3D preview couldn’t start in this browser. Your changes still save.</p>
      ) : (
        <canvas ref={canvas} className="flower-preview__canvas" aria-label="3D preview of the flower" />
      )}
    </div>
  );
}
