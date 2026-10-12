import { describe, expect, it } from 'vitest';
import { buildBetCalendar, escapeText, foldLine } from './calendar';

const bet = {
  code: 'Ab3xK9mQ',
  terms: 'I run 5 km, every day',
  deadlineSeconds: Date.UTC(2026, 9, 1, 18, 0, 0) / 1000,
  url: 'https://sporim.fun/b/Ab3xK9mQ',
};
const now = Date.UTC(2026, 8, 23, 9, 0, 0) / 1000;

describe('escapeText', () => {
  it('escapes the four characters RFC 5545 reserves in TEXT', () => {
    expect(escapeText('a\\b;c,d\ne')).toBe('a\\\\b\\;c\\,d\\ne');
  });
});

describe('foldLine', () => {
  const octets = (line: string) => new TextEncoder().encode(line).length;

  it('leaves a short line alone', () => {
    expect(foldLine('SUMMARY:short')).toBe('SUMMARY:short');
  });

  it('keeps every physical line within 75 octets', () => {
    const folded = foldLine(`SUMMARY:${'x'.repeat(200)}`);
    for (const line of folded.split('\r\n')) expect(octets(line)).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, '')).toBe(`SUMMARY:${'x'.repeat(200)}`);
  });

  it('never splits a multi-byte character', () => {
    const line = `SUMMARY:${'run 🏃 '.repeat(20)}`;
    const folded = foldLine(line);
    for (const physical of folded.split('\r\n')) {
      expect(octets(physical)).toBeLessThanOrEqual(75);
      expect(physical).not.toContain('�');
    }
    expect(folded.replace(/\r\n /g, '')).toBe(line);
  });
});

describe('buildBetCalendar', () => {
  const ics = buildBetCalendar(bet, now);

  it('uses CRLF throughout and ends with one', () => {
    expect(ics.endsWith('\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  it('puts the event at the deadline, in UTC', () => {
    expect(ics).toContain('DTSTART:20261001T180000Z');
    expect(ics).toContain('DTEND:20261001T183000Z');
    expect(ics).toContain('DTSTAMP:20260923T090000Z');
  });

  it('has a stable uid per bet so a second import updates rather than duplicates', () => {
    expect(ics).toContain('UID:bet-Ab3xK9mQ@sporim.fun');
    expect(buildBetCalendar(bet, now + 999)).toContain('UID:bet-Ab3xK9mQ@sporim.fun');
  });

  it('links back to the bet and warns an hour ahead', () => {
    expect(ics).toContain('URL:https://sporim.fun/b/Ab3xK9mQ');
    expect(ics).toContain('TRIGGER:-PT1H');
  });

  it('escapes the terms, which a person wrote', () => {
    expect(ics).toContain('I run 5 km\\, every day');
  });
});
