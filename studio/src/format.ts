/** Plain-language labels for the Studio. Pure functions, unit-tested. */
import { RELEASE_TIME_ZONE } from '../../src/config/release.ts';
import type { ContentIssue } from '../../src/content/types.ts';
import type { CollectionRow, SongRow } from '../server/mapping.ts';

const BED_TYPES: Record<string, string> = {
  album: 'Album',
  ep: 'EP',
  single: 'Singles',
  genre: 'Genre bed',
  vault: 'Vault',
};

const AREAS: Record<string, string> = {
  main: 'Main garden',
  'ep-garden': 'EP Garden',
  hidden: 'Hidden',
};

export const bedTypeLabel = (type: string) => BED_TYPES[type] ?? type;
export const areaLabel = (area: string) => AREAS[area] ?? area;

/** "Dec 4, 2026, 12:00 AM" in the release time zone, so it matches what fans see. */
export function formatMoment(iso: string, timeZone = RELEASE_TIME_ZONE, withTime = true): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  }).format(date);
}

/** "just now", "5 minutes ago", "3 days ago"; older than two weeks shows the date. */
export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = (now - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(seconds)) return iso;
  const ago = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;
  if (seconds < 45) return 'just now';
  if (seconds < 3600) return ago(Math.max(1, Math.round(seconds / 60)), 'minute');
  if (seconds < 86400) return ago(Math.max(1, Math.round(seconds / 3600)), 'hour');
  if (seconds < 14 * 86400) return ago(Math.max(1, Math.round(seconds / 86400)), 'day');
  return formatMoment(iso);
}

export type Tone = 'live' | 'soon' | 'secret' | 'vault';

/** The badge shown next to a song. */
export function songBadge(song: Pick<SongRow, 'status' | 'teaser' | 'release_date'>, now = Date.now()): { label: string; tone: Tone } {
  if (song.status === 'released') return { label: 'Released', tone: 'live' };
  if (song.status === 'upcoming') {
    const when = song.release_date ? new Date(song.release_date).getTime() : NaN;
    const date = Number.isFinite(when) ? ` · ${formatMoment(song.release_date!, RELEASE_TIME_ZONE, false)}` : '';
    if (Number.isFinite(when) && when <= now) return { label: `Blooming${date}`, tone: 'live' };
    return { label: `${song.teaser ? 'Teaser' : 'Upcoming'}${date}`, tone: song.teaser ? 'secret' : 'soon' };
  }
  return { label: 'Unreleased', tone: 'vault' };
}

/** Groups songs under their beds, in garden order. Orphans can't exist (foreign key). */
export function groupByBed(collections: CollectionRow[], songs: SongRow[]): { bed: CollectionRow; songs: SongRow[] }[] {
  return collections.map((bed) => ({ bed, songs: songs.filter((s) => s.collection_id === bed.id) }));
}

/** `songs[3] "slow-burn"` → `Song "slow-burn"`: friendlier locations for problems. */
export function issueWhere(issue: ContentIssue): string {
  const match = /^(songs|collections)(?:\[\d+\])?\s*"([^"]+)"/.exec(issue.path);
  if (!match) return 'Garden';
  return `${match[1] === 'songs' ? 'Song' : 'Bed'} “${match[2]}”`;
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** An ISO moment as date and time inputs ("2026-12-04", "00:00") in the release time zone. */
export function toLocalInputs(iso: string | null, timeZone = RELEASE_TIME_ZONE): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { date: '', time: '' };
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

/** Short name of the release time zone for labels, e.g. "EST" / "EDT". */
export function zoneAbbreviation(iso: string | null, timeZone = RELEASE_TIME_ZONE): string {
  const date = iso ? new Date(iso) : new Date();
  const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' })
    .formatToParts(Number.isNaN(date.getTime()) ? new Date() : date)
    .find((p) => p.type === 'timeZoneName');
  return part?.value ?? timeZone;
}

export const GENRE_LABELS: Record<string, string> = {
  rnb: 'R&B',
  psychedelic: 'Psychedelic',
  'melodic-rap': 'Melodic rap',
  rage: 'Rage',
  other: 'Other',
};

/** The four release choices offered for a song. */
export type ReleaseChoice = 'released' | 'upcoming' | 'teaser' | 'unreleased';

export function releaseChoice(song: Pick<SongRow, 'status' | 'teaser'>): ReleaseChoice {
  if (song.status === 'upcoming') return song.teaser ? 'teaser' : 'upcoming';
  return song.status as ReleaseChoice;
}

export function releaseChoiceFields(choice: ReleaseChoice): { status: string; teaser: boolean } {
  return choice === 'teaser' ? { status: 'upcoming', teaser: true } : { status: choice, teaser: false };
}

/**
 * Plain-language heads-ups for a song that the content checks don't cover
 * (they are about privacy and timing, not validity).
 */
export function songAdvice(song: SongRow, autoBloom: boolean, now = Date.now()): string[] {
  const advice: string[] = [];
  if ((song.status === 'upcoming' || song.status === 'unreleased') && song.audio) {
    advice.push(
      'A full track is attached before release. Anyone who digs into the site can download it, so use a short preview snippet unless it’s about to drop.',
    );
  }
  if (song.status === 'upcoming') {
    const when = song.release_date ? Date.parse(song.release_date) : NaN;
    if (!song.release_date) advice.push('No release date yet: fans see “Coming soon” without a countdown.');
    else if (autoBloom && !song.audio) advice.push('Auto-bloom is on, but there’s no full track to play once it blooms. Add the full song before the date.');
    else if (!autoBloom && when <= now) advice.push('The release date has passed but auto-bloom is off for this bed, so the bud stays closed until you mark it Released.');
  }
  if (song.status === 'released' && !song.audio) advice.push('Released songs need the full song file.');
  return advice;
}
