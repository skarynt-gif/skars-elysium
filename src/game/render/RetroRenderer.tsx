import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  Mesh,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  WebGLRenderTarget,
} from 'three';
import { GAME_CONFIG } from '../../config/gameConfig.ts';
import type { QualitySettings } from '../../config/quality.ts';
import { DEBUG_FLAGS } from '../../platform/flags.ts';
import { useGameStore } from '../../state/gameStore.ts';
import { computeRenderSize } from './renderSize.ts';
import { retroUniforms } from './retroMaterial.ts';
import { RETRO_POST_FRAGMENT, RETRO_POST_VERTEX } from './shaders/retroPost.ts';

/**
 * Takes over rendering for the whole canvas:
 *   1. draws the 3D scene into a small low-resolution frame
 *   2. upscales it to the screen with hard pixels, limited color and dithering
 *
 * Rendering fewer pixels is also the main performance win on phones.
 */
export function RetroRenderer({ quality }: { quality: QualitySettings }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const setRenderSize = useGameStore((s) => s.setRenderSize);
  const retroOn = DEBUG_FLAGS.retro;

  const pipeline = useMemo(() => {
    const target = new WebGLRenderTarget(1, 1, {
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      generateMipmaps: false,
      depthBuffer: true,
    });
    // Store the frame as sRGB: full 8-bit precision in dark sunset shadows,
    // and the GPU decodes it back to linear when the post pass reads it.
    target.texture.colorSpace = SRGBColorSpace;

    const material = new ShaderMaterial({
      vertexShader: RETRO_POST_VERTEX,
      fragmentShader: RETRO_POST_FRAGMENT,
      uniforms: {
        tScene: { value: target.texture },
        uFrameSize: { value: [1, 1] },
        uScale: { value: 1 },
        uLevels: { value: GAME_CONFIG.retro.colorLevels },
        uDither: { value: DEBUG_FLAGS.dither ? GAME_CONFIG.retro.dither : 0 },
      },
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const quad = new Mesh(new PlaneGeometry(2, 2), material);
    quad.frustumCulled = false;
    const postScene = new Scene();
    postScene.add(quad);
    const postCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    return { target, material, quad, postScene, postCamera };
  }, []);

  // Free GPU memory if the canvas is ever unmounted.
  useEffect(
    () => () => {
      pipeline.target.dispose();
      pipeline.material.dispose();
      pipeline.quad.geometry.dispose();
    },
    [pipeline],
  );

  // Resize the low-res frame whenever the window or quality tier changes.
  useEffect(() => {
    const frame = computeRenderSize(size.width, size.height, quality.renderHeight);
    pipeline.target.setSize(frame.width, frame.height);
    pipeline.material.uniforms.uFrameSize!.value = [frame.width, frame.height];
    pipeline.material.uniforms.uScale!.value = frame.scale;

    const snap = GAME_CONFIG.retro.snapScale;
    retroUniforms.uSnapResolution.value.set(frame.width * snap, frame.height * snap);
    retroUniforms.uSnapEnabled.value = retroOn && DEBUG_FLAGS.wobble && quality.vertexSnap ? 1 : 0;

    setRenderSize(retroOn ? frame : null);
  }, [size.width, size.height, quality, pipeline, setRenderSize, retroOn]);

  // Priority 1 tells React Three Fiber we handle rendering ourselves.
  useFrame(() => {
    if (!retroOn) {
      gl.setRenderTarget(null);
      gl.render(scene, camera);
      return;
    }
    gl.setRenderTarget(pipeline.target);
    gl.render(scene, camera);
    gl.setRenderTarget(null);
    gl.render(pipeline.postScene, pipeline.postCamera);
  }, 1);

  return null;
}
