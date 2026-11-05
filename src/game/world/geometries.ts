import {
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
  ExtrudeGeometry,
  LatheGeometry,
  PlaneGeometry,
  Shape,
  Vector2,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Low-poly models built from primitives in code: chunky PS1-era geometry,
 * no external files to download. Any of these can later be replaced by a
 * Blender .glb without touching the scene layout.
 */

type Transform = {
  at?: [number, number, number];
  rotate?: [number, number, number];
  scale?: [number, number, number];
};

/** Applies scale → rotation → translation to a part. */
export function place(geometry: BufferGeometry, { at = [0, 0, 0], rotate = [0, 0, 0], scale = [1, 1, 1] }: Transform) {
  geometry.scale(...scale);
  geometry.rotateX(rotate[0]);
  geometry.rotateY(rotate[1]);
  geometry.rotateZ(rotate[2]);
  geometry.translate(...at);
  return geometry;
}

/** Merges parts into one geometry (one draw call). */
export function merge(parts: BufferGeometry[]): BufferGeometry {
  const flat = parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p;
    // Keep only the attributes every part shares.
    for (const name of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    }
    return g;
  });
  const merged = mergeGeometries(flat, false);
  if (!merged) throw new Error('Could not merge world geometry parts.');
  merged.computeBoundingSphere();
  return merged;
}

/** Sets UVs from world x/z so textures tile at a fixed real-world size. */
export function planarUV(geometry: BufferGeometry, metersPerTile: number): BufferGeometry {
  const pos = geometry.getAttribute('position');
  const uv: number[] = [];
  for (let i = 0; i < pos.count; i++) uv.push(pos.getX(i) / metersPerTile, -pos.getZ(i) / metersPerTile);
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  return geometry;
}

/** Horizontal disc / strip helpers (geometry lies flat on the ground). */
export function groundDisc(radius: number, segments: number, y: number) {
  return place(new CircleGeometry(radius, segments), { rotate: [-Math.PI / 2, 0, 0], at: [0, y, 0] });
}
export function groundStrip(from: [number, number], to: [number, number], width: number, y: number) {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const length = Math.hypot(dx, dz);
  return place(new PlaneGeometry(width, length), {
    rotate: [-Math.PI / 2, Math.atan2(dx, dz), 0],
    at: [(from[0] + to[0]) / 2, y, (from[1] + to[1]) / 2],
  });
}

// ---------------------------------------------------------------- columns

export function columnGeometry(): BufferGeometry {
  return merge([
    place(new BoxGeometry(1.1, 0.25, 1.1), { at: [0, 0.125, 0] }),
    place(new CylinderGeometry(0.5, 0.55, 0.18, 8), { at: [0, 0.34, 0] }),
    place(new CylinderGeometry(0.38, 0.44, 3.3, 8), { at: [0, 2.08, 0] }),
    place(new CylinderGeometry(0.56, 0.4, 0.28, 8), { at: [0, 3.87, 0] }),
    place(new BoxGeometry(1.25, 0.22, 1.25), { at: [0, 4.12, 0] }),
  ]);
}

/** Weathered stump with a fallen drum lying beside it. */
export function brokenColumnGeometry(): BufferGeometry {
  return merge([
    place(new BoxGeometry(1.1, 0.25, 1.1), { at: [0, 0.125, 0] }),
    place(new CylinderGeometry(0.5, 0.55, 0.18, 8), { at: [0, 0.34, 0] }),
    place(new CylinderGeometry(0.4, 0.44, 1.5, 8), { at: [0, 1.18, 0], rotate: [0.05, 0, 0.04] }),
    place(new CylinderGeometry(0.39, 0.4, 1.2, 8), { at: [1.3, 0.38, 0.5], rotate: [0, 0.6, Math.PI / 2] }),
  ]);
}

// ---------------------------------------------------------------- statues

/** Robed figure on a pedestal. Variants change the pose and held object. */
export function statueGeometry(variant: number): BufferGeometry {
  const poses: { left: number; right: number; holding: 'lyre' | 'bowl' | 'none' | 'laurel' }[] = [
    { left: -0.35, right: 2.6, holding: 'laurel' },
    { left: -1.2, right: 0.35, holding: 'lyre' },
    { left: 0.25, right: -0.25, holding: 'none' },
    { left: -1.35, right: -1.35, holding: 'bowl' },
  ];
  const pose = poses[variant % poses.length]!;
  const top = 1.2; // pedestal height
  const parts = [
    place(new BoxGeometry(1.2, 0.2, 1.2), { at: [0, 0.1, 0] }),
    place(new BoxGeometry(0.95, 0.85, 0.95), { at: [0, 0.62, 0] }),
    place(new BoxGeometry(1.15, 0.15, 1.15), { at: [0, 1.12, 0] }),
    // Robe and torso
    place(new CylinderGeometry(0.24, 0.42, 1.25, 7), { at: [0, top + 0.62, 0] }),
    place(new BoxGeometry(0.52, 0.55, 0.32), { at: [0, top + 1.5, 0] }),
    // Head
    place(new IcosahedronGeometry(0.2, 0), { at: [0, top + 2.0, 0] }),
    // Arms, pivoting at the shoulders
    place(new BoxGeometry(0.13, 0.62, 0.13), { at: [-0.34, top + 1.48, 0], rotate: [pose.left, 0, 0.12] }),
    place(new BoxGeometry(0.13, 0.62, 0.13), { at: [0.34, top + 1.48, 0], rotate: [pose.right, 0, -0.12] }),
  ];
  if (pose.holding === 'lyre') {
    parts.push(place(new BoxGeometry(0.3, 0.38, 0.05), { at: [-0.34, top + 1.35, 0.42] }));
  } else if (pose.holding === 'bowl') {
    parts.push(place(new CylinderGeometry(0.28, 0.14, 0.12, 7), { at: [0, top + 1.25, 0.5] }));
  } else if (pose.holding === 'laurel') {
    parts.push(place(new IcosahedronGeometry(0.13, 0), { at: [0.34, top + 2.22, -0.18] }));
  }
  return merge(parts);
}

// ---------------------------------------------------------------- fountain

const lathe = (points: [number, number][], segments: number) =>
  new LatheGeometry(
    points.map(([x, y]) => new Vector2(x, y)),
    segments,
  );

export function fountainStoneGeometry(): BufferGeometry {
  return merge([
    // Octagonal lower basin
    lathe(
      [
        [0.01, 0.2],
        [2.85, 0.2],
        [2.85, 0.75],
        [3.2, 0.75],
        [3.25, 0.65],
        [3.2, 0],
      ],
      8,
    ),
    // Central pillar
    place(new CylinderGeometry(0.32, 0.42, 1.7, 8), { at: [0, 1.05, 0] }),
    // Upper bowl
    lathe(
      [
        [0.3, 1.85],
        [1.3, 2.15],
        [1.32, 2.3],
        [1.18, 2.3],
        [0.35, 2.05],
      ],
      8,
    ),
  ]);
}

export function fountainGoldGeometry(): BufferGeometry {
  return merge([
    place(new CylinderGeometry(0.1, 0.16, 0.45, 6), { at: [0, 2.5, 0] }),
    place(new IcosahedronGeometry(0.22, 0), { at: [0, 2.85, 0] }),
  ]);
}

export function fountainWaterGeometry(): BufferGeometry {
  return merge([groundDisc(2.85, 8, 0.62), groundDisc(1.18, 8, 2.22)]);
}

// ---------------------------------------------------------------- entrance gate

export function gatePillarGeometry(): BufferGeometry {
  return merge([
    place(new BoxGeometry(1.0, 0.3, 1.0), { at: [0, 0.15, 0] }),
    place(new BoxGeometry(0.85, 3.4, 0.85), { at: [0, 2.0, 0] }),
    place(new BoxGeometry(1.1, 0.3, 1.1), { at: [0, 3.85, 0] }),
  ]);
}

export function gatePillarUrnGeometry(): BufferGeometry {
  return lathe(
    [
      [0.01, 4.0],
      [0.25, 4.05],
      [0.35, 4.35],
      [0.18, 4.6],
      [0.24, 4.75],
      [0.01, 4.76],
    ],
    6,
  );
}

/**
 * One gate leaf. Hinge at local x = 0, extending to x = `width` (mirror with
 * scale.x = -1 for the other side).
 */
export function gateBarsGeometry(width: number): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const barCount = Math.round(width / 0.24);
  for (let i = 0; i <= barCount; i++) {
    const x = 0.06 + (i / barCount) * (width - 0.12);
    parts.push(place(new BoxGeometry(0.06, 2.9, 0.06), { at: [x, 1.6, 0] }));
  }
  for (const y of [0.35, 1.0, 2.9]) {
    parts.push(place(new BoxGeometry(width, 0.09, 0.09), { at: [width / 2, y, 0] }));
  }
  return merge(parts);
}

export function gateFinialsGeometry(width: number): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const barCount = Math.round(width / 0.24);
  for (let i = 0; i <= barCount; i++) {
    const x = 0.06 + (i / barCount) * (width - 0.12);
    parts.push(place(new ConeGeometry(0.07, 0.24, 4), { at: [x, 3.17, 0] }));
  }
  // Gold ring motif between the rails
  parts.push(place(new BoxGeometry(0.5, 0.5, 0.05), { at: [width * 0.55, 0.68, 0], rotate: [0, 0, Math.PI / 4] }));
  return merge(parts);
}

// ---------------------------------------------------------------- vegetation

export function cypressCrownGeometry(): BufferGeometry {
  return merge([
    place(new ConeGeometry(0.85, 4.6, 7), { at: [0, 3.2, 0] }),
    place(new CylinderGeometry(0.6, 0.85, 1.1, 7), { at: [0, 1.25, 0] }),
  ]);
}

export function cypressTrunkGeometry(): BufferGeometry {
  return place(new CylinderGeometry(0.16, 0.22, 0.8, 5), { at: [0, 0.4, 0] });
}

export function oliveTrunkGeometry(): BufferGeometry {
  return merge([
    place(new CylinderGeometry(0.2, 0.3, 1.6, 6), { at: [0, 0.8, 0], rotate: [0, 0, 0.12] }),
    place(new CylinderGeometry(0.12, 0.18, 1.2, 5), { at: [0.35, 2.0, 0.1], rotate: [0.2, 0, -0.5] }),
    place(new CylinderGeometry(0.12, 0.18, 1.1, 5), { at: [-0.25, 2.0, -0.1], rotate: [-0.25, 0, 0.45] }),
  ]);
}

export function oliveCrownGeometry(): BufferGeometry {
  return merge([
    place(new IcosahedronGeometry(1.1, 0), { at: [0.6, 2.9, 0.2], scale: [1.2, 0.75, 1.1] }),
    place(new IcosahedronGeometry(1.0, 0), { at: [-0.5, 2.8, -0.2], scale: [1.1, 0.7, 1.2] }),
    place(new IcosahedronGeometry(0.9, 0), { at: [0.05, 3.45, 0], scale: [1.2, 0.7, 1.1] }),
  ]);
}

export function hedgeGeometry(): BufferGeometry {
  return place(new IcosahedronGeometry(1.0, 1), { at: [0, 0.75, 0], scale: [1, 0.85, 1] });
}

/** Two crossed quads: classic PS1 grass/flower billboard. */
export function tuftGeometry(): BufferGeometry {
  return merge([
    place(new PlaneGeometry(0.7, 0.55), { at: [0, 0.27, 0] }),
    place(new PlaneGeometry(0.7, 0.55), { at: [0, 0.27, 0], rotate: [0, Math.PI / 2, 0] }),
  ]);
}

/** Flat ground decal (blob shadow), unit radius. */
export function shadowGeometry(): BufferGeometry {
  return place(new PlaneGeometry(2, 2), { rotate: [-Math.PI / 2, 0, 0], at: [0, 0.03, 0] });
}

// ---------------------------------------------------------------- beds & signs

export function bedSoilGeometry(width: number, depth: number): BufferGeometry {
  return place(new BoxGeometry(width - 0.3, 0.3, depth - 0.3), { at: [0, 0.12, 0] });
}

export function bedCurbGeometry(width: number, depth: number): BufferGeometry {
  const h = 0.36;
  const t = 0.22;
  return merge([
    place(new BoxGeometry(width, h, t), { at: [0, h / 2, depth / 2 - t / 2] }),
    place(new BoxGeometry(width, h, t), { at: [0, h / 2, -depth / 2 + t / 2] }),
    place(new BoxGeometry(t, h, depth - 2 * t), { at: [width / 2 - t / 2, h / 2, 0] }),
    place(new BoxGeometry(t, h, depth - 2 * t), { at: [-width / 2 + t / 2, h / 2, 0] }),
  ]);
}

export function signPostsGeometry(): BufferGeometry {
  return merge([
    place(new BoxGeometry(0.12, 1.15, 0.12), { at: [-0.95, 0.57, 0] }),
    place(new BoxGeometry(0.12, 1.15, 0.12), { at: [0.95, 0.57, 0] }),
    place(new BoxGeometry(2.35, 0.7, 0.1), { at: [0, 1.02, -0.06] }),
  ]);
}

/** Front face of the sign, carrying the title texture. */
export function signFaceGeometry(): BufferGeometry {
  return place(new PlaneGeometry(2.2, 0.55), { at: [0, 1.02, 0.0] });
}

// ---------------------------------------------------------------- sanctuary & grove

export function wallGeometry(from: [number, number], to: [number, number], height: number, thickness: number) {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const length = Math.hypot(dx, dz);
  return place(new BoxGeometry(length, height, thickness), {
    rotate: [0, -Math.atan2(dz, dx), 0],
    at: [(from[0] + to[0]) / 2, height / 2, (from[1] + to[1]) / 2],
  });
}

export function shrineStoneGeometry(): BufferGeometry {
  return merge([
    place(new BoxGeometry(1.4, 0.25, 1.4), { at: [0, 0.125, 0] }),
    place(new CylinderGeometry(0.45, 0.55, 0.9, 8), { at: [0, 0.7, 0] }),
  ]);
}

export function amphoraGeometry(): BufferGeometry {
  return lathe(
    [
      [0.01, 1.15],
      [0.16, 1.18],
      [0.32, 1.45],
      [0.3, 1.75],
      [0.12, 1.95],
      [0.17, 2.08],
      [0.01, 2.09],
    ],
    7,
  );
}

// ---------------------------------------------------------------- navigation arrows

/** Chunky arrow outline pointing toward −y in shape space (+z once laid flat). */
function arrowShape(scale: number): Shape {
  const pts: [number, number][] = [
    [0, -0.78],
    [0.58, -0.06],
    [0.22, -0.06],
    [0.22, 0.66],
    [-0.22, 0.66],
    [-0.22, -0.06],
    [-0.58, -0.06],
  ];
  return new Shape(pts.map(([x, y]) => new Vector2(x * scale, y * scale)));
}

/** Marble arrow slab set into the path, pointing along local +z. */
export function arrowBaseGeometry(): BufferGeometry {
  const g = new ExtrudeGeometry(arrowShape(1), { depth: 0.07, bevelEnabled: false });
  return place(g, { rotate: [-Math.PI / 2, 0, 0], at: [0, 0.012, 0] });
}

/** Gold inlay, slightly raised so it reads clearly at low resolution. */
export function arrowInlayGeometry(): BufferGeometry {
  const g = new ExtrudeGeometry(arrowShape(0.62), { depth: 0.03, bevelEnabled: false });
  return place(g, { rotate: [-Math.PI / 2, 0, 0], at: [0, 0.07, 0.04] });
}

/** Invisible, generous hit area so arrows are easy to click or tap. */
export function arrowHitGeometry(): BufferGeometry {
  return place(new CircleGeometry(1.05, 10), { rotate: [-Math.PI / 2, 0, 0], at: [0, 0.1, 0] });
}

// ---------------------------------------------------------------- Studio decorations

/** Bronze post lantern; the lamp itself is a separate glowing part. */
export function lanternPostGeometry(): BufferGeometry {
  return merge([
    place(new BoxGeometry(0.32, 0.12, 0.32), { at: [0, 0.06, 0] }),
    place(new CylinderGeometry(0.05, 0.07, 1.7, 6), { at: [0, 0.95, 0] }),
    place(new BoxGeometry(0.34, 0.05, 0.34), { at: [0, 1.82, 0] }),
    place(new ConeGeometry(0.26, 0.24, 4), { at: [0, 2.22, 0], rotate: [0, Math.PI / 4, 0] }),
  ]);
}

export function lanternGlowGeometry(): BufferGeometry {
  return place(new BoxGeometry(0.22, 0.26, 0.22), { at: [0, 1.98, 0] });
}

/** Marble garden bench: a slab on two scrolled supports. */
export function benchGeometry(): BufferGeometry {
  return merge([
    place(new BoxGeometry(1.7, 0.12, 0.5), { at: [0, 0.5, 0] }),
    place(new BoxGeometry(0.22, 0.44, 0.44), { at: [-0.62, 0.22, 0] }),
    place(new BoxGeometry(0.22, 0.44, 0.44), { at: [0.62, 0.22, 0] }),
    place(new CylinderGeometry(0.08, 0.08, 0.5, 6), { at: [-0.62, 0.36, 0], rotate: [Math.PI / 2, 0, 0] }),
    place(new CylinderGeometry(0.08, 0.08, 0.5, 6), { at: [0.62, 0.36, 0], rotate: [Math.PI / 2, 0, 0] }),
  ]);
}

/** Tall urn on a square plinth. */
export function urnGeometry(): BufferGeometry {
  return merge([
    place(new BoxGeometry(0.62, 0.5, 0.62), { at: [0, 0.25, 0] }),
    place(new BoxGeometry(0.7, 0.08, 0.7), { at: [0, 0.54, 0] }),
    lathe(
      [
        [0.01, 0.58],
        [0.14, 0.6],
        [0.1, 0.7],
        [0.3, 0.98],
        [0.28, 1.25],
        [0.16, 1.4],
        [0.24, 1.48],
        [0.01, 1.5],
      ],
      8,
    ),
  ]);
}

/** Two columns joined by a lintel; visitors walk through the middle. */
export function archwayGeometry(): BufferGeometry {
  const pillar = (x: number) => [
    place(new BoxGeometry(0.76, 0.22, 0.76), { at: [x, 0.11, 0] }),
    place(new CylinderGeometry(0.28, 0.32, 2.9, 8), { at: [x, 1.67, 0] }),
    place(new BoxGeometry(0.8, 0.2, 0.8), { at: [x, 3.22, 0] }),
  ];
  return merge([
    ...pillar(-1.35),
    ...pillar(1.35),
    place(new BoxGeometry(3.6, 0.38, 0.7), { at: [0, 3.51, 0] }),
    place(new BoxGeometry(3.9, 0.12, 0.8), { at: [0, 3.76, 0] }),
  ]);
}
