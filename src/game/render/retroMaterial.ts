import { Vector2, type Material } from 'three';
import { injectVertexSnap } from './shaders/vertexSnap.ts';

/**
 * Uniforms shared by every retro material. RetroRenderer updates them once
 * on resize (and when settings change), so thousands of materials stay in
 * sync without any per-material work.
 */
export const retroUniforms = {
  uSnapResolution: { value: new Vector2(320, 240) },
  uSnapEnabled: { value: 1 },
};

/**
 * Turns any Three.js built-in material (Lambert, Basic, Standard…) into a
 * retro one with PS1 vertex wobble. Lighting, fog and textures still work.
 *
 * Usage: `const marble = retroMaterial(new MeshLambertMaterial({ map }))`.
 * World materials should be created once and shared (see
 * world/materials.ts), not recreated per object.
 */
export function retroMaterial<T extends Material>(material: T): T {
  const previous = material.onBeforeCompile.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer);
    shader.uniforms.uSnapResolution = retroUniforms.uSnapResolution;
    shader.uniforms.uSnapEnabled = retroUniforms.uSnapEnabled;
    shader.vertexShader = injectVertexSnap(shader.vertexShader);
  };
  // Separate shader cache entry from non-retro materials of the same type.
  const previousKey = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${previousKey()}|retro-snap`;
  material.needsUpdate = true;
  return material;
}
