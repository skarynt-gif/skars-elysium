/**
 * Converts between the Studio's database rows and the public game's
 * manifest.json, so the game keeps reading exactly the format it already
 * understands, and every check the game applies also runs in the Studio.
 */
import { validateManifest } from '../../src/content/validate.ts';
import { RELEASE_TIME_ZONE } from '../../src/config/release.ts';
import type { ContentIssue, Decoration, GardenEnvironment, Manifest } from '../../src/content/types.ts';
import { DEFAULT_ENVIRONMENT, ENVIRONMENT_KEYS } from '../../src/game/world/environment.ts';

export interface CollectionRow {
  id: string;
  title: string;
  type: string;
  area: string;
  cover: string | null;
  description: string | null;
  auto_bloom: number;
  sort_order: number;
  plot: string | null;
}

export interface SongRow {
  id: string;
  collection_id: string;
  title: string;
  artist: string;
  genre: string;
  status: string;
  audio: string | null;
  preview: string | null;
  cover: string | null;
  release_date: string | null;
  teaser: number;
  flower_species: string | null;
  flower_hue: number | null;
  flower_scale: number | null;
  flower_color: string | null;
  flower_core: string | null;
  flower_label: string | null;
  description: string | null;
  sort_order: number;
}

export type DecorationRow = Decoration;

export interface GardenRows {
  collections: CollectionRow[];
  songs: SongRow[];
  decorations?: DecorationRow[];
  /** null = the original sunset settings. */
  environment?: GardenEnvironment | null;
}

const isDefaultEnvironment = (env: GardenEnvironment) => ENVIRONMENT_KEYS.every((k) => env[k] === DEFAULT_ENVIRONMENT[k]);

/**
 * The live manifest is served at <garden>/media/manifest.json and its media
 * paths are relative to it. Validating against this stand-in address lets the
 * Studio turn resolved URLs back into those relative paths.
 */
const MANIFEST_URL = 'https://garden.invalid/media/manifest.json';
const MEDIA_BASE = new URL('./', MANIFEST_URL).href;

function storedPath(url: string | undefined): string | null {
  if (!url) return null;
  return url.startsWith(MEDIA_BASE) ? decodeURI(url.slice(MEDIA_BASE.length)) : url;
}

export interface CheckedManifest {
  manifest: Manifest;
  issues: ContentIssue[];
}

/** Runs the game's own content checks. Media URLs come back resolved. */
export function checkManifest(raw: unknown): CheckedManifest {
  return validateManifest(raw, { manifestUrl: MANIFEST_URL, releaseTimeZone: RELEASE_TIME_ZONE });
}

/** Turns a checked manifest into database rows (relative media paths). */
export function manifestToRows(manifest: Manifest): GardenRows {
  return {
    decorations: manifest.garden?.decorations.map((d) => ({ ...d })) ?? [],
    environment: manifest.garden && !isDefaultEnvironment(manifest.garden.environment) ? { ...manifest.garden.environment } : null,
    collections: manifest.collections.map((c) => ({
      id: c.id,
      title: c.title,
      type: c.type,
      area: c.area,
      cover: storedPath(c.cover),
      description: c.description ?? null,
      auto_bloom: c.autoBloom ? 1 : 0,
      sort_order: c.order,
      plot: c.plot ?? null,
    })),
    songs: manifest.songs.map((s) => ({
      id: s.id,
      collection_id: s.collectionId,
      title: s.title,
      artist: s.artist,
      genre: s.genre,
      status: s.status,
      audio: storedPath(s.audio),
      preview: storedPath(s.preview),
      cover: storedPath(s.cover),
      release_date: s.releaseDate ?? null,
      teaser: s.teaser ? 1 : 0,
      flower_species: s.flower?.species ?? null,
      flower_hue: s.flower?.hue ?? null,
      flower_scale: s.flower?.scale ?? null,
      flower_color: s.flower?.color ?? null,
      flower_core: s.flower?.core ?? null,
      flower_label: s.flower?.label ?? null,
      description: s.description ?? null,
      sort_order: s.order,
    })),
  };
}

/** Builds manifest.json content (as the game expects it) from database rows. */
export function rowsToManifestJson(rows: GardenRows): Record<string, unknown> {
  const byOrder = <T extends { sort_order: number; id: string }>(a: T, b: T) =>
    a.sort_order - b.sort_order || a.id.localeCompare(b.id);
  const decorations = rows.decorations ?? [];
  const environment = rows.environment ?? null;
  // Only written when used, so a garden without decorations stays exactly as before.
  const garden =
    decorations.length || (environment && !isDefaultEnvironment(environment))
      ? {
          garden: {
            decorations: [...decorations]
              .sort((a, b) => a.id.localeCompare(b.id))
              .map((d) => ({ id: d.id, preset: d.preset, x: d.x, z: d.z, rotation: d.rotation, scale: d.scale })),
            environment: environment ?? DEFAULT_ENVIRONMENT,
          },
        }
      : {};
  return {
    ...garden,
    version: 1,
    collections: [...rows.collections].sort(byOrder).map((c) => ({
      id: c.id,
      title: c.title,
      type: c.type,
      area: c.area,
      ...(c.cover ? { cover: c.cover } : {}),
      ...(c.description ? { description: c.description } : {}),
      ...(c.auto_bloom ? { autoBloom: true } : {}),
      ...(c.plot ? { plot: c.plot } : {}),
      order: c.sort_order,
    })),
    songs: [...rows.songs].sort(byOrder).map((s) => {
      const flower = {
        ...(s.flower_species ? { species: s.flower_species } : {}),
        ...(s.flower_hue !== null ? { hue: s.flower_hue } : {}),
        ...(s.flower_scale !== null ? { scale: s.flower_scale } : {}),
        ...(s.flower_color ? { color: s.flower_color } : {}),
        ...(s.flower_core ? { core: s.flower_core } : {}),
        ...(s.flower_label ? { label: s.flower_label } : {}),
      };
      return {
        id: s.id,
        title: s.title,
        artist: s.artist,
        collectionId: s.collection_id,
        genre: s.genre,
        status: s.status,
        ...(s.audio ? { audio: s.audio } : {}),
        ...(s.preview ? { preview: s.preview } : {}),
        ...(s.cover ? { cover: s.cover } : {}),
        ...(s.release_date ? { releaseDate: s.release_date } : {}),
        ...(s.teaser ? { teaser: true } : {}),
        ...(s.description ? { description: s.description } : {}),
        ...(Object.keys(flower).length ? { flower } : {}),
        order: s.sort_order,
      };
    }),
  };
}
