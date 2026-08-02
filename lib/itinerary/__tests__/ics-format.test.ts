import { describe, it, expect } from 'vitest';
import { escapeText, foldLine, formatUtc } from '../ics-format';

describe('escapeText', () => {
  it('escapes backslashes', () => {
    expect(escapeText('a\\b')).toBe('a\\\\b');
  });

  it('escapes semicolons and commas', () => {
    expect(escapeText('Table for 2; window, please')).toBe(
      'Table for 2\\; window\\, please',
    );
  });

  it('escapes newlines as literal backslash-n', () => {
    expect(escapeText('line one\nline two')).toBe('line one\\nline two');
  });

  it('normalizes CRLF to a single escaped newline', () => {
    expect(escapeText('line one\r\nline two')).toBe('line one\\nline two');
  });

  it('does not escape colons', () => {
    // Escaping the colon corrupts the value in some parsers.
    expect(escapeText('Phone: +81 3 1234')).toBe('Phone: +81 3 1234');
  });

  it('escapes the backslash before it is used as an escape character', () => {
    // If comma-escaping ran first, its inserted backslash would be re-escaped.
    expect(escapeText('a,b\\c')).toBe('a\\,b\\\\c');
  });

  it('leaves an ordinary string untouched', () => {
    expect(escapeText('Park Hyatt Tokyo')).toBe('Park Hyatt Tokyo');
  });
});

describe('foldLine', () => {
  it('leaves a line of 75 octets or fewer unfolded', () => {
    const line = 'A'.repeat(75);
    expect(foldLine(line)).toBe(line);
  });

  it('folds a longer line with CRLF and a leading space', () => {
    const line = 'A'.repeat(80);
    expect(foldLine(line)).toBe(`${'A'.repeat(75)}\r\n ${'A'.repeat(5)}`);
  });

  it('counts octets, not characters', () => {
    // Each of these is 3 octets in UTF-8, so 30 characters is 90 octets and
    // must fold — a character count would wrongly leave it on one line.
    const line = 'パ'.repeat(30);
    expect(foldLine(line)).toContain('\r\n ');
  });

  it('never splits a multi-byte character across a fold', () => {
    const folded = foldLine('パ'.repeat(30));
    for (const segment of folded.split('\r\n ')) {
      expect(segment).not.toContain('�');
      expect(new TextEncoder().encode(segment).length).toBeLessThanOrEqual(75);
    }
  });

  it('keeps every continuation line within 75 octets including its leading space', () => {
    const folded = foldLine('A'.repeat(300));
    const lines = folded.split('\r\n');
    // Every entry after the first already begins with its continuation space,
    // so each is measured exactly as it will appear in the file.
    for (const line of lines) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it('preserves the full content across the fold', () => {
    const line = 'A'.repeat(200);
    expect(foldLine(line).split('\r\n ').join('')).toBe(line);
  });
});

describe('formatUtc', () => {
  it('formats an instant in RFC 5545 UTC form', () => {
    expect(formatUtc(new Date('2026-03-11T10:00:00Z'))).toBe('20260311T100000Z');
  });

  it('converts a non-UTC instant to UTC rather than preserving local time', () => {
    expect(formatUtc(new Date('2026-03-11T19:00:00+09:00'))).toBe('20260311T100000Z');
  });

  it('drops milliseconds', () => {
    expect(formatUtc(new Date('2026-03-11T10:00:00.123Z'))).toBe('20260311T100000Z');
  });
});
