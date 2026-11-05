/**
 * The content model: Garden → Collections (beds) → Songs (flowers).
 *
 * This is the shape of public/content/manifest.json. The game never contains
 * song data in its code: everything the visitor sees is built from this file
 * at load time, so releases are added by editing the manifest and uploading
 * media — no rebuild.
 */

export const GENRES = ['rnb', 'psychedelic', 'melodic-rap', 'rage', 'other'] as const;
export type Genre = (typeof GENRES)[number];

/** released = live; upcoming = has a planned release; unreleased = vaulted, no date. */
export const RELEASE_STATUSES = ['released', 'upcoming', 'unreleased'] as const;
export type ReleaseStatus = (typeof RELEASE_STATUSES)[number];

export const COLLECTION_TYPES = ['album', 'ep', 'single', 'genre', 'vault'] as const;
export type CollectionType = (typeof COLLECTION_TYPES)[number];

/** Which part of the world a bed is planted in. */
export const GARDEN_AREAS = ['main', 'ep-garden', 'hidden'] as const;
export type GardenArea = (typeof GARDEN_AREAS)[number];

export const FLOWER_SPECIES = ['rose', 'spiral', 'iris', 'thistle', 'asphodel', 'lily'] as const;
export type FlowerSpecies = (typeof FLOWER_SPECIES)[number];

/** Optional manual overrides. Anything left out is derived from genre/status. */
export interface FlowerAppearance {
  species?: FlowerSpecies;
  /** Hue shift in degrees applied on top of the species palette (-180..180). */
  hue?: number;
  /** Size multiplier (0.5..2). */
  scale?: number;
  /** Exact petal color ("#ff5fb0"); replaces the species palette and hue shift. */
  color?: string;
  /** Exact color of the flower's heart (center). */
  core?: string;
  /** Short tag shown with the title when visitors walk up, e.g. "NEW" or "FEAT. NOVA". */
  label?: string;
}

export interface Collection {
  id: string;
  title: string;
  type: CollectionType;
  area: GardenArea;
  cover?: string;
  description?: string;
  /**
   * When true, upcoming songs in this bed bloom automatically once their
   * releaseDate passes, without a manifest edit.
   */
  autoBloom: boolean;
  order: number;
  /**
   * Optional fixed spot for the bed (a plot id from game/world/layout.ts,
   * e.g. "plot-19--55"). Beds without one fill the remaining spots in order.
   */
  plot?: string;
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  collectionId: string;
  genre: Genre;
  status: ReleaseStatus;
  /** Full track. Required for released songs. */
  audio?: string;
  /** Short snippet for upcoming/unreleased songs. */
  preview?: string;
  cover?: string;
  /** Release moment as an absolute ISO timestamp (normalized during validation). */
  releaseDate?: string;
  order: number;
  flower?: FlowerAppearance;
  /**
   * Upcoming songs only: show a small sprout labeled "???" instead of a bud,
   * hiding the title until you're ready to reveal it.
   */
  teaser?: boolean;
  /** A few lines about the song, shown in the player and on its card. */
  description?: string;
}

export const DECORATION_PRESETS_LIST = [
  'statue',
  'column',
  'broken-column',
  'lantern',
  'bench',
  'urn',
  'archway',
  'cypress',
  'olive-tree',
  'hedge',
] as const;
export type DecorationPreset = (typeof DECORATION_PRESETS_LIST)[number];

/** A preset decoration placed in the garden (meters from the fountain; north is −z). */
export interface Decoration {
  id: string;
  preset: DecorationPreset;
  x: number;
  z: number;
  /** Degrees, clockwise seen from above. */
  rotation: number;
  /** Size multiplier (0.6..1.5). */
  scale: number;
}

/** Atmosphere settings; see game/world/environment.ts for ranges. */
export interface GardenEnvironment {
  skyWarmth: number;
  fog: number;
  particles: number;
  butterflies: number;
  clouds: number;
}

export interface Manifest {
  version: 1;
  collections: Collection[];
  songs: Song[];
  /** Decorations and atmosphere (set in the Creator Studio). Absent = the original garden. */
  garden?: {
    decorations: Decoration[];
    environment: GardenEnvironment;
  };
}

export type IssueSeverity = 'error' | 'warning';

export interface ContentIssue {
  severity: IssueSeverity;
  /** Where the problem is, e.g. `songs[3] "midnight-drive"`. */
  path: string;
  message: string;
}

export interface ValidationResult {
  manifest: Manifest;
  issues: ContentIssue[];
}
