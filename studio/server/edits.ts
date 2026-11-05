/**
 * Turning what the Studio page sends into safe database values.
 *
 * Every field the Studio can change is listed here with its rules. Anything
 * not listed is ignored; anything invalid is refused with a plain-language
 * message naming the field. Cross-field problems (a released song without a
 * full track, say) are allowed in the draft and reported by the game's own
 * content checks, so you can save half-finished work; publishing refuses
 * drafts with problems.
 */
import { COLLECTION_TYPES, FLOWER_SPECIES, GARDEN_AREAS, GENRES, RELEASE_STATUSES } from '../../src/content/types.ts';
import { normalizeReleaseDate, zonedTimeToUtc } from '../../src/content/releaseTime.ts';
import { RELEASE_TIME_ZONE } from '../../src/config/release.ts';

export class EditError extends Error {
  readonly field: string;
  constructor(field: string, message: string) {
    super(message);
    this.field = field;
  }
}

export type Parser = (value: unknown, field: string) => string | number | null;

const text =
  (max: number, required: boolean): Parser =>
  (value, field) => {
    if (value === null || value === undefined || value === '') {
      if (required) throw new EditError(field, `${label(field)} can’t be empty.`);
      return null;
    }
    if (typeof value !== 'string') throw new EditError(field, `${label(field)} must be text.`);
    const trimmed = value.replace(/\s+/g, ' ').trim();
    if (!trimmed && required) throw new EditError(field, `${label(field)} can’t be empty.`);
    if (trimmed.length > max) throw new EditError(field, `${label(field)} can be up to ${max} characters.`);
    return trimmed || null;
  };

/** Like text, but keeps line breaks (descriptions). */
export const longText =
  (max: number): Parser =>
  (value, field) => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value !== 'string') throw new EditError(field, `${label(field)} must be text.`);
    const cleaned = value.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    if (cleaned.length > max) throw new EditError(field, `${label(field)} can be up to ${max} characters.`);
    return cleaned || null;
  };

const oneOf =
  (allowed: readonly string[]): Parser =>
  (value, field) => {
    if (typeof value === 'string' && allowed.includes(value)) return value;
    throw new EditError(field, `${label(field)} must be one of: ${allowed.join(', ')}.`);
  };

const flag: Parser = (value, field) => {
  if (typeof value === 'boolean') return value ? 1 : 0;
  throw new EditError(field, `${label(field)} must be on or off.`);
};

export const numberIn =
  (min: number, max: number, nullable = true): Parser =>
  (value, field) => {
    if ((value === null || value === undefined || value === '') && nullable) return null;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      throw new EditError(field, `${label(field)} must be a number from ${min} to ${max}.`);
    }
    return value;
  };

/** "#ff5fb0" or nothing (back to the species' own colors). */
const hexColor: Parser = (value, field) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  throw new EditError(field, `${label(field)} must be a color like #ff5fb0.`);
};

const optional =
  (parser: Parser): Parser =>
  (value, field) =>
    value === null || value === undefined || value === '' ? null : parser(value, field);

/** A file from the media library, a full web address, or nothing. Checked against the library by the caller. */
const mediaRef: Parser = (value, field) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || value.length > 500) throw new EditError(field, `${label(field)} must be a file.`);
  if (/^https:\/\/[^\s]+$/.test(value) || /^media\/[^\s]+$/.test(value)) return value;
  throw new EditError(field, `${label(field)} must be an uploaded file or an https:// address.`);
};

/**
 * Release moments arrive as "2026-12-04" (midnight) or "2026-12-04T21:30"
 * (a time) in the release time zone, or as a full ISO timestamp. Stored as UTC.
 */
export const releaseMoment: Parser = (value, field) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new EditError(field, 'Release date must be a date.');
  const local = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (local) {
    const [, y, m, d, hh, mm] = local.map(Number) as [number, number, number, number, number, number];
    const asDate = normalizeReleaseDate(value.slice(0, 10), RELEASE_TIME_ZONE);
    if (asDate && hh < 24 && mm < 60) return new Date(zonedTimeToUtc(y, m, d, hh, mm, RELEASE_TIME_ZONE)).toISOString();
  } else {
    const normalized = normalizeReleaseDate(value, RELEASE_TIME_ZONE);
    if (normalized) return normalized;
  }
  throw new EditError(field, 'Release date isn’t a real date.');
};

const LABELS: Record<string, string> = {
  title: 'Title',
  artist: 'Artist',
  collectionId: 'Bed',
  genre: 'Genre',
  status: 'Release state',
  audio: 'Full song',
  preview: 'Preview snippet',
  cover: 'Cover art',
  releaseDate: 'Release date',
  teaser: 'Teaser',
  description: 'Description',
  type: 'Bed type',
  area: 'Garden area',
  autoBloom: 'Auto-bloom',
  plot: 'Spot',
  flowerSpecies: 'Flower type',
  flowerHue: 'Color shift',
  flowerScale: 'Size',
  flowerColor: 'Petal color',
  flowerCore: 'Heart color',
  flowerLabel: 'Label',
};

function label(field: string): string {
  return LABELS[field] ?? field;
}

export interface FieldSpec {
  column: string;
  parse: Parser;
}

export const SONG_FIELDS: Record<string, FieldSpec> = {
  title: { column: 'title', parse: text(120, true) },
  artist: { column: 'artist', parse: text(120, true) },
  collectionId: { column: 'collection_id', parse: text(80, true) },
  genre: { column: 'genre', parse: oneOf(GENRES) },
  status: { column: 'status', parse: oneOf(RELEASE_STATUSES) },
  audio: { column: 'audio', parse: mediaRef },
  preview: { column: 'preview', parse: mediaRef },
  cover: { column: 'cover', parse: mediaRef },
  releaseDate: { column: 'release_date', parse: releaseMoment },
  teaser: { column: 'teaser', parse: flag },
  description: { column: 'description', parse: longText(600) },
  flowerSpecies: { column: 'flower_species', parse: optional(oneOf(FLOWER_SPECIES)) },
  flowerHue: { column: 'flower_hue', parse: numberIn(-180, 180) },
  flowerScale: { column: 'flower_scale', parse: numberIn(0.5, 2) },
  flowerColor: { column: 'flower_color', parse: hexColor },
  flowerCore: { column: 'flower_core', parse: hexColor },
  flowerLabel: { column: 'flower_label', parse: text(24, false) },
};

export const COLLECTION_FIELDS: Record<string, FieldSpec> = {
  title: { column: 'title', parse: text(80, true) },
  type: { column: 'type', parse: oneOf(COLLECTION_TYPES) },
  area: { column: 'area', parse: oneOf(GARDEN_AREAS) },
  cover: { column: 'cover', parse: mediaRef },
  description: { column: 'description', parse: longText(600) },
  autoBloom: { column: 'auto_bloom', parse: flag },
};

/** Columns that hold media references (checked against the library). */
export const MEDIA_COLUMNS = new Set(['audio', 'preview', 'cover']);

/** Parses the fields present in `body` (unknown fields are ignored). */
export function parseFields(specs: Record<string, FieldSpec>, body: Record<string, unknown>): Record<string, string | number | null> {
  const columns: Record<string, string | number | null> = {};
  for (const [field, spec] of Object.entries(specs)) {
    if (field in body) columns[spec.column] = spec.parse(body[field], field);
  }
  return columns;
}

/** Unique, readable id from a title: "Slow Burn" → "slow-burn", then "slow-burn-2"… */
export function uniqueId(title: string, taken: ReadonlySet<string>, fallback: string): string {
  const base =
    title
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
      .replace(/-+$/, '') || fallback;
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}
