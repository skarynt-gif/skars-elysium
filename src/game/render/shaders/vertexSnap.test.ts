import { test } from 'node:test';
import assert from 'node:assert/strict';
import { injectVertexSnap, ShaderInjectionError } from './vertexSnap.ts';

// Trimmed shape of a Three.js built-in vertex shader.
const BUILT_IN = [
  '#include <common>',
  '#include <fog_pars_vertex>',
  'void main() {',
  '  #include <begin_vertex>',
  '  #include <project_vertex>',
  '  #include <fog_vertex>',
  '}',
].join('\n');

test('declares uniforms after <common> and snaps after projection', () => {
  const out = injectVertexSnap(BUILT_IN);
  const common = out.indexOf('#include <common>');
  const uniform = out.indexOf('uniform vec2 uSnapResolution');
  const project = out.indexOf('#include <project_vertex>');
  const snap = out.indexOf('gl_Position.xy = floor');
  const fog = out.indexOf('#include <fog_vertex>');
  assert.ok(common < uniform && uniform < project, 'uniforms declared before use');
  assert.ok(project < snap && snap < fog, 'snapping runs after projection, before fog');
});

test('keeps the original chunks intact', () => {
  const out = injectVertexSnap(BUILT_IN);
  for (const line of BUILT_IN.split('\n')) assert.ok(out.includes(line.trim()));
});

test('fails loudly if Three.js changes its shader chunks', () => {
  assert.throws(() => injectVertexSnap('void main() {}'), ShaderInjectionError);
});
