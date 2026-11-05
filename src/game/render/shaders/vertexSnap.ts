/**
 * PS1-style vertex snapping ("wobble").
 *
 * The original PlayStation had no sub-pixel precision, so vertices jumped
 * between whole screen pixels, making geometry shimmer slightly as the camera
 * moved. We reproduce it by rounding each vertex's screen position to the
 * low-res pixel grid.
 *
 * This is injected into Three.js's built-in materials, so lighting, fog and
 * textures keep working normally. Kept as pure string functions so the
 * injection can be unit-tested without a browser.
 */

export const SNAP_UNIFORMS_GLSL = /* glsl */ `
uniform vec2 uSnapResolution;
uniform float uSnapEnabled;
`;

export const SNAP_VERTEX_GLSL = /* glsl */ `
if (uSnapEnabled > 0.5) {
  // Divide by w to get screen space, round to the pixel grid, then restore w
  // so perspective and depth are unaffected.
  vec2 snapGrid = uSnapResolution * 0.5;
  gl_Position.xy = floor(gl_Position.xy / gl_Position.w * snapGrid + 0.5) / snapGrid * gl_Position.w;
}
`;

const COMMON_TOKEN = '#include <common>';
const PROJECT_TOKEN = '#include <project_vertex>';

export class ShaderInjectionError extends Error {}

/** Adds vertex snapping to a Three.js built-in vertex shader. */
export function injectVertexSnap(vertexShader: string): string {
  if (!vertexShader.includes(COMMON_TOKEN) || !vertexShader.includes(PROJECT_TOKEN)) {
    throw new ShaderInjectionError(
      'Vertex snapping could not find the expected Three.js shader chunks. ' +
        'A Three.js upgrade may have changed them.',
    );
  }
  return vertexShader
    .replace(COMMON_TOKEN, `${COMMON_TOKEN}\n${SNAP_UNIFORMS_GLSL}`)
    .replace(PROJECT_TOKEN, `${PROJECT_TOKEN}\n${SNAP_VERTEX_GLSL}`);
}
