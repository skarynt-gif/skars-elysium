/**
 * Release dates in the manifest can be written two ways:
 *   "2026-12-04T00:00:00-05:00"  exact moment with an explicit offset
 *   "2026-12-04"                 midnight in the configured release time zone
 *
 * Both are converted to an absolute UTC timestamp so every visitor, in any
 * country, sees a flower bloom at the same moment.
 */

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/** Rejects dates like 2026-02-30 or 2026-13-45, which Date would silently roll over. */
function isRealCalendarDate(datePart: string): boolean {
  const match = DATE_ONLY.exec(datePart);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Offset (ms) of `timeZone` from UTC at the given instant. */
function zoneOffsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - instant;
}

/** Converts a wall-clock time in `timeZone` to a UTC timestamp, handling DST. */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): number {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  // Two passes settle the offset correctly across daylight-saving changes.
  let guess = naive - zoneOffsetMs(naive, timeZone);
  guess = naive - zoneOffsetMs(guess, timeZone);
  return guess;
}

/**
 * Returns the release moment as an ISO UTC string, or null when the value
 * isn't a recognised format (a validation error is reported by the caller).
 */
export function normalizeReleaseDate(value: string, timeZone: string): string | null {
  if (!isRealCalendarDate(value.slice(0, 10))) return null;
  const dateOnly = DATE_ONLY.exec(value);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    const ms = zonedTimeToUtc(Number(y), Number(m), Number(d), 0, 0, timeZone);
    return Number.isNaN(ms) ? null : new Date(ms).toISOString();
  }
  if (WITH_OFFSET.test(value)) {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : new Date(ms).toISOString();
  }
  return null;
}
