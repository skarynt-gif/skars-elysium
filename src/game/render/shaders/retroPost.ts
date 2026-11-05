/**
 * Final full-screen pass: pixel-perfect upscale + limited color + dithering.
 *
 * The PS1 drew in 15-bit color (32 shades per channel) and used ordered
 * dithering to hide the banding. Quantizing in display (sRGB) space gives
 * evenly spaced steps the eye sees as uniform, like the original hardware.
 */

export const RETRO_POST_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const RETRO_POST_FRAGMENT = /* glsl */ `
uniform sampler2D tScene;
uniform vec2 uFrameSize;   // low-res frame size in retro pixels
uniform float uScale;      // screen pixels per retro pixel (whole number)
uniform float uLevels;     // shades per color channel (32 = PS1 15-bit color)
uniform float uDither;     // 0 = none, 1 = full ordered dither

varying vec2 vUv;

// 4x4 Bayer ordered-dither threshold in [0, 1).
float bayer2(vec2 a) {
  a = floor(a);
  return fract(dot(a, vec2(0.5, a.y * 0.75)));
}
float bayer4(vec2 a) {
  return bayer2(0.5 * a) * 0.25 + bayer2(a);
}

vec3 linearToSrgb(vec3 c) {
  c = max(c, 0.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  // Which retro pixel this screen pixel belongs to. Using whole-number
  // division (not vUv) keeps every retro pixel exactly uScale wide.
  vec2 retroPixel = floor(gl_FragCoord.xy / uScale);
  vec2 uv = (retroPixel + 0.5) / uFrameSize;

  // The frame is stored as sRGB and decoded to linear by the GPU on read.
  vec3 color = linearToSrgb(texture2D(tScene, uv).rgb);

  float threshold = mix(0.5, bayer4(retroPixel), uDither);
  float steps = uLevels - 1.0;
  color = floor(color * steps + threshold) / steps;

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;
