import { MAX_DEADLINE_LEAD_SECONDS, MIN_DEADLINE_LEAD_SECONDS } from '@sporim/domain';

/**
 * Deadlines are the one place this product touches wall-clock time, and wall-clock time is
 * where money disputes start. Two rules hold everywhere below:
 *
 * 1. Storage and comparison are always unix **seconds** — never a Date, never a string.
 * 2. Anything a person reads or types is **local** wall time, converted through the
 *    browser's own calendar so DST shifts and month ends are the platform's problem,
 *    not ours.
 */

export const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_DAY = 86_400;
const END_OF_DAY_HOUR = 23;
const END_OF_DAY_MINUTE = 59;

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function toSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

/** Local end-of-day, `dayOffset` days from the local day containing `fromSeconds`. */
export function endOfLocalDay(fromSeconds: number, dayOffset = 0): number {
  const date = new Date(fromSeconds * 1000);
  return toSeconds(
    new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate() + dayOffset,
      END_OF_DAY_HOUR,
      END_OF_DAY_MINUTE,
      0,
      0,
    ),
  );
}

/** Days until the next given weekday (0 = Sunday). 7 when today already is that weekday. */
function daysUntilWeekday(fromSeconds: number, weekday: number): number {
  const today = new Date(fromSeconds * 1000).getDay();
  const delta = (weekday - today + 7) % 7;
  return delta === 0 ? 7 : delta;
}

export interface DeadlinePreset {
  readonly id: string;
  readonly label: string;
  readonly atSeconds: number;
}

/**
 * The chips on S3. Anything already past, too soon (under 15 minutes) or beyond a year is
 * dropped rather than shown disabled — a chip you cannot press is a chip that lies.
 */
export function deadlinePresets(from: number): DeadlinePreset[] {
  const candidates: readonly DeadlinePreset[] = [
    { id: 'tonight', label: 'Tonight', atSeconds: endOfLocalDay(from, 0) },
    { id: 'tomorrow', label: 'Tomorrow', atSeconds: endOfLocalDay(from, 1) },
    { id: 'sunday', label: 'Sunday', atSeconds: endOfLocalDay(from, daysUntilWeekday(from, 0)) },
    { id: 'week', label: 'In a week', atSeconds: endOfLocalDay(from, 7) },
  ];

  const earliest = from + MIN_DEADLINE_LEAD_SECONDS;
  const latest = from + MAX_DEADLINE_LEAD_SECONDS;
  const seen = new Set<number>();

  return candidates.filter((preset) => {
    if (preset.atSeconds < earliest || preset.atSeconds > latest) return false;
    if (seen.has(preset.atSeconds)) return false;
    seen.add(preset.atSeconds);
    return true;
  });
}

/** `datetime-local` speaks local wall time with no zone; both directions go through it. */
export function toDatetimeLocalValue(seconds: number): string {
  const date = new Date(seconds * 1000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

export function fromDatetimeLocalValue(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  // Constructed from parts, not parsed from a string: this is local time by definition,
  // so a DST jump lands on the platform's calendar rather than on an offset we invented.
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getMonth() !== month - 1 || date.getDate() !== day) return null; // 31 Feb
  return toSeconds(date);
}

/** "Sun 23:59" — short enough for a receipt row, unambiguous inside a week. */
export function formatDeadlineShort(seconds: number, locale = 'en-GB'): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(seconds * 1000));
}

/** "Sun 8 Sep, 23:59" — the full version for the contract sentence and the review screen. */
export function formatDeadlineLong(seconds: number, locale = 'en-GB'): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(seconds * 1000));
}

/** The zone is stated on screen because both parties must read the same instant. */
export function timeZoneLabel(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'local time';
  }
}

/** "in 3 days" / "in 4 hours" / "in 20 minutes" — never a bare number of seconds. */
export function formatLead(fromSeconds: number, toSecondsValue: number): string {
  const delta = toSecondsValue - fromSeconds;
  if (delta <= 0) return 'now';
  if (delta < SECONDS_PER_MINUTE) return 'in under a minute';
  if (delta < 60 * SECONDS_PER_MINUTE) {
    const minutes = Math.round(delta / SECONDS_PER_MINUTE);
    return `in ${minutes} minute${minutes === 1 ? '' : 's'}`;
  }
  if (delta < SECONDS_PER_DAY) {
    const hours = Math.round(delta / 3_600);
    return `in ${hours} hour${hours === 1 ? '' : 's'}`;
  }
  const days = Math.round(delta / SECONDS_PER_DAY);
  return `in ${days} day${days === 1 ? '' : 's'}`;
}
