import { describe, expect, it } from 'vitest';
import { MAX_DEADLINE_LEAD_SECONDS, MIN_DEADLINE_LEAD_SECONDS } from '@sporim/domain';
import {
  deadlinePresets,
  endOfLocalDay,
  formatDeadlineLong,
  formatDeadlineShort,
  formatLead,
  fromDatetimeLocalValue,
  isValidTimeZone,
  toDatetimeLocalValue,
} from './time';

/** A fixed instant: Tue 2 Sep 2026, 12:00 local. */
const TUESDAY_NOON = Math.floor(new Date(2026, 8, 2, 12, 0, 0, 0).getTime() / 1000);

describe('endOfLocalDay', () => {
  it('lands on 23:59 of the same local day', () => {
    const end = new Date(endOfLocalDay(TUESDAY_NOON) * 1000);
    expect([end.getHours(), end.getMinutes()]).toEqual([23, 59]);
    expect(end.getDate()).toBe(new Date(TUESDAY_NOON * 1000).getDate());
  });

  it('walks whole local days, not fixed 86400-second blocks', () => {
    const next = new Date(endOfLocalDay(TUESDAY_NOON, 1) * 1000);
    expect([next.getHours(), next.getMinutes()]).toEqual([23, 59]);
  });

  it('crosses a month boundary', () => {
    const lastOfMonth = Math.floor(new Date(2026, 8, 30, 12, 0, 0, 0).getTime() / 1000);
    const next = new Date(endOfLocalDay(lastOfMonth, 1) * 1000);
    expect(next.getMonth()).toBe(9);
    expect(next.getDate()).toBe(1);
  });
});

describe('deadlinePresets', () => {
  it('offers tonight, tomorrow, sunday and a week from a Tuesday midday', () => {
    expect(deadlinePresets(TUESDAY_NOON).map((p) => p.id)).toEqual([
      'tonight',
      'tomorrow',
      'sunday',
      'week',
    ]);
  });

  it('drops tonight once 23:59 is under the minimum lead away', () => {
    const lateEvening = Math.floor(new Date(2026, 8, 2, 23, 50, 0, 0).getTime() / 1000);
    expect(deadlinePresets(lateEvening).map((p) => p.id)).not.toContain('tonight');
  });

  it('never returns two chips for the same instant', () => {
    // On a Saturday, "sunday" and "tomorrow" are the same day.
    const saturday = Math.floor(new Date(2026, 8, 5, 12, 0, 0, 0).getTime() / 1000);
    const at = deadlinePresets(saturday).map((p) => p.atSeconds);
    expect(new Set(at).size).toBe(at.length);
  });

  /*
   * Which chips exist depends on the day, and three of the four can vanish: "Tonight" goes
   * late in the evening, "Sunday" collides with "Tomorrow" on a Saturday, and "In a week"
   * collides with "Sunday" on a Sunday. Only "Tomorrow" is unconditional.
   *
   * That is what the e2e suite now clicks, after spending a Saturday failing on a hard-coded
   * "Sunday" — and after this very test caught the first attempted fix, which would have moved
   * the same failure to Sundays. It runs over a whole week for that reason.
   */
  it.each([0, 1, 2, 3, 4, 5, 6])('always offers "Tomorrow" — weekday %i', (weekday) => {
    // 2026-09-06 is a Sunday, so adding the index walks every day of the week.
    const noon = Math.floor(new Date(2026, 8, 6 + weekday, 12, 0, 0, 0).getTime() / 1000);
    const ids = deadlinePresets(noon).map((preset) => preset.id);
    expect(ids).toContain('tomorrow');
  });

  it('returns chips in ascending order', () => {
    const at = deadlinePresets(TUESDAY_NOON).map((p) => p.atSeconds);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('only offers deadlines the domain would accept', () => {
    for (const preset of deadlinePresets(TUESDAY_NOON)) {
      expect(preset.atSeconds).toBeGreaterThanOrEqual(TUESDAY_NOON + MIN_DEADLINE_LEAD_SECONDS);
      expect(preset.atSeconds).toBeLessThanOrEqual(TUESDAY_NOON + MAX_DEADLINE_LEAD_SECONDS);
    }
  });

  it('is never empty — the custom picker is a choice, not a fallback', () => {
    expect(deadlinePresets(TUESDAY_NOON).length).toBeGreaterThan(0);
  });
});

describe('datetime-local round trip', () => {
  it('returns the same instant it was given', () => {
    const at = endOfLocalDay(TUESDAY_NOON, 3);
    expect(fromDatetimeLocalValue(toDatetimeLocalValue(at))).toBe(at);
  });

  it('formats without a timezone suffix, as the input element requires', () => {
    expect(toDatetimeLocalValue(TUESDAY_NOON)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it('pads single-digit months and hours', () => {
    const january = Math.floor(new Date(2027, 0, 5, 9, 7, 0, 0).getTime() / 1000);
    expect(toDatetimeLocalValue(january)).toBe('2027-01-05T09:07');
  });

  it('rejects an empty or malformed value', () => {
    expect(fromDatetimeLocalValue('')).toBeNull();
    expect(fromDatetimeLocalValue('tomorrow')).toBeNull();
    expect(fromDatetimeLocalValue('2026-09-02')).toBeNull();
  });

  it('rejects a date that does not exist', () => {
    expect(fromDatetimeLocalValue('2026-02-31T12:00')).toBeNull();
  });
});

describe('formatting', () => {
  it('names the weekday and the time, in 24h, inside the coming week', () => {
    const opts = { nowSeconds: TUESDAY_NOON };
    expect(formatDeadlineShort(endOfLocalDay(TUESDAY_NOON), opts)).toMatch(/^\w{3},? 23:59$/);
    expect(formatDeadlineShort(endOfLocalDay(TUESDAY_NOON, 5), opts)).toMatch(
      /^[A-Z][a-z]{2},? 23:59$/,
    );
  });

  it('switches to the date a week out, where a weekday would name the wrong one', () => {
    const opts = { nowSeconds: TUESDAY_NOON };
    expect(formatDeadlineShort(endOfLocalDay(TUESDAY_NOON, 6), opts)).toMatch(/^8 Sept?,? 23:59$/);
    expect(formatDeadlineShort(endOfLocalDay(TUESDAY_NOON, 30), opts)).toMatch(/^2 Oct,? 23:59$/);
  });

  it('uses the date for a deadline already past, which has no "this" weekday', () => {
    expect(formatDeadlineShort(TUESDAY_NOON - 60, { nowSeconds: TUESDAY_NOON })).toMatch(/2 Sep/);
  });

  it('formats in the zone it is given, not the runtime’s', () => {
    const utcNoon = Date.UTC(2026, 8, 2, 12, 0) / 1000;
    const opts = { nowSeconds: utcNoon - 3600 };
    expect(formatDeadlineShort(utcNoon, { ...opts, timeZone: 'UTC' })).toMatch(/12:00$/);
    expect(formatDeadlineShort(utcNoon, { ...opts, timeZone: 'Europe/Moscow' })).toMatch(/15:00$/);
  });

  it('names the zone when asked, for a server that had to guess', () => {
    const utcNoon = Date.UTC(2026, 8, 2, 12, 0) / 1000;
    const line = formatDeadlineShort(utcNoon, {
      nowSeconds: utcNoon - 3600,
      timeZone: 'UTC',
      showZone: true,
    });
    expect(line).toMatch(/UTC/);
  });

  it('adds the date for anything further out', () => {
    expect(formatDeadlineLong(endOfLocalDay(TUESDAY_NOON, 6))).toMatch(/8 Sep/);
  });

  it('describes the lead in the largest unit that still reads naturally', () => {
    expect(formatLead(0, 30)).toBe('in under a minute');
    expect(formatLead(0, 60)).toBe('in 1 minute');
    expect(formatLead(0, 20 * 60)).toBe('in 20 minutes');
    expect(formatLead(0, 4 * 3600)).toBe('in 4 hours');
    expect(formatLead(0, 3 * 86_400)).toBe('in 3 days');
  });

  it('never counts backwards', () => {
    expect(formatLead(100, 50)).toBe('now');
  });
});

describe('isValidTimeZone', () => {
  it('accepts an IANA zone and refuses anything else', () => {
    expect(isValidTimeZone('Europe/Moscow')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('"; drop table')).toBe(false);
  });
});
