import {
  COLLECTION_TYPES,
  FLOWER_SPECIES,
  GARDEN_AREAS,
  GENRES,
  RELEASE_STATUSES,
  type Collection,
  type ContentIssue,
  type FlowerAppearance,
  type Song,
  type ValidationResult,
} from './types.ts';
import { normalizeReleaseDate } from './releaseTime.ts';
import { DECORATION_LIMITS, DECORATION_PRESETS, placementProblem } from '../game/world/decorations.ts';
import { clampEnvironment, ENVIRONMENT_KEYS } from '../game/world/environment.ts';
import type { Decoration, GardenEnvironment, Manifest } from './types.ts';

/**
 * Turns the raw manifest JSON into trusted content.
 *
 * A bad entry is skipped with a clear message instead of breaking the whole
 * garden: one typo in one song should never take the site down.
 *
 * Relative media paths ("media/song.mp3") are resolved against the manifest's
 * own URL, so the manifest can live next to its media on any storage host.
 */
export interface ValidateOptions {
  /** Absolute URL the manifest was fetched from. */
  manifestUrl: string;
  releaseTimeZone: string;
}

type Raw = Record<string, unknown>;

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function isObject(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function oneOf<T extends string>(allowed: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

export function validateManifest(input: unknown, options: ValidateOptions): ValidationResult {
  const issues: ContentIssue[] = [];
  const error = (path: string, message: string) => issues.push({ severity: 'error', path, message });
  const warn = (path: string, message: string) => issues.push({ severity: 'warning', path, message });

  if (!isObject(input)) {
    error('manifest', 'The manifest must be a JSON object.');
    return { manifest: { version: 1, collections: [], songs: [] }, issues };
  }
  if (input.version !== 1) {
    error('manifest.version', 'Expected "version": 1.');
  }

  const resolveMedia = (path: string, value: unknown, field: string): string | undefined => {
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || value.trim() === '') {
      warn(path, `"${field}" must be a file path or URL; it was ignored.`);
      return undefined;
    }
    try {
      return new URL(value, options.manifestUrl).href;
    } catch {
      warn(path, `"${field}" is not a valid path or URL; it was ignored.`);
      return undefined;
    }
  };

  // ---------- Collections ----------
  const collections: Collection[] = [];
  const collectionIds = new Set<string>();
  const rawCollections = Array.isArray(input.collections) ? input.collections : [];
  if (!Array.isArray(input.collections)) error('manifest.collections', 'Expected a list of collections.');

  rawCollections.forEach((raw, index) => {
    const label = isObject(raw) && typeof raw.id === 'string' ? ` "${raw.id}"` : '';
    const path = `collections[${index}]${label}`;
    if (!isObject(raw)) return error(path, 'Each collection must be an object.');

    const problems: string[] = [];
    if (typeof raw.id !== 'string' || !ID_PATTERN.test(raw.id)) {
      problems.push('"id" must be lowercase letters, numbers and dashes (e.g. "night-bloom-ep").');
    } else if (collectionIds.has(raw.id)) {
      problems.push(`"id" "${raw.id}" is used by another collection.`);
    }
    if (typeof raw.title !== 'string' || raw.title.trim() === '') problems.push('"title" is required.');
    if (!oneOf(COLLECTION_TYPES, raw.type)) problems.push(`"type" must be one of: ${COLLECTION_TYPES.join(', ')}.`);
    if (raw.area !== undefined && !oneOf(GARDEN_AREAS, raw.area)) {
      problems.push(`"area" must be one of: ${GARDEN_AREAS.join(', ')}.`);
    }
    if (problems.length) return error(path, `Skipped. ${problems.join(' ')}`);

    const collection: Collection = {
      id: raw.id as string,
      title: (raw.title as string).trim(),
      type: raw.type as Collection['type'],
      area: (raw.area as Collection['area'] | undefined) ?? 'main',
      autoBloom: raw.autoBloom === true,
      order: typeof raw.order === 'number' ? raw.order : index,
    };
    const cover = resolveMedia(path, raw.cover, 'cover');
    if (cover) collection.cover = cover;
    if (typeof raw.description === 'string') collection.description = raw.description;
    if (raw.plot !== undefined) {
      if (typeof raw.plot === 'string' && /^[a-z0-9-]{1,40}$/.test(raw.plot)) collection.plot = raw.plot;
      else warn(path, '"plot" must be a spot id like "plot-19--55"; it was ignored.');
    }

    collectionIds.add(collection.id);
    collections.push(collection);
  });

  // ---------- Songs ----------
  const songs: Song[] = [];
  const songIds = new Set<string>();
  const rawSongs = Array.isArray(input.songs) ? input.songs : [];
  if (!Array.isArray(input.songs)) error('manifest.songs', 'Expected a list of songs.');

  rawSongs.forEach((raw, index) => {
    const label = isObject(raw) && typeof raw.id === 'string' ? ` "${raw.id}"` : '';
    const path = `songs[${index}]${label}`;
    if (!isObject(raw)) return error(path, 'Each song must be an object.');

    const problems: string[] = [];
    if (typeof raw.id !== 'string' || !ID_PATTERN.test(raw.id)) {
      problems.push('"id" must be lowercase letters, numbers and dashes.');
    } else if (songIds.has(raw.id)) {
      problems.push(`"id" "${raw.id}" is used by another song.`);
    }
    if (typeof raw.title !== 'string' || raw.title.trim() === '') problems.push('"title" is required.');
    if (typeof raw.artist !== 'string' || raw.artist.trim() === '') problems.push('"artist" is required.');
    if (typeof raw.collectionId !== 'string' || !collectionIds.has(raw.collectionId)) {
      problems.push(`"collectionId" must match an existing collection (got ${JSON.stringify(raw.collectionId)}).`);
    }
    if (!oneOf(GENRES, raw.genre)) problems.push(`"genre" must be one of: ${GENRES.join(', ')}.`);
    if (!oneOf(RELEASE_STATUSES, raw.status)) {
      problems.push(`"status" must be one of: ${RELEASE_STATUSES.join(', ')}.`);
    }

    const audio = resolveMedia(path, raw.audio, 'audio');
    const preview = resolveMedia(path, raw.preview, 'preview');
    if (raw.status === 'released' && !audio) problems.push('Released songs need an "audio" file.');

    let releaseDate: string | undefined;
    if (raw.releaseDate !== undefined) {
      const normalized =
        typeof raw.releaseDate === 'string' ? normalizeReleaseDate(raw.releaseDate, options.releaseTimeZone) : null;
      if (normalized) releaseDate = normalized;
      else problems.push('"releaseDate" must look like "2026-12-04" or "2026-12-04T00:00:00-05:00".');
    }
    if (problems.length) return error(path, `Skipped. ${problems.join(' ')}`);

    const song: Song = {
      id: raw.id as string,
      title: (raw.title as string).trim(),
      artist: (raw.artist as string).trim(),
      collectionId: raw.collectionId as string,
      genre: raw.genre as Song['genre'],
      status: raw.status as Song['status'],
      order: typeof raw.order === 'number' ? raw.order : index,
    };
    if (audio) song.audio = audio;
    if (preview) song.preview = preview;
    if (releaseDate) song.releaseDate = releaseDate;
    const cover = resolveMedia(path, raw.cover, 'cover');
    if (cover) song.cover = cover;

    if (song.status === 'upcoming' && !releaseDate) {
      warn(path, 'Upcoming song has no "releaseDate"; it will show "Coming Soon" without a countdown.');
    }
    if (song.status === 'unreleased' && audio) {
      warn(path, 'Unreleased song has full "audio". Anything a browser can play can be downloaded; consider a "preview" snippet instead.');
    }

    if (raw.teaser !== undefined) {
      if (raw.teaser !== true && raw.teaser !== false) warn(path, '"teaser" must be true or false; it was ignored.');
      else if (raw.teaser && song.status !== 'upcoming') warn(path, '"teaser" only applies to upcoming songs; it was ignored.');
      else if (raw.teaser) song.teaser = true;
    }

    if (raw.description !== undefined) {
      if (typeof raw.description === 'string' && raw.description.trim()) song.description = raw.description.trim().slice(0, 600);
      else if (typeof raw.description !== 'string') warn(path, '"description" must be text; it was ignored.');
    }

    const flower = parseFlower(raw.flower, path, warn);
    if (flower) song.flower = flower;

    songIds.add(song.id);
    songs.push(song);
  });

  // Empty beds are allowed (a newly announced EP may have no songs yet) but worth flagging.
  for (const collection of collections) {
    if (!songs.some((s) => s.collectionId === collection.id)) {
      warn(`collections "${collection.id}"`, 'This collection has no songs yet; its bed will be empty.');
    }
  }

  collections.sort((a, b) => a.order - b.order);
  songs.sort((a, b) => a.order - b.order);
  const manifest: Manifest = { version: 1, collections, songs };
  if (input.garden !== undefined) {
    const garden = parseGarden(input.garden, warn);
    if (garden) manifest.garden = garden;
  }
  return { manifest, issues };
}

/**
 * Decorations and atmosphere. Anything out of place is skipped with a
 * warning (never an error): the garden itself always loads.
 */
function parseGarden(
  value: unknown,
  warn: (path: string, message: string) => void,
): { decorations: Decoration[]; environment: GardenEnvironment } | undefined {
  if (!isObject(value)) {
    warn('garden', '"garden" must be an object; it was ignored.');
    return undefined;
  }
  const decorations: Decoration[] = [];
  const raw = Array.isArray(value.decorations) ? value.decorations : [];
  raw.forEach((d, index) => {
    const path = `garden.decorations[${index}]`;
    if (decorations.length >= DECORATION_LIMITS.max) return warn(path, `Only ${DECORATION_LIMITS.max} decorations are shown; the rest were skipped.`);
    if (!isObject(d) || typeof d.id !== 'string' || !ID_PATTERN.test(d.id) || typeof d.preset !== 'string' || !(d.preset in DECORATION_PRESETS)) {
      return warn(path, 'Skipped: needs an "id" and a known "preset".');
    }
    const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
    if (typeof d.x !== 'number' || typeof d.z !== 'number' || !Number.isFinite(d.x) || !Number.isFinite(d.z)) {
      return warn(path, 'Skipped: needs "x" and "z" positions.');
    }
    const decoration: Decoration = {
      id: d.id,
      preset: d.preset as Decoration['preset'],
      x: d.x,
      z: d.z,
      rotation: ((num(d.rotation, 0) % 360) + 360) % 360,
      scale: Math.min(DECORATION_LIMITS.maxScale, Math.max(DECORATION_LIMITS.minScale, num(d.scale, 1))),
    };
    // A decoration in the way (on a path, say) is left out so visitors can always get around.
    const problem = placementProblem(decoration, decorations);
    if (problem) return warn(path, `Skipped "${d.id}": ${problem}`);
    decorations.push(decoration);
  });
  const env = isObject(value.environment) ? value.environment : {};
  for (const key of Object.keys(env)) {
    if (!(ENVIRONMENT_KEYS as string[]).includes(key)) warn('garden.environment', `Unknown setting "${key}" was ignored.`);
  }
  return { decorations, environment: clampEnvironment(env as Partial<GardenEnvironment>) };
}

function parseFlower(
  value: unknown,
  path: string,
  warn: (path: string, message: string) => void,
): FlowerAppearance | undefined {
  if (value === undefined) return undefined;
  if (!isObject(value)) {
    warn(path, '"flower" must be an object; it was ignored.');
    return undefined;
  }
  const flower: FlowerAppearance = {};
  if (value.species !== undefined) {
    if (oneOf(FLOWER_SPECIES, value.species)) flower.species = value.species;
    else warn(path, `"flower.species" must be one of: ${FLOWER_SPECIES.join(', ')}; it was ignored.`);
  }
  if (value.hue !== undefined) {
    if (typeof value.hue === 'number' && value.hue >= -180 && value.hue <= 180) flower.hue = value.hue;
    else warn(path, '"flower.hue" must be a number from -180 to 180; it was ignored.');
  }
  if (value.scale !== undefined) {
    if (typeof value.scale === 'number' && value.scale >= 0.5 && value.scale <= 2) flower.scale = value.scale;
    else warn(path, '"flower.scale" must be a number from 0.5 to 2; it was ignored.');
  }
  for (const key of ['color', 'core'] as const) {
    if (value[key] === undefined) continue;
    if (typeof value[key] === 'string' && HEX_COLOR.test(value[key])) flower[key] = value[key].toLowerCase();
    else warn(path, `"flower.${key}" must be a color like "#ff5fb0"; it was ignored.`);
  }
  if (value.label !== undefined) {
    if (typeof value.label === 'string' && value.label.trim()) flower.label = value.label.trim().slice(0, 24);
    else warn(path, '"flower.label" must be short text; it was ignored.');
  }
  return Object.keys(flower).length ? flower : undefined;
}
