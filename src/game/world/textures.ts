import { seededRandom } from '../../lib/random.ts';
import { createPixelTexture } from '../render/pixelTexture.ts';

/**
 * Hand-tuned procedural pixel textures (16–32px), painted once at startup.
 * They can be swapped for hand-drawn PNGs later through configurePixelTexture,
 * with no other code changes.
 */

type Painter = (ctx: CanvasRenderingContext2D, size: number) => void;

function speckle(colors: readonly string[], seed: string, base: string): Painter {
  return (ctx, size) => {
    const rand = seededRandom(seed);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const r = rand();
        const color = colors[Math.floor(r * colors.length * 3)];
        if (color) {
          ctx.fillStyle = color;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  };
}

/** Marble paving: square flagstones with grout lines and faint veins. */
const marbleTiles: Painter = (ctx, size) => {
  speckle(['#e2d7c4', '#d6cab6'], 'tiles', '#ebe2d1')(ctx, size);
  ctx.fillStyle = '#b8a98f';
  const half = size / 2;
  ctx.fillRect(0, 0, size, 1);
  ctx.fillRect(0, 0, 1, size);
  ctx.fillRect(0, half, size, 1);
  ctx.fillRect(half, 0, 1, half);
  ctx.fillRect(half / 2, half, 1, half);
  ctx.fillStyle = '#d2c3aa';
  for (const [x, y] of [[4, 3], [5, 4], [6, 4], [20, 6], [21, 7], [11, 22], [12, 23], [26, 25], [27, 26]]) {
    ctx.fillRect(x! % size, y! % size, 1, 1);
  }
};

/** Smooth carved marble for columns and statues. */
const marbleStone: Painter = (ctx, size) => {
  speckle(['#f0e7d8', '#e6dccb'], 'stone', '#f4ecdf')(ctx, size);
  ctx.fillStyle = '#d8ccb7';
  const rand = seededRandom('stone-veins');
  let x = Math.floor(rand() * size);
  for (let y = 0; y < size; y++) {
    x = (x + (rand() < 0.5 ? -1 : 1) + size) % size;
    ctx.fillRect(x, y, 1, 1);
  }
};

/** Warm sunset grass: greens nudged toward gold. */
const grass: Painter = speckle(['#5c7a3a', '#6f8a3e', '#7f8f40', '#4d6a35', '#8a9446'], 'grass', '#65803c');

/** Dense hedge leaves with dark gaps. */
const hedge: Painter = speckle(['#2f5a32', '#3d6b37', '#24462a', '#4b7a3c'], 'hedge', '#355f34');

/** Cypress: very dark, slightly blue-green. */
const cypress: Painter = speckle(['#1f3d2c', '#2a4c33', '#183126', '#355a38'], 'cypress', '#24432f');

/** Olive leaves: silvery sage. */
const olive: Painter = speckle(['#7d8f63', '#93a275', '#66784f', '#a4b086'], 'olive', '#84966a');

const bark: Painter = (ctx, size) => {
  speckle(['#5a4433', '#4a372a', '#6b5240'], 'bark', '#56412f')(ctx, size);
  ctx.fillStyle = '#3e2e22';
  for (let x = 1; x < size; x += 4) ctx.fillRect(x, 0, 1, size);
};

const soil: Painter = speckle(['#4a3326', '#5a3f2e', '#3e2a20', '#6a4a35'], 'soil', '#513828');

const bronze: Painter = (ctx, size) => {
  speckle(['#8a5a30', '#a06a38', '#6e4626', '#5f8a6e'], 'bronze', '#94622f')(ctx, size);
};

const gold: Painter = speckle(['#e8c15a', '#f4d77a', '#c99a3a'], 'gold', '#ddb04a');

/** Pool water; ambient/FountainWater.tsx scrolls it. */
const water: Painter = (ctx, size) => {
  speckle(['#3f6d8a', '#4b7d98', '#35607c'], 'water', '#447590')(ctx, size);
  ctx.fillStyle = '#9fc4d4';
  for (const [x, y] of [[3, 2], [4, 2], [10, 7], [11, 7], [6, 12], [7, 12], [13, 13]]) ctx.fillRect(x!, y!, 1, 1);
};

/** Cut-out grass tuft (transparent background) for crossed-plane foliage. */
const grassTuft: Painter = (ctx, size) => {
  ctx.clearRect(0, 0, size, size);
  const rand = seededRandom('tuft');
  const colors = ['#6f8a3e', '#8a9446', '#5c7a3a', '#a39a4a'];
  for (let blade = 0; blade < 7; blade++) {
    let x = 2 + Math.floor(rand() * (size - 4));
    const height = Math.floor(size * (0.45 + rand() * 0.5));
    ctx.fillStyle = colors[blade % colors.length]!;
    for (let y = 0; y < height; y++) {
      if (y > 2 && rand() < 0.25) x += rand() < 0.5 ? -1 : 1;
      ctx.fillRect(Math.max(0, Math.min(size - 1, x)), size - 1 - y, 1, 1);
    }
  }
};

/** Soft round shadow, stepped like 90s blob shadows. */
const blobShadow: Painter = (ctx, size) => {
  const c = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c) / c;
      const alpha = d < 0.55 ? 0.5 : d < 0.8 ? 0.32 : d < 1 ? 0.15 : 0;
      ctx.fillStyle = `rgba(30, 12, 40, ${alpha})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
};

/** Warm stepped glow for halos around the playing flower. */
const glow: Painter = (ctx, size) => {
  const c = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c) / c;
      const a = d < 0.3 ? 0.9 : d < 0.55 ? 0.55 : d < 0.8 ? 0.25 : d < 1 ? 0.08 : 0;
      ctx.fillStyle = `rgba(255, 214, 120, ${a})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
};

/** One butterfly wing (cut-out): a rounded pixel wing with a dark edge and eye-spot. */
const butterflyWing: Painter = (ctx, size) => {
  ctx.clearRect(0, 0, size, size);
  const rows = [
    '....##########..',
    '..#############.',
    '.##############.',
    '###########oo###',
    '##########o..o##',
    '##########o..o##',
    '###########oo##.',
    '.#############..',
    '..###########...',
    '...##########...',
    '....########....',
    '.....######.....',
    '......####......',
    '.......##.......',
  ];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      const edge = x === 0 || row[x - 1] === '.' || row[x + 1] === '.' || row[x + 1] === undefined || (rows[y - 1]?.[x] ?? '.') === '.';
      ctx.fillStyle = ch === 'o' ? '#2a1846' : edge ? '#3a2410' : '#ffffff';
      ctx.fillRect(x, y + 1, 1, 1);
    }
  });
};

/** Puffy sunset clouds lit pink-gold from below (cut-out, tiles horizontally). */
const clouds: Painter = (ctx, size) => {
  ctx.clearRect(0, 0, size, size);
  const rand = seededRandom('clouds');
  const puffs: [number, number, number][] = [];
  for (let i = 0; i < 9; i++) puffs.push([rand() * size, size * 0.45 + rand() * size * 0.25, 5 + rand() * 9]);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let density = 0;
      for (const [px, py, r] of puffs) {
        // Wrap horizontally so the band tiles seamlessly.
        const dx = Math.min(Math.abs(x - px), size - Math.abs(x - px));
        density = Math.max(density, 1 - Math.hypot(dx, (y - py) * 1.6) / r);
      }
      if (density <= 0.05) continue;
      const lit = y > size * 0.55 ? '#ffb38a' : y > size * 0.45 ? '#f08fa4' : '#c27aa6';
      ctx.fillStyle = density > 0.45 ? lit : '#9a5f9a';
      ctx.globalAlpha = density > 0.45 ? 0.85 : 0.5;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  ctx.globalAlpha = 1;
};

export const TEXTURE_PAINTERS = {
  butterflyWing: [16, butterflyWing],
  clouds: [64, clouds],
  glow: [16, glow],
  marbleTiles: [32, marbleTiles],
  marbleStone: [16, marbleStone],
  grass: [32, grass],
  hedge: [16, hedge],
  cypress: [16, cypress],
  olive: [16, olive],
  bark: [16, bark],
  soil: [16, soil],
  bronze: [16, bronze],
  gold: [16, gold],
  water: [16, water],
  grassTuft: [16, grassTuft],
  blobShadow: [16, blobShadow],
} as const satisfies Record<string, readonly [number, Painter]>;

export type TextureName = keyof typeof TEXTURE_PAINTERS;

export function paintTexture(name: TextureName) {
  const [size, painter] = TEXTURE_PAINTERS[name];
  return createPixelTexture(size, painter);
}
