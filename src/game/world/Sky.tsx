import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three';
import { GAME_CONFIG } from '../../config/gameConfig.ts';
import { sunDirection } from './atmosphere.ts';
import { skyPalette } from './environment.ts';
import { useEnvironment } from './useGardenSettings.ts';

/**
 * Sunset sky dome: purple zenith → pink → orange horizon, a glowing low sun,
 * and fog color below the horizon so the land dissolves into the sky.
 * The retro pass dithers the gradient into PS1-style bands.
 */
const VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // always at the far plane
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uUpper;
uniform vec3 uPink;
uniform vec3 uHorizon;
uniform vec3 uFog;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
varying vec3 vDir;

void main() {
  vec3 dir = normalize(vDir);
  float h = dir.y;
  vec3 color = uFog;
  color = mix(color, uHorizon, smoothstep(-0.06, 0.0, h));
  color = mix(color, uPink, smoothstep(0.02, 0.17, h));
  color = mix(color, uUpper, smoothstep(0.14, 0.42, h));
  color = mix(color, uZenith, smoothstep(0.38, 0.95, h));

  float s = max(dot(dir, uSunDir), 0.0);
  color += uSunColor * (pow(s, 6.0) * 0.18 + pow(s, 48.0) * 0.45);
  // Chunky sun disc
  color = mix(color, vec3(1.0, 0.93, 0.75), step(0.9986, s));

  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
`;

export function Sky() {
  const mesh = useMemo(() => {
    const p = GAME_CONFIG.palette;
    const linear = (hex: string) => new Color(hex); // Color() converts sRGB hex to linear working space
    const material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uZenith: { value: linear(p.skyZenith) },
        uUpper: { value: linear(p.skyUpper) },
        uPink: { value: linear(p.skyPink) },
        uHorizon: { value: linear(p.skyHorizon) },
        uFog: { value: linear(p.fog) },
        uSunColor: { value: linear(p.sunGold) },
        uSunDir: { value: new Vector3(...sunDirection()) },
      },
      side: BackSide,
      depthWrite: false,
      fog: false,
    });
    const sky = new Mesh(new SphereGeometry(400, 24, 12), material);
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    return sky;
  }, []);

  // Sky warmth (Creator Studio): recolor the gradient in place.
  const warmth = useEnvironment().skyWarmth;
  useEffect(() => {
    const p = skyPalette(GAME_CONFIG.palette, warmth);
    const u = (mesh.material as ShaderMaterial).uniforms;
    u.uZenith!.value.set(p.skyZenith);
    u.uUpper!.value.set(p.skyUpper);
    u.uPink!.value.set(p.skyPink);
    u.uHorizon!.value.set(p.skyHorizon);
    u.uFog!.value.set(p.fog);
  }, [mesh, warmth]);

  // Keep the dome centered on the camera so it always feels infinitely far.
  useFrame(({ camera }) => {
    mesh.position.copy(camera.position);
  });

  return <primitive object={mesh} />;
}
