# Phase 7E — Calendar Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user download their whole trip as a `.ics` file and import it into any calendar app.

**Architecture:** A pure serializer turns `Segment[]` into an RFC 5545 string. Two thin route handlers — one Clerk-authed per trip, one public for the demo — load segments and return it as a download. Dispatch across segment types uses a render-side registry keyed by `SegmentType`, mirroring `DaySection`'s existing `CARD_BY_SEGMENT_TYPE`.

**Tech Stack:** TypeScript strict, Vitest, Next.js App Router route handlers, Clerk, Drizzle, Tailwind.

**Spec:** `docs/superpowers/specs/2026-08-02-phase-7e-calendar-export-design.md`

## Global Constraints

- `strict: true`. **No `any`** — use `unknown` and narrow.
- Absolute imports via `@/`. Test files import the module under test relatively (`../`).
- Prefer `type` over `interface`.
- **No new dependencies.** The serializer is hand-written; that is the point.
- **Default to Server Components.** Nothing in this phase needs `"use client"` — a download is an `<a href>`, not an `onClick`.
- Conventional commits. `npm run typecheck` and `npm run lint` clean before every commit.
- Vitest is `environment: 'node'` — no jsdom, no DB harness. **Only pure functions get unit tests.** `ics-format.ts` and `to-ics.ts` are pure and fully testable; the two route handlers and the two buttons are verified by the human partner.
- **Times are always UTC.** No `VTIMEZONE` blocks. We store `timestamptz`, so UTC is exact and clients render in the viewer's local time.
- **Line endings are CRLF (`\r\n`)** throughout the generated file. RFC 5545 requires them and some clients reject LF-only input. This is easy to lose to an editor or a `.join('\n')` — assert it in tests.

## File Structure

**Create:**
- `lib/itinerary/ics-format.ts` — RFC 5545 text mechanics: escaping, folding, UTC stamps
- `lib/itinerary/__tests__/ics-format.test.ts`
- `lib/itinerary/to-ics.ts` — segment → event mapping, registry, VCALENDAR assembly, filename
- `lib/itinerary/__tests__/to-ics.test.ts`
- `lib/itinerary/ics-response.ts` — the shared `Response` both routes return
- `app/(app)/trips/[tripId]/calendar.ics/route.ts` — Clerk-authed, ownership-checked
- `app/demo/calendar.ics/route.ts` — public, reads `env.DEMO_TRIP_ID`

**Modify:**
- `app/(app)/trips/[tripId]/page.tsx` — export button in the header
- `app/demo/page.tsx` — export button in the nav

**Note on the file split.** The spec sketched a single `lib/itinerary/to-ics.ts`. This plan splits the low-level text mechanics into `ics-format.ts` because the two change for different reasons: escaping and folding are fixed properties of RFC 5545, while the event mapping changes every time a booking type is added. It also gives Task 1 a self-contained deliverable with the densest tests in the phase. Same public behaviour, same total code.

A directory literally named `calendar.ics` is a valid App Router path segment, so the URL ends in a real file extension — some calendar clients sniff it.

---

### Task 1: RFC 5545 text mechanics

**Files:**
- Create: `lib/itinerary/ics-format.ts`
- Test: `lib/itinerary/__tests__/ics-format.test.ts`

**Interfaces:**
- Produces: `escapeText(value: string): string`, `foldLine(line: string): string`, `formatUtc(date: Date): string`

These three functions are where a hand-written `.ics` goes subtly wrong. They are pure string work with no domain knowledge, so they get the densest tests in the phase.

- [ ] **Step 1: Write the failing tests**

Create `lib/itinerary/__tests__/ics-format.test.ts`:

```typescript
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
    expect(new TextEncoder().encode(lines[0]).length).toBeLessThanOrEqual(75);
    for (const line of lines.slice(1)) {
      expect(new TextEncoder().encode(` ${line}`.slice(1)).length + 1).toBeLessThanOrEqual(75);
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/itinerary/__tests__/ics-format.test.ts`
Expected: FAIL — `Cannot find module '../ics-format'`.

- [ ] **Step 3: Implement**

Create `lib/itinerary/ics-format.ts`:

```typescript
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
  // The first line gets the full budget; continuations lose one octet to the
  // leading space that marks them as continuations.
  let budget = MAX_OCTETS;

  for (const char of line) {
    const size = octetLength(char);
    if (currentOctets + size > budget) {
      out.push(current);
      current = '';
      currentOctets = 0;
      budget = MAX_OCTETS - 1;
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/itinerary/__tests__/ics-format.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 5: Typecheck, lint, and commit**

```bash
npm run typecheck && npm run lint
git add lib/itinerary/ics-format.ts lib/itinerary/__tests__/ics-format.test.ts
git commit -m "feat: add RFC 5545 text mechanics for calendar export

Escaping, line folding, and UTC stamps — the three places a hand-written .ics
goes subtly wrong. Folding counts octets rather than characters because a
Japanese hotel name is three octets per character, and iterates by code point so
a multi-byte character is never split across the fold. The colon is deliberately
not escaped; escaping it corrupts values in some parsers."
```

---

### Task 2: Segment-to-event mapping

**Files:**
- Create: `lib/itinerary/to-ics.ts`
- Test: `lib/itinerary/__tests__/to-ics.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1 yet — this task adds only the mapping half of the file.
- Produces: `type IcsEvent`, `segmentToEvents(segment: Segment): IcsEvent[]`

Each segment type becomes one or more calendar events. Assembly into a `.ics` string is Task 3; keeping them apart means the mapping can be asserted as plain objects rather than by grepping a serialized blob.

- [ ] **Step 1: Write the failing tests**

Create `lib/itinerary/__tests__/to-ics.test.ts`. Read `lib/itinerary/__tests__/helpers.ts` first — `makeSegment` takes a `Partial<Segment>` and fills the rest.

```typescript
import { describe, it, expect } from 'vitest';
import { segmentToEvents } from '../to-ics';
import { makeSegment } from './helpers';

const flight = () =>
  makeSegment({
    id: 'seg-flight',
    type: 'flight',
    startTime: new Date('2026-03-10T12:00:00Z'),
    endTime: new Date('2026-03-11T05:00:00Z'),
    startLocation: 'Toronto Pearson (YYZ)',
    endLocation: 'Tokyo Narita (NRT)',
    startLat: '43.677700',
    startLng: '-79.624800',
    updatedAt: new Date('2026-02-01T00:00:00Z'),
    details: {
      flight_number: 'NH6',
      airline: 'ANA',
      confirmation_code: 'ABC123',
      departure_airport_code: 'YYZ',
      arrival_airport_code: 'NRT',
      departure_terminal: '1',
      arrival_terminal: null,
      seat: '32A',
      cabin_class: 'Economy',
    },
  });

const hotel = () =>
  makeSegment({
    id: 'seg-hotel',
    type: 'hotel_stay',
    startTime: new Date('2026-03-11T06:00:00Z'),
    endTime: new Date('2026-03-14T02:00:00Z'),
    startLocation: '3-7-1-2 Nishi Shinjuku, Tokyo',
    updatedAt: new Date('2026-02-01T00:00:00Z'),
    details: {
      hotel_name: 'Park Hyatt Tokyo',
      address: '3-7-1-2 Nishi Shinjuku, Tokyo',
      confirmation_code: 'HYT99',
      room_type: 'Park King',
      guests: 2,
      check_in_time: '15:00',
      check_out_time: '11:00',
      phone: '+81 3 5322 1234',
    },
  });

const reservation = (endIsEstimated: boolean) =>
  makeSegment({
    id: 'seg-dinner',
    type: 'reservation',
    startTime: new Date('2026-03-11T10:00:00Z'),
    endTime: new Date('2026-03-11T11:30:00Z'),
    startLocation: '2-6-15 Minami Aoyama, Tokyo',
    updatedAt: new Date('2026-02-01T00:00:00Z'),
    details: {
      name: 'Narisawa',
      category: 'restaurant',
      confirmation_code: null,
      party_size: 2,
      address: '2-6-15 Minami Aoyama, Tokyo',
      phone: null,
      notes: null,
      end_is_estimated: endIsEstimated,
    },
  });

const train = () =>
  makeSegment({
    id: 'seg-train',
    type: 'train_ride',
    startTime: new Date('2026-03-13T00:00:00Z'),
    endTime: new Date('2026-03-13T02:15:00Z'),
    startLocation: 'Tokyo Station, Tokyo',
    endLocation: 'Kyoto Station, Kyoto',
    updatedAt: new Date('2026-02-01T00:00:00Z'),
    details: {
      train_number: '703',
      operator: 'JR Central',
      confirmation_code: 'JR77',
      departure_station: 'Tokyo',
      arrival_station: 'Kyoto',
      coach: '8',
      seat: '11A',
      travel_class: 'Green',
    },
  });

describe('segmentToEvents', () => {
  it('maps a flight to one event spanning departure to arrival', () => {
    const [event, ...rest] = segmentToEvents(flight());
    expect(rest).toHaveLength(0);
    expect(event.summary).toBe('ANA NH6 → NRT');
    expect(event.start).toEqual(new Date('2026-03-10T12:00:00Z'));
    expect(event.end).toEqual(new Date('2026-03-11T05:00:00Z'));
    expect(event.uid).toBe('seg-flight@wayfare.app');
  });

  it('puts the confirmation code and seat in a flight description', () => {
    const [event] = segmentToEvents(flight());
    expect(event.description).toContain('ABC123');
    expect(event.description).toContain('32A');
  });

  it('omits a null detail rather than printing it', () => {
    const [event] = segmentToEvents(flight());
    // arrival_terminal is null on this fixture.
    expect(event.description).not.toContain('Arrival terminal');
  });

  it('maps a train to one event', () => {
    const [event, ...rest] = segmentToEvents(train());
    expect(rest).toHaveLength(0);
    expect(event.summary).toBe('JR Central 703 → Kyoto');
    expect(event.uid).toBe('seg-train@wayfare.app');
  });

  it('maps a hotel to two point events with distinct UIDs', () => {
    const events = segmentToEvents(hotel());
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.uid)).toEqual([
      'seg-hotel-checkin@wayfare.app',
      'seg-hotel-checkout@wayfare.app',
    ]);
    expect(events.map((e) => e.summary)).toEqual([
      'Check in: Park Hyatt Tokyo',
      'Check out: Park Hyatt Tokyo',
    ]);
  });

  it('gives hotel point events a 30 minute duration, not zero length', () => {
    const [checkIn, checkOut] = segmentToEvents(hotel());
    expect(checkIn.start).toEqual(new Date('2026-03-11T06:00:00Z'));
    expect(checkIn.end).toEqual(new Date('2026-03-11T06:30:00Z'));
    expect(checkOut.start).toEqual(new Date('2026-03-14T02:00:00Z'));
    expect(checkOut.end).toEqual(new Date('2026-03-14T02:30:00Z'));
  });

  it('maps a reservation to one event named after the venue', () => {
    const [event, ...rest] = segmentToEvents(reservation(false));
    expect(rest).toHaveLength(0);
    expect(event.summary).toBe('Narisawa');
    expect(event.description).toContain('Party of 2');
  });

  it('notes an estimated end in the reservation description', () => {
    const [event] = segmentToEvents(reservation(true));
    expect(event.description).toContain('End time is estimated');
  });

  it('says nothing about estimation when the end was explicit', () => {
    const [event] = segmentToEvents(reservation(false));
    expect(event.description ?? '').not.toContain('estimated');
  });

  it('carries GEO when both coordinates are present', () => {
    const [event] = segmentToEvents(flight());
    expect(event.geo).toEqual({ lat: 43.6777, lng: -79.6248 });
  });

  it('omits GEO when coordinates are missing', () => {
    const [event] = segmentToEvents(train());
    expect(event.geo).toBeNull();
  });

  it('uses the segment updatedAt as the stamp so exports are reproducible', () => {
    const [event] = segmentToEvents(flight());
    expect(event.stamp).toEqual(new Date('2026-02-01T00:00:00Z'));
  });

  it('falls back to the location when details cannot be parsed', () => {
    // A partially useful event beats a missing one — same principle as LodgingFooter.
    const broken = makeSegment({
      id: 'seg-broken',
      type: 'flight',
      startLocation: 'Toronto Pearson (YYZ)',
      endLocation: 'Tokyo Narita (NRT)',
      details: { unexpected: 'shape' },
    });
    const [event] = segmentToEvents(broken);
    expect(event.summary).toBe('Flight to Tokyo Narita (NRT)');
    expect(event.description).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/itinerary/__tests__/to-ics.test.ts`
Expected: FAIL — `Cannot find module '../to-ics'`.

- [ ] **Step 3: Implement**

Create `lib/itinerary/to-ics.ts`:

```typescript
import type { Segment, SegmentType } from '@/lib/db/schema';
import { FlightDetailsSchema } from '@/lib/ai/schemas/flight';
import { HotelDetailsSchema } from '@/lib/ai/schemas/hotel';
import { TrainDetailsSchema } from '@/lib/ai/schemas/train';
import { ReservationDetailsSchema } from '@/lib/ai/schemas/reservation';

/**
 * One calendar event, before serialization. The mappers produce this shape and a
 * single serializer handles escaping and folding for all of them — escaping in
 * one place rather than four is what keeps it correct.
 */
export type IcsEvent = {
  uid: string;
  start: Date;
  end: Date;
  stamp: Date;
  summary: string;
  description: string | null;
  location: string | null;
  geo: { lat: number; lng: number } | null;
};

/**
 * Check-in and check-out are moments, not blocks, but a zero-length event
 * renders inconsistently across clients. Thirty minutes is unambiguous without
 * dominating the day view — which is why a multi-day block was rejected.
 */
const HOTEL_POINT_EVENT_MINUTES = 30;

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

/** Drizzle returns numeric columns as strings. */
function geoFrom(segment: Segment): IcsEvent['geo'] {
  if (segment.startLat == null || segment.startLng == null) return null;
  const lat = parseFloat(segment.startLat);
  const lng = parseFloat(segment.startLng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

/** Joins the lines worth printing, or null when there is nothing to say. */
function buildDescription(lines: (string | null)[]): string | null {
  const kept = lines.filter((line): line is string => line !== null && line.length > 0);
  return kept.length > 0 ? kept.join('\n') : null;
}

/** UID, stamp, location and coordinates are the same for every event a segment produces. */
function shared(segment: Segment, uidSuffix = ''): Pick<IcsEvent, 'uid' | 'stamp' | 'location' | 'geo'> {
  return {
    uid: `${segment.id}${uidSuffix}@wayfare.app`,
    stamp: segment.updatedAt,
    location: segment.startLocation,
    geo: geoFrom(segment),
  };
}

function flightEvents(segment: Segment): IcsEvent[] {
  const parsed = FlightDetailsSchema.safeParse(segment.details);
  const d = parsed.success ? parsed.data : null;

  return [
    {
      ...shared(segment),
      start: segment.startTime,
      end: segment.endTime,
      summary: d
        ? `${d.airline} ${d.flight_number} → ${d.arrival_airport_code}`
        : `Flight to ${segment.endLocation}`,
      description: d
        ? buildDescription([
            d.confirmation_code ? `Confirmation: ${d.confirmation_code}` : null,
            d.seat ? `Seat: ${d.seat}` : null,
            d.cabin_class ? `Cabin: ${d.cabin_class}` : null,
            d.departure_terminal ? `Departure terminal: ${d.departure_terminal}` : null,
            d.arrival_terminal ? `Arrival terminal: ${d.arrival_terminal}` : null,
          ])
        : null,
    },
  ];
}

function trainEvents(segment: Segment): IcsEvent[] {
  const parsed = TrainDetailsSchema.safeParse(segment.details);
  const d = parsed.success ? parsed.data : null;

  return [
    {
      ...shared(segment),
      start: segment.startTime,
      end: segment.endTime,
      summary: d
        ? `${d.operator} ${d.train_number} → ${d.arrival_station}`
        : `Train to ${segment.endLocation}`,
      description: d
        ? buildDescription([
            d.confirmation_code ? `Confirmation: ${d.confirmation_code}` : null,
            d.coach ? `Coach: ${d.coach}` : null,
            d.seat ? `Seat: ${d.seat}` : null,
            d.travel_class ? `Class: ${d.travel_class}` : null,
          ])
        : null,
    },
  ];
}

function hotelEvents(segment: Segment): IcsEvent[] {
  const parsed = HotelDetailsSchema.safeParse(segment.details);
  const d = parsed.success ? parsed.data : null;
  const name = d ? d.hotel_name : segment.startLocation;
  const description = d
    ? buildDescription([
        d.confirmation_code ? `Confirmation: ${d.confirmation_code}` : null,
        d.room_type ? `Room: ${d.room_type}` : null,
        d.phone ? `Phone: ${d.phone}` : null,
      ])
    : null;

  return [
    {
      ...shared(segment, '-checkin'),
      start: segment.startTime,
      end: addMinutes(segment.startTime, HOTEL_POINT_EVENT_MINUTES),
      summary: `Check in: ${name}`,
      description,
    },
    {
      ...shared(segment, '-checkout'),
      start: segment.endTime,
      end: addMinutes(segment.endTime, HOTEL_POINT_EVENT_MINUTES),
      summary: `Check out: ${name}`,
      description,
    },
  ];
}

function reservationEvents(segment: Segment): IcsEvent[] {
  const parsed = ReservationDetailsSchema.safeParse(segment.details);
  const d = parsed.success ? parsed.data : null;

  return [
    {
      ...shared(segment),
      start: segment.startTime,
      end: segment.endTime,
      summary: d ? d.name : segment.startLocation,
      description: d
        ? buildDescription([
            d.party_size !== null ? `Party of ${d.party_size}` : null,
            d.confirmation_code ? `Confirmation: ${d.confirmation_code}` : null,
            d.phone ? `Phone: ${d.phone}` : null,
            d.notes,
            // The card refuses to render a fabricated time range; the calendar
            // needs a duration, so it discloses the estimate instead of hiding it.
            d.end_is_estimated
              ? 'End time is estimated — the confirmation did not state one.'
              : null,
          ])
        : null,
    },
  ];
}

/**
 * Render-side dispatch, keyed by segment type. Mirrors DaySection's
 * CARD_BY_SEGMENT_TYPE rather than extending BookingTypeHandler, which is keyed
 * by booking type and takes raw extraction JSON. Being a Record over SegmentType
 * makes a new segment type a compile error here until it is mapped.
 */
const EVENT_BY_SEGMENT_TYPE: Record<SegmentType, (segment: Segment) => IcsEvent[]> = {
  flight: flightEvents,
  train_ride: trainEvents,
  hotel_stay: hotelEvents,
  reservation: reservationEvents,
};

export function segmentToEvents(segment: Segment): IcsEvent[] {
  return EVENT_BY_SEGMENT_TYPE[segment.type](segment);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/itinerary/__tests__/to-ics.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Typecheck, lint, and commit**

```bash
npm run typecheck && npm run lint
git add lib/itinerary/to-ics.ts lib/itinerary/__tests__/to-ics.test.ts
git commit -m "feat: map segments to calendar events

Dispatch is a render-side registry keyed by SegmentType, mirroring DaySection's
CARD_BY_SEGMENT_TYPE. Extending BookingTypeHandler was rejected: it is keyed by
booking type and its methods take raw extraction JSON crossing an Inngest step
boundary, while this takes a typed Segment row at render time — and hotel maps
one segment to two events, so it is not even 1:1.

Hotel check-in and check-out get a 30 minute duration rather than zero length,
which renders inconsistently across clients. Unparseable details fall back to the
segment location rather than dropping the event."
```

---

### Task 3: VCALENDAR assembly and filename

**Files:**
- Modify: `lib/itinerary/to-ics.ts`
- Test: `lib/itinerary/__tests__/to-ics.test.ts`

**Interfaces:**
- Consumes: `escapeText`, `foldLine`, `formatUtc` from Task 1; `IcsEvent`, `segmentToEvents` from Task 2
- Produces: `segmentsToIcs(calendarName: string, segments: Segment[]): string`, `icsFilename(tripTitle: string): string`

- [ ] **Step 1: Write the failing tests**

Append to `lib/itinerary/__tests__/to-ics.test.ts`. Extend the existing import:

```typescript
import { segmentToEvents, segmentsToIcs, icsFilename } from '../to-ics';
```

Then add these blocks at the end of the file. They reuse the `flight`, `hotel` and `train` fixtures Task 2 defined at module scope, above the first `describe`.

```typescript
describe('segmentsToIcs', () => {
  it('wraps events in a VCALENDAR with the required headers', () => {
    const ics = segmentsToIcs('Tokyo, March 2026', [flight()]);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('PRODID:-//Wayfare//Itinerary//EN');
    expect(ics).toContain('CALSCALE:GREGORIAN');
    expect(ics).toContain('END:VCALENDAR');
  });

  it('names the calendar after the trip', () => {
    const ics = segmentsToIcs('Tokyo, March 2026', [flight()]);
    // The comma in the title must be escaped.
    expect(ics).toContain('X-WR-CALNAME:Tokyo\\, March 2026');
  });

  it('uses CRLF line endings throughout', () => {
    const ics = segmentsToIcs('Tokyo', [flight()]);
    // Every LF must be preceded by a CR.
    expect(ics.split('\n').every((part) => part === '' || part.endsWith('\r'))).toBe(true);
  });

  it('emits UTC timestamps', () => {
    const ics = segmentsToIcs('Tokyo', [flight()]);
    expect(ics).toContain('DTSTART:20260310T120000Z');
    expect(ics).toContain('DTEND:20260311T050000Z');
    expect(ics).toContain('DTSTAMP:20260201T000000Z');
  });

  it('emits a hotel as two VEVENT blocks', () => {
    const ics = segmentsToIcs('Tokyo', [hotel()]);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });

  it('orders events chronologically regardless of input order', () => {
    // Callers flatten segments in booking-creation order, not itinerary order.
    const ics = segmentsToIcs('Tokyo', [train(), flight()]);
    expect(ics.indexOf('seg-flight')).toBeLessThan(ics.indexOf('seg-train'));
  });

  it('is stable across two calls on the same input', () => {
    expect(segmentsToIcs('Tokyo', [flight()])).toBe(segmentsToIcs('Tokyo', [flight()]));
  });

  it('emits GEO as a semicolon-separated pair', () => {
    const ics = segmentsToIcs('Tokyo', [flight()]);
    expect(ics).toContain('GEO:43.6777;-79.6248');
  });

  it('omits GEO and DESCRIPTION rather than emitting them empty, but keeps LOCATION', () => {
    const bare = makeSegment({
      id: 'seg-bare',
      type: 'train_ride',
      startLocation: 'Tokyo Station, Tokyo',
      endLocation: 'Kyoto Station, Kyoto',
      details: { unexpected: 'shape' },
    });
    const ics = segmentsToIcs('Tokyo', [bare]);
    expect(ics).not.toContain('GEO:');
    expect(ics).not.toContain('DESCRIPTION:');
    expect(ics).toContain('LOCATION:Tokyo Station\\, Tokyo');
  });

  it('produces a valid empty calendar for a trip with no segments', () => {
    const ics = segmentsToIcs('Tokyo', []);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).not.toContain('BEGIN:VEVENT');
  });

  it('folds a long summary rather than emitting an over-length line', () => {
    const longName = makeSegment({
      id: 'seg-long',
      type: 'reservation',
      startLocation: 'somewhere',
      updatedAt: new Date('2026-02-01T00:00:00Z'),
      details: {
        name: 'A'.repeat(120),
        category: 'restaurant',
        confirmation_code: null,
        party_size: null,
        address: 'somewhere',
        phone: null,
        notes: null,
        end_is_estimated: false,
      },
    });
    const ics = segmentsToIcs('Tokyo', [longName]);
    for (const line of ics.split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
  });
});

describe('icsFilename', () => {
  it('slugs the trip title', () => {
    expect(icsFilename('Tokyo, March 2026')).toBe('wayfare-tokyo-march-2026.ics');
  });

  it('collapses runs of punctuation into one hyphen', () => {
    expect(icsFilename('Paris  &  Rome!!')).toBe('wayfare-paris-rome.ics');
  });

  it('falls back to itinerary when the title slugs to nothing', () => {
    // A title written entirely in Japanese would otherwise produce "wayfare-.ics".
    expect(icsFilename('東京旅行')).toBe('wayfare-itinerary.ics');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/itinerary/__tests__/to-ics.test.ts`
Expected: FAIL — `segmentsToIcs is not a function`, `icsFilename is not a function`.

- [ ] **Step 3: Implement**

Add the import at the top of `lib/itinerary/to-ics.ts`, below the existing schema imports:

```typescript
import { escapeText, foldLine, formatUtc } from './ics-format';
```

Then append to the bottom of the file:

```typescript
function serializeEvent(event: IcsEvent): string[] {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${formatUtc(event.stamp)}`,
    `DTSTART:${formatUtc(event.start)}`,
    `DTEND:${formatUtc(event.end)}`,
    `SUMMARY:${escapeText(event.summary)}`,
  ];

  // Omitted rather than emitted empty — an empty DESCRIPTION shows as a blank
  // notes field in most clients.
  if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
  // GEO is a structured value: its semicolon is a separator, not text to escape.
  if (event.geo) lines.push(`GEO:${event.geo.lat};${event.geo.lng}`);

  lines.push('END:VEVENT');
  return lines.map(foldLine);
}

export function segmentsToIcs(calendarName: string, segments: Segment[]): string {
  // Callers flatten segments in booking-creation order (upload time), not
  // itinerary order. Sorting makes the file readable and the output stable.
  const events = segments
    .slice()
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
    .flatMap(segmentToEvents);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Wayfare//Itinerary//EN',
    'CALSCALE:GREGORIAN',
    foldLine(`X-WR-CALNAME:${escapeText(calendarName)}`),
    ...events.flatMap(serializeEvent),
    'END:VCALENDAR',
  ];

  return `${lines.join('\r\n')}\r\n`;
}

/**
 * "Tokyo, March 2026" -> "wayfare-tokyo-march-2026.ics". A title with no ASCII
 * alphanumerics — one written entirely in Japanese — slugs to an empty string,
 * so it falls back rather than producing "wayfare-.ics".
 */
export function icsFilename(tripTitle: string): string {
  const slug = tripTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `wayfare-${slug || 'itinerary'}.ics`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run`
Expected: PASS. The suite was 87 after Phase 7D; Task 1 adds 16, Task 2 adds 13, this task adds 14 → **130**. Reconcile any difference rather than adjusting the expectation.

- [ ] **Step 5: Typecheck, lint, and commit**

```bash
npm run typecheck && npm run lint
git add lib/itinerary/to-ics.ts lib/itinerary/__tests__/to-ics.test.ts
git commit -m "feat: assemble events into a VCALENDAR document

Events are sorted chronologically because callers flatten segments in
booking-creation order, and optional fields are omitted rather than emitted
empty. GEO's semicolon is a separator, not text, so it is deliberately not run
through escapeText. Output is byte-identical across calls on the same input,
which is what makes DTSTAMP-from-updatedAt worth having."
```

---

### Task 4: The two route handlers

**Files:**
- Create: `lib/itinerary/ics-response.ts`, `app/(app)/trips/[tripId]/calendar.ics/route.ts`, `app/demo/calendar.ics/route.ts`

**Interfaces:**
- Consumes: `segmentsToIcs`, `icsFilename` from Task 3
- Produces: `icsResponse(tripTitle: string, segments: Segment[]): Response`; the routes `GET /trips/[tripId]/calendar.ics` and `GET /demo/calendar.ics`

No unit tests: these are auth and IO, and `vitest.config.ts` is `environment: 'node'` with no DB harness. Verified by the human partner, like every other route in this codebase.

- [ ] **Step 1: Add the shared response helper**

Create `lib/itinerary/ics-response.ts`:

```typescript
import type { Segment } from '@/lib/db/schema';
import { segmentsToIcs, icsFilename } from './to-ics';

/** Shared by the authed and demo routes so the headers cannot drift apart. */
export function icsResponse(tripTitle: string, segments: Segment[]): Response {
  return new Response(segmentsToIcs(tripTitle, segments), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${icsFilename(tripTitle)}"`,
    },
  });
}
```

- [ ] **Step 2: Add the authenticated route**

Create `app/(app)/trips/[tripId]/calendar.ics/route.ts`. The directory name contains a dot on purpose — it makes the URL end in a real extension, which some calendar clients sniff.

```typescript
import { auth } from '@clerk/nextjs/server';
import { getUserByClerkId } from '@/lib/db/repositories/users';
import { getTripWithBookings } from '@/lib/db/repositories/trips';
import { icsResponse } from '@/lib/itinerary/ics-response';

// Without this, a handler that only reads the database can be statically
// generated at build time and would then serve a stale calendar after a booking
// is added — the export exists to be current.
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const { tripId } = await params;

  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return new Response('Not found', { status: 404 });

  const user = await getUserByClerkId(clerkUserId);
  if (!user) return new Response('Not found', { status: 404 });

  const trip = await getTripWithBookings(tripId);
  // 404 for a missing trip and for someone else's alike, so the response never
  // reveals which trip ids exist. Matches the pages' use of notFound() for both.
  if (!trip || trip.userId !== user.id) return new Response('Not found', { status: 404 });

  return icsResponse(trip.title, trip.bookings.flatMap((b) => b.segments));
}
```

- [ ] **Step 3: Add the demo route**

Create `app/demo/calendar.ics/route.ts`:

```typescript
import { getTripWithBookings } from '@/lib/db/repositories/trips';
import { env } from '@/lib/env.server';
import { icsResponse } from '@/lib/itinerary/ics-response';

// Public on purpose: this serves the one trip /demo already renders in full, so
// it exposes nothing that was not already public. No token, no share surface.
export const dynamic = 'force-dynamic';

export async function GET() {
  const trip = await getTripWithBookings(env.DEMO_TRIP_ID);
  if (!trip) return new Response('Not found', { status: 404 });

  return icsResponse(trip.title, trip.bookings.flatMap((b) => b.segments));
}
```

- [ ] **Step 4: Verify**

```bash
npm run typecheck && npm run lint && npx vitest run && npm run build
```

`npm run build` matters here specifically: it is what catches a malformed route handler signature, and the route segment name contains a dot. Do not start a dev server — runtime verification is the human partner's step.

- [ ] **Step 5: Commit**

```bash
git add lib/itinerary/ics-response.ts "app/(app)/trips/[tripId]/calendar.ics/route.ts" app/demo/calendar.ics/route.ts
git commit -m "feat: serve trip and demo itineraries as .ics downloads

Both routes are force-dynamic: a handler that only reads the database can
otherwise be statically generated at build time and would serve a stale calendar
after a booking is added.

The authed route returns 404 for a missing trip and for another user's trip
alike, so the response does not reveal which trip ids exist. The demo route is
public because it serves the one trip /demo already renders in full."
```

---

### Task 5: The download buttons

**Files:**
- Modify: `app/(app)/trips/[tripId]/page.tsx`, `app/demo/page.tsx`

**Interfaces:**
- Consumes: the routes from Task 4.

A download is an `<a href>`, not an `onClick` — no client component, nothing new shipped to the browser. Both pages are Server Components and stay that way.

- [ ] **Step 1: Add the button to the trip header**

In `app/(app)/trips/[tripId]/page.tsx`, add the import beside the existing ones:

```typescript
import { buttonVariants } from '@/components/ui/button';
```

Then in the header's action row, before `<AddBookingDialog … />`:

```tsx
        <div className="flex items-center gap-2">
          {segments.length > 0 && (
            <a
              href={`/trips/${tripId}/calendar.ics`}
              className={buttonVariants({ variant: 'outline' })}
            >
              Export calendar
            </a>
          )}
          <AddBookingDialog tripId={tripId} />
          <DeleteTripButton tripId={tripId} />
        </div>
```

`variant: 'outline'` with the default size matches `AddBookingDialog` beside it. The guard matters: a button that downloads an empty calendar is worse than no button.

- [ ] **Step 2: Add the button to the demo nav**

In `app/demo/page.tsx`, `buttonVariants` is already imported. Replace the nav's single link with a pair:

```tsx
          <div className="flex items-center gap-2">
            {segments.length > 0 && (
              <a
                href="/demo/calendar.ics"
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                Export calendar
              </a>
            )}
            <Link href="/sign-up" className={buttonVariants({ size: 'sm' })}>
              Sign up free
            </Link>
          </div>
```

`size: 'sm'` matches the existing "Sign up free" link. `segments` is already computed at the top of the component body, so no new query is needed.

- [ ] **Step 3: Verify**

```bash
npm run typecheck && npm run lint && npx vitest run && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/trips/[tripId]/page.tsx" app/demo/page.tsx
git commit -m "feat: add export calendar buttons to the trip and demo pages

A plain anchor, not a client component — a download needs no onClick, so nothing
new ships to the browser and both pages stay Server Components. Hidden when the
trip has no segments, since a button that downloads an empty calendar is worse
than no button."
```

---

## Final verification

- [ ] `npm run typecheck` — clean
- [ ] `npm run lint` — clean
- [ ] `npx vitest run` — 130 passing (87 + 43); reconcile any difference rather than adjusting the expectation
- [ ] `npm run build` — clean
- [ ] Manual (human partner), against the seeded demo trip:
  - `/demo` shows "Export calendar"; clicking it downloads `wayfare-<slug>.ics` rather than opening it as text
  - The trip page shows the button, and a trip with no parsed bookings does not
  - Another user's trip id at `/trips/<id>/calendar.ics` returns 404, not a calendar
  - Import the file into Google Calendar **and** Apple Calendar: the flight, the train, both hotel point events, and the reservations all land at the right local times
  - The estimated dinner shows the "End time is estimated" note in its details
  - Importing the same file twice updates the events rather than duplicating them
