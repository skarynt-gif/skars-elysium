/**
 * A single flower rendered with the game's real flower models, materials and
 * motion (game/flowers), in the same low-resolution, wobbly retro style.
 * Plain Three.js, loaded only when the Flowers page opens.
 */
import {
  CircleGeometry,
  Color,
  DirectionalLight,
  Euler,
  Fog,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { GAME_CONFIG } from '../../../src/config/gameConfig.ts';
import { buildFlower, plinthGeometry } from '../../../src/game/flowers/flowerGeometries.ts';
import { getFlowerMaterials } from '../../../src/game/flowers/flowerMaterials.ts';
import { FLOWER_STYLES, PLINTH_HEIGHT, speciesMotion, windAt } from '../../../src/game/flowers/flowerStyle.ts';
import { retroMaterial, retroUniforms } from '../../../src/game/render/retroMaterial.ts';
import type { FlowerLook } from '../flowerLook.ts';

export interface FlowerPreview {
  show(look: FlowerLook): void;
  dispose(): void;
}

/** Internal render size: the game renders at 240–448 px tall; the preview matches that chunkiness. */
const RENDER_HEIGHT = 180;

export function mountFlowerPreview(canvas: HTMLCanvasElement): FlowerPreview {
  const { palette } = GAME_CONFIG;
  const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'low-power' });
  // Transparent background: the sunset gradient behind the canvas shows through.
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(1);
  const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight) || 0.8;
  const width = Math.round(RENDER_HEIGHT * aspect);
  renderer.setSize(width, RENDER_HEIGHT, false);
  retroUniforms.uSnapResolution.value.set(width, RENDER_HEIGHT);

  const scene = new Scene();
  scene.fog = new Fog(palette.skyHorizon, 4, 10);
  scene.add(new HemisphereLight(palette.hemiSky, palette.hemiGround, 1.15));
  const sun = new DirectionalLight(palette.sunLight, 1.7);
  sun.position.set(-2, 1.5, 2);
  scene.add(sun);
  const ground = new Mesh(new CircleGeometry(2.6, 12), retroMaterial(new MeshLambertMaterial({ color: '#5e7a3e', flatShading: true })));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const plinth = new Mesh(plinthGeometry(), retroMaterial(new MeshLambertMaterial({ color: '#efe6d4', flatShading: true })));
  scene.add(plinth);

  const camera = new PerspectiveCamera(32, width / RENDER_HEIGHT, 0.05, 20);
  const materials = getFlowerMaterials();
  let meshes: InstancedMesh[] = [];
  let look: FlowerLook | null = null;
  const base = new Color();
  const tmp = { m: new Matrix4(), q: new Quaternion(), e: new Euler(), pos: new Vector3(), scale: new Vector3(), color: new Color() };

  const show = (next: FlowerLook) => {
    const rebuild = !look || look.species !== next.species || look.plinth !== next.plinth;
    look = next;
    if (rebuild) {
      meshes.forEach((m) => {
        scene.remove(m);
        m.dispose();
      });
      const parts = buildFlower(next.species, next.plinth);
      const style = FLOWER_STYLES[next.species];
      const headMaterial = style.ghost ? materials.ghost : next.species === 'bud' ? materials.bud : materials.petal;
      meshes = [
        new InstancedMesh(parts.stem, materials.stem, 1),
        new InstancedMesh(parts.head, headMaterial, 1),
        new InstancedMesh(parts.core, style.ghost ? materials.ghost : materials.core, 1),
      ];
      meshes.forEach((m) => scene.add(m));
      meshes[0]!.setColorAt(0, new Color('#4f7a3a'));
    }
    base.set(next.palette.petal).offsetHSL(next.palette.shift / 360, 0, 0);
    meshes[1]!.setColorAt(0, base);
    meshes[2]!.setColorAt(0, new Color(next.palette.core));
    meshes.forEach((m) => m.instanceColor && (m.instanceColor.needsUpdate = true));
    plinth.visible = next.plinth;
    // Frame the whole flower whatever its size.
    const top = (FLOWER_STYLES[next.species].height + (next.plinth ? PLINTH_HEIGHT : 0)) * next.heightScale;
    const distance = 1.3 + top * 2.3;
    camera.userData.target = new Vector3(0, top * 0.55, 0);
    camera.userData.distance = distance;
  };

  let frame = 0;
  const start = performance.now();
  const loop = () => {
    frame = requestAnimationFrame(loop);
    if (!look || document.hidden) return;
    const t = (performance.now() - start) / 1000;
    const style = FLOWER_STYLES[look.species];
    const [wx, wz] = windAt(0, 0, t);
    const [mx, mz, ms] = speciesMotion(style.motion, t, 1.7);
    const pivotY = look.plinth ? PLINTH_HEIGHT : 0;
    const s = look.heightScale * ms;
    tmp.e.set(wx * style.sway + mx, 0, wz * style.sway + mz, 'YXZ');
    tmp.q.setFromEuler(tmp.e);
    tmp.pos.set(0, pivotY, 0);
    tmp.scale.set(s, s, s);
    tmp.m.compose(tmp.pos, tmp.q, tmp.scale).multiply(new Matrix4().makeTranslation(0, -pivotY, 0));
    for (const m of meshes) {
      m.setMatrixAt(0, tmp.m);
      m.instanceMatrix.needsUpdate = true;
    }
    if (look.palette.cycle) {
      tmp.color.copy(base).offsetHSL((t * 0.08) % 1, 0, 0);
      meshes[1]!.setColorAt(0, tmp.color);
      meshes[1]!.instanceColor!.needsUpdate = true;
    }
    // Slow orbit, like turning a flower in your hand.
    const a = t * 0.35;
    const target = camera.userData.target as Vector3;
    const d = camera.userData.distance as number;
    camera.position.set(Math.sin(a) * d, target.y + d * 0.22, Math.cos(a) * d);
    camera.lookAt(target);
    renderer.render(scene, camera);
  };
  loop();

  return {
    show,
    dispose() {
      cancelAnimationFrame(frame);
      meshes.forEach((m) => m.dispose());
      renderer.dispose();
    },
  };
}
