/**
 * The viewer's time zone, carried to the server in a cookie.
 *
 * Deadlines are rendered on the server, whose zone is nobody's: on Vercel it is UTC, so a
 * person in Moscow read "18:00" for what was 21:00 on their clock, with nothing on screen to
 * say so. The browser knows the zone; this is how the server learns it.
 *
 * Shared by the client writer and the server reader so the name cannot drift.
 */
export const TIME_ZONE_COOKIE = 'tz';

/** A year: the zone changes when a person travels, and the writer refreshes it on every visit. */
export const TIME_ZONE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
