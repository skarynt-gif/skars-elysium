import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  OctahedronGeometry,
  type BufferGeometry,
} from 'three';
import { merge, place } from '../world/geometries.ts';
import { FLOWER_STYLES, PLINTH_HEIGHT } from './flowerStyle.ts';
import type { VisualSpecies } from './planting.ts';

/**
 * Chunky low-poly flowers, three parts each so every part can take its own
 * per-song color: stem (green), head (petals), core (heart/stamens).
 * Built with the head at the species' stem height, origin at the ground.
 */
export interface FlowerParts {
  stem: BufferGeometry;
  head: BufferGeometry;
  core: BufferGeometry;
}

const TAU = Math.PI * 2;

function stem(height: number): BufferGeometry {
  return merge([
    place(new CylinderGeometry(0.022, 0.03, height, 4), { at: [0, height / 2, 0] }),
    // Two leaves
    place(new BoxGeometry(0.2, 0.012, 0.07), { at: [0.09, height * 0.35, 0], rotate: [0, 0, 0.5] }),
    place(new BoxGeometry(0.18, 0.012, 0.06), { at: [-0.08, height * 0.55, 0.02], rotate: [0, 0.4, -0.55] }),
  ]);
}

/** A ring of `count` petals made from squashed shapes around the head. */
function ring(
  count: number,
  radius: number,
  y: number,
  make: () => BufferGeometry,
  tilt: number,
  twist = 0,
): BufferGeometry[] {
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * TAU + twist;
    return place(make(), {
      rotate: [tilt, 0, 0],
      at: [0, 0, 0],
    })
      .rotateY(a)
      .translate(Math.sin(a) * radius, y, Math.cos(a) * radius);
  });
}

function rose(h: number): Omit<FlowerParts, 'stem'> {
  const petal = () => place(new IcosahedronGeometry(0.075, 0), { scale: [1, 0.55, 0.7] });
  return {
    head: merge([
      ...ring(5, 0.085, h + 0.02, petal, -0.5),
      ...ring(5, 0.05, h + 0.07, petal, -0.9, 0.6),
    ]),
    core: place(new IcosahedronGeometry(0.055, 0), { at: [0, h + 0.09, 0], scale: [1, 1.2, 1] }),
  };
}

function spiral(h: number): Omit<FlowerParts, 'stem'> {
  // Oversized blade petals fanned in a spiral.
  const petals = Array.from({ length: 9 }, (_, i) => {
    const a = (i / 9) * TAU;
    const r = 0.13 + i * 0.012;
    return place(new BoxGeometry(0.11, 0.015, 0.3), { rotate: [-0.35 - i * 0.03, 0, 0] })
      .rotateY(a)
      .translate(Math.sin(a) * r, h + 0.02 * i * 0.3, Math.cos(a) * r);
  });
  return {
    head: merge(petals),
    core: place(new CylinderGeometry(0.1, 0.08, 0.06, 6), { at: [0, h + 0.05, 0] }),
  };
}

function iris(h: number): Omit<FlowerParts, 'stem'> {
  const standard = () => place(new BoxGeometry(0.07, 0.2, 0.02), { at: [0, 0.1, 0] });
  const fall = () => place(new BoxGeometry(0.09, 0.02, 0.2), { at: [0, 0, 0.1] });
  return {
    head: merge([...ring(3, 0.03, h, standard, -0.25), ...ring(3, 0.04, h, fall, 0.35, Math.PI / 3)]),
    core: place(new OctahedronGeometry(0.04, 0), { at: [0, h + 0.03, 0] }),
  };
}

function thistle(h: number): Omit<FlowerParts, 'stem'> {
  const spikes: BufferGeometry[] = [];
  const ico = new IcosahedronGeometry(1, 0);
  const pos = ico.getAttribute('position');
  const seen = new Set<string>();
  // One spike out of every unique icosahedron vertex.
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const key = `${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}`;
    if (seen.has(key) || y < -0.6) continue;
    seen.add(key);
    const spike = new ConeGeometry(0.03, 0.17, 4);
    spike.translate(0, 0.14, 0);
    // Rotate +y onto the vertex direction.
    const yaw = Math.atan2(x, z);
    const pitch = Math.acos(Math.max(-1, Math.min(1, y)));
    spike.rotateX(pitch);
    spike.rotateY(yaw);
    spike.translate(0, h, 0);
    spikes.push(spike);
  }
  return {
    head: merge(spikes),
    core: place(new IcosahedronGeometry(0.1, 0), { at: [0, h, 0] }),
  };
}

function lily(h: number): Omit<FlowerParts, 'stem'> {
  const tip = () => place(new ConeGeometry(0.05, 0.14, 3), { at: [0, 0.07, 0] });
  return {
    head: merge([
      place(new ConeGeometry(0.13, 0.22, 6, 1, true), { at: [0, h + 0.07, 0], rotate: [Math.PI, 0, 0] }),
      ...ring(5, 0.12, h + 0.16, tip, 1.0),
    ]),
    core: merge(ring(3, 0.025, h + 0.12, () => place(new BoxGeometry(0.012, 0.16, 0.012), { at: [0, 0.08, 0] }), 0.2)),
  };
}

function asphodel(h: number): Omit<FlowerParts, 'stem'> {
  // Star-shaped florets spiralling up the top of a tall stalk.
  const florets = Array.from({ length: 7 }, (_, i) => {
    const a = i * 2.4;
    const y = h - 0.35 + i * 0.06;
    return place(new OctahedronGeometry(0.05, 0), { at: [Math.sin(a) * 0.06, y, Math.cos(a) * 0.06], scale: [1, 0.5, 1] });
  });
  return {
    head: merge(florets),
    core: place(new OctahedronGeometry(0.035, 0), { at: [0, h + 0.08, 0] }),
  };
}

function bud(h: number): Omit<FlowerParts, 'stem'> {
  const sepal = () => place(new ConeGeometry(0.035, 0.1, 3), { at: [0, 0.05, 0] });
  return {
    head: place(new IcosahedronGeometry(0.085, 0), { at: [0, h + 0.1, 0], scale: [0.85, 1.6, 0.85] }),
    core: merge(ring(4, 0.05, h - 0.02, sepal, -0.5)),
  };
}

/** Teaser: a curled shoot with two young leaves and a gold glint at the tip. */
function sprout(h: number): Omit<FlowerParts, 'stem'> {
  return {
    head: merge([
      place(new BoxGeometry(0.16, 0.012, 0.07), { at: [0.07, h * 0.8, 0], rotate: [0, 0, 0.6] }),
      place(new BoxGeometry(0.14, 0.012, 0.06), { at: [-0.06, h * 0.9, 0.01], rotate: [0, 0.3, -0.7] }),
      place(new ConeGeometry(0.03, 0.09, 4), { at: [0.02, h + 0.04, 0], rotate: [0, 0, -0.4] }),
    ]),
    core: place(new OctahedronGeometry(0.03, 0), { at: [0.035, h + 0.1, 0] }),
  };
}

const BUILDERS: Record<VisualSpecies, (h: number) => Omit<FlowerParts, 'stem'>> = {
  rose,
  spiral,
  iris,
  thistle,
  lily,
  asphodel,
  bud,
  sprout,
};

/** Builds one species, optionally raised for singles on plinths. */
export function buildFlower(species: VisualSpecies, onPlinth: boolean): FlowerParts {
  const lift = onPlinth ? PLINTH_HEIGHT : 0;
  const h = FLOWER_STYLES[species].height;
  const parts = BUILDERS[species](h);
  return {
    stem: stem(h).translate(0, lift, 0),
    head: parts.head.translate(0, lift, 0),
    core: parts.core.translate(0, lift, 0),
  };
}

export function plinthGeometry(): BufferGeometry {
  return merge([
    place(new BoxGeometry(0.46, 0.08, 0.46), { at: [0, 0.04, 0] }),
    place(new CylinderGeometry(0.15, 0.17, PLINTH_HEIGHT - 0.14, 6), { at: [0, PLINTH_HEIGHT / 2, 0] }),
    place(new BoxGeometry(0.4, 0.07, 0.4), { at: [0, PLINTH_HEIGHT - 0.035, 0] }),
  ]);
}
