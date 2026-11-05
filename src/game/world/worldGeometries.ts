import { WORLD } from './layout.ts';
import * as G from './geometries.ts';

/** Shared model library, built once on first use and kept for the page's life. */
function build() {
  return {
    column: G.columnGeometry(),
    brokenColumn: G.brokenColumnGeometry(),
    statues: [0, 1, 2, 3].map(G.statueGeometry),
    fountainStone: G.fountainStoneGeometry(),
    fountainGold: G.fountainGoldGeometry(),
    fountainWater: G.fountainWaterGeometry(),
    gatePillar: G.gatePillarGeometry(),
    gateUrn: G.gatePillarUrnGeometry(),
    gateBars: G.gateBarsGeometry(WORLD.gate.leafWidth),
    gateFinials: G.gateFinialsGeometry(WORLD.gate.leafWidth),
    cypressCrown: G.cypressCrownGeometry(),
    cypressTrunk: G.cypressTrunkGeometry(),
    oliveTrunk: G.oliveTrunkGeometry(),
    oliveCrown: G.oliveCrownGeometry(),
    hedge: G.hedgeGeometry(),
    tuft: G.tuftGeometry(),
    shadow: G.shadowGeometry(),
    bedSoil: G.bedSoilGeometry(WORLD.bed.width, WORLD.bed.depth),
    bedCurb: G.bedCurbGeometry(WORLD.bed.width, WORLD.bed.depth),
    signPosts: G.signPostsGeometry(),
    signFace: G.signFaceGeometry(),
    shrineStone: G.shrineStoneGeometry(),
    amphora: G.amphoraGeometry(),
    arrowBase: G.arrowBaseGeometry(),
    arrowInlay: G.arrowInlayGeometry(),
    arrowHit: G.arrowHitGeometry(),
    lanternPost: G.lanternPostGeometry(),
    lanternGlow: G.lanternGlowGeometry(),
    bench: G.benchGeometry(),
    urn: G.urnGeometry(),
    archway: G.archwayGeometry(),
  };
}

export type WorldGeometries = ReturnType<typeof build>;

let cache: WorldGeometries | null = null;
export function getWorldGeometries(): WorldGeometries {
  cache ??= build();
  return cache;
}
