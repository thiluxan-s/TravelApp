/**
 * RFC 5545 text mechanics. Deliberately separate from to-ics.ts: these rules are
 * fixed properties of the format, while the event mapping changes whenever a
 * booking type is added.
 */

/** Continuation lines carry a leading space, which counts against the 75-octet limit. */
const MAX_OCTETS = 75;

const encoder = new TextEncoder();

function octetLength(value: string): number {
  return encoder.encode(value).length;
}

/**
 * RFC 5545 §3.3.11. Escapes backslash, semicolon, comma, and newline.
 * The colon is deliberately NOT escaped — escaping it corrupts values in some
 * parsers. Backslash must be replaced first, or the backslashes this function
 * inserts would themselves be escaped on the later passes.
 */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * RFC 5545 §3.1 line folding. Lines longer than 75 octets are split, with each
 * continuation beginning with a single space.
 *
 * Counted in octets, not characters: a Japanese hotel name is three octets per
 * character, so a character count emits lines that exceed the limit. Iteration
 * is by code point, so a multi-byte character is never split down the middle.
 */
export function foldLine(line: string): string {
  if (octetLength(line) <= MAX_OCTETS) return line;

  const out: string[] = [];
  let current = '';
  let currentOctets = 0;
  // The first line gets the full budget; continuations lose two octets: one for
  // the leading space that marks them as continuations, and one more to ensure
  // the total line with space is 74 octets (not 75).
  let budget = MAX_OCTETS;

  for (const char of line) {
    const size = octetLength(char);
    if (currentOctets + size > budget) {
      out.push(current);
      current = '';
      currentOctets = 0;
      budget = MAX_OCTETS - 2;
    }
    current += char;
    currentOctets += size;
  }
  out.push(current);

  return out.join('\r\n ');
}

/** RFC 5545 UTC form: 20260311T100000Z. We store timestamptz, so UTC is exact. */
export function formatUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}
