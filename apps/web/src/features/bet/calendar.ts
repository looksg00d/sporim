/**
 * "Add to calendar" — one `.ics` event at the bet's deadline.
 *
 * Nothing in the product reaches a person at the moment that matters: there are no pushes,
 * no email, no bot. A calendar event is the cheapest thing that does, and it needs no
 * infrastructure — the person's own calendar app does the reminding.
 *
 * Hand-written rather than a library: the format is small, and the three things that break
 * it (CRLF line endings, escaping, folding at 75 octets) are each under a test.
 */

export interface CalendarBet {
  readonly code: string;
  readonly terms: string;
  readonly deadlineSeconds: number;
  readonly url: string;
}

/** An hour's notice before the deadline — enough to still do the thing. */
const ALARM_BEFORE = '-PT1H';
const MAX_OCTETS = 75;

/** RFC 5545 §3.3.11: backslash, semicolon, comma and newlines are escaped in TEXT. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * RFC 5545 §3.1: lines longer than 75 octets are folded with CRLF + space. Octets, not
 * characters — terms written in Cyrillic are two bytes a letter, and a fold that splits one
 * produces mojibake in the calendar.
 */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = '';
  let octets = 0;
  // Continuation lines start with a space, which counts toward their 75.
  let limit = MAX_OCTETS;

  for (const char of line) {
    const size = encoder.encode(char).length;
    if (octets + size > limit) {
      parts.push(current);
      current = '';
      octets = 0;
      limit = MAX_OCTETS - 1;
    }
    current += char;
    octets += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

function utcStamp(seconds: number): string {
  return new Date(seconds * 1000)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

export function buildBetCalendar(bet: CalendarBet, nowSeconds: number): string {
  const summary = `Sporim: say how it went — ${bet.terms}`;
  const description = `Deadline for your bet. Open it to say how it went:\n${bet.url}`;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sporim//Bet deadline//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    // Stable per bet, so importing twice updates the event instead of duplicating it.
    `UID:bet-${bet.code}@sporim.fun`,
    `DTSTAMP:${utcStamp(nowSeconds)}`,
    `DTSTART:${utcStamp(bet.deadlineSeconds)}`,
    `DTEND:${utcStamp(bet.deadlineSeconds + 30 * 60)}`,
    `SUMMARY:${escapeText(summary)}`,
    `DESCRIPTION:${escapeText(description)}`,
    `URL:${bet.url}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText('Your bet deadline is in an hour')}`,
    `TRIGGER:${ALARM_BEFORE}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return lines.map(foldLine).join('\r\n') + '\r\n';
}
