import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { CylinderGeometry, DoubleSide, Mesh, MeshBasicMaterial } from 'three';
import { paintTexture } from '../world/textures.ts';
import { useEnvironment } from '../world/useGardenSettings.ts';

/**
 * Two bands of pixel clouds circling the sky at different distances and
 * speeds (a little parallax), lit pink and gold from the setting sun below.
 * They sit between the sky and the mountains.
 */
const BANDS = [
  { radius: 330, bottom: 40, height: 70, repeat: 5, speed: 0.0016, opacity: 0.75 },
  { radius: 280, bottom: 22, height: 45, repeat: 7, speed: -0.0026, opacity: 0.55 },
];

export function Clouds() {
  const bands = useMemo(
    () =>
      BANDS.map((b) => {
        const texture = paintTexture('clouds');
        texture.repeat.set(b.repeat, 1);
        const material = new MeshBasicMaterial({
          map: texture,
          transparent: true,
          opacity: b.opacity,
          side: DoubleSide,
          depthWrite: false,
          fog: false,
        });
        const mesh = new Mesh(new CylinderGeometry(b.radius, b.radius, b.height, 48, 1, true), material);
        mesh.position.y = b.bottom + b.height / 2;
        mesh.renderOrder = -9.5;
        mesh.frustumCulled = false;
        return { mesh, texture, material, speed: b.speed };
      }),
    [],
  );

  useEffect(
    () => () => {
      for (const b of bands) {
        b.texture.dispose();
        b.material.dispose();
        b.mesh.geometry.dispose();
      }
    },
    [bands],
  );

  // Cloud amount (Creator Studio): fade the bands, hide them entirely at 0.
  const amount = useEnvironment().clouds;
  useEffect(() => {
    bands.forEach((b, i) => {
      b.material.opacity = Math.min(1, BANDS[i]!.opacity * amount);
      b.mesh.visible = amount > 0.01;
    });
  }, [bands, amount]);

  useFrame(({ camera, clock }) => {
    for (const b of bands) {
      // Follow the visitor so the sky stays infinitely far; drift sideways.
      b.mesh.position.x = camera.position.x;
      b.mesh.position.z = camera.position.z;
      b.texture.offset.x = clock.elapsedTime * b.speed;
    }
  });

  return (
    <>
      {bands.map((b, i) => (
        <primitive key={i} object={b.mesh} />
      ))}
    </>
  );
}
