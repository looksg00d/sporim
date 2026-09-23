import { cookies } from 'next/headers';
import { TIME_ZONE_COOKIE } from '@/features/time/zone-cookie';
import { isValidTimeZone, type DeadlineFormatOptions } from '@/lib/time';

export interface ViewerTimeZone {
  readonly timeZone: string;
  /** False when the zone is a fallback — the formatter then names it on screen. */
  readonly known: boolean;
}

const FALLBACK: ViewerTimeZone = { timeZone: 'UTC', known: false };

/**
 * The zone to render deadlines in, from the cookie `TimeZoneCookie` writes.
 *
 * The cookie is input like any other: a value the runtime does not recognise as an IANA
 * zone is treated as absent rather than handed to `Intl`, which would throw mid-render.
 */
export async function viewerTimeZone(): Promise<ViewerTimeZone> {
  const store = await cookies();
  const raw = store.get(TIME_ZONE_COOKIE)?.value;
  if (!raw || raw.length > 64 || !isValidTimeZone(raw)) return FALLBACK;
  return { timeZone: raw, known: true };
}

export type DeadlineDisplay = Required<
  Pick<DeadlineFormatOptions, 'nowSeconds' | 'timeZone' | 'showZone'>
>;

/** The options `formatDeadlineShort` takes, for a server page. */
export function deadlineOptions(zone: ViewerTimeZone, nowSeconds: number): DeadlineDisplay {
  return { nowSeconds, timeZone: zone.timeZone, showZone: !zone.known };
}
