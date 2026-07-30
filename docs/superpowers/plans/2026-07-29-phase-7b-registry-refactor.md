# Phase 7B — Per-Type Handler Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `parse-booking.ts` type-agnostic by moving everything type-specific into a per-type handler registry, so Phase 7C can add `train` and `reservation` as new files rather than new branches.

**Architecture:** `lib/inngest/functions/parse-booking.ts` currently branches on booking type in three separate places — the extract step picks schema/prompt/tool name, the geocode step picks which fields to geocode, and the write step has two near-identical `createSegment` calls. With four booking types that becomes a four-way branch in three places. This plan introduces `lib/ai/booking-types/`, one file per type, each exporting a `BookingTypeHandler`. The job then looks up one handler and runs the same four steps for every type.

**This is a pure refactor. Flight and hotel behavior must not change.**

**Tech Stack:** TypeScript strict, Zod v4, Anthropic SDK, Inngest v4, Drizzle, Vitest.

## Global Constraints

- `strict: true`. **No `any`** — use `unknown` and narrow. This matters more than usual here: the registry is heterogeneous and `any` is the tempting shortcut.
- Absolute imports via `@/`. Never `../../../lib/...`. Test files import the module under test relatively (`../`), matching `lib/itinerary/__tests__/`.
- Prefer `type` over `interface`.
- Zod schemas are the source of truth — derive types with `z.infer`, never maintain parallel declarations.
- Zod schemas are `SomethingSchema`; utilities are `kebab-case.ts` exporting `camelCase`.
- Conventional commits (`feat:`, `fix:`, `chore:`, `refactor:`).
- `npm run typecheck` and `npm run lint` must be clean before every commit.
- **No new dependencies.**
- **Behavior-preserving.** Any observable change to how a flight or hotel parses is a bug, not an improvement. If you believe current behavior is wrong, report it — do not fix it here.

## Critical constraint: Inngest step serialization

`step.run` return values cross step boundaries and **must be JSON-serializable**. Inngest memoizes completed steps and may rehydrate their results from JSON on a retry.

Consequences that shape the interface, and which you must not "simplify" away:

- Handler methods take `unknown` and re-validate internally with their own Zod schema. They must not take a pre-narrowed generic type, because the caller has only rehydrated JSON.
- Handlers must not return closures, class instances, `Date` objects, or anything else that doesn't survive `JSON.parse(JSON.stringify(x))` from a step.
- Re-parsing the extraction in more than one step is intentional and cheap. Do not "optimize" it into a single parse shared across steps.

## Existing behavior this refactor must preserve

Read `lib/inngest/functions/parse-booking.ts` before starting. The behaviors that must survive:

- Classification uses `claude-haiku-4-5-20251001` with `max_tokens: 10`; extraction uses `claude-sonnet-4-6` with `max_tokens: 1024` and `tool_choice: { type: 'tool', name: <toolName> }`.
- An `unknown` classification marks the booking `parsing_failed` with "We couldn't identify this document as a flight or hotel booking." and returns `{ status: 'unknown_document' }`.
- A missing tool-use block marks it failed with "The AI did not return extraction results." and returns `{ status: 'extraction_failed' }`.
- A Zod validation failure marks it failed with "The AI extracted data in an unexpected format." and returns `{ status: 'extraction_failed' }`.
- Raw tool input is stored to `bookings.rawAiOutput` **before** the segment is written.
- `segmentExistsForBooking` guards the write step; when a segment already exists the job still sets `status: 'parsed'` and returns `{ segmentId: null }`.
- PDFs are sent as `{ type: 'document', source: { type: 'url' } }`, everything else as `{ type: 'image', ... }`.
- **Hotels geocode their address once** and reuse the result for both endpoints. Flights geocode two distinct labels in parallel.
- The outer catch marks the booking `parsing_failed` and rethrows.

## File Structure

**Create:**
- `lib/ai/booking-types/types.ts` — the `BookingTypeHandler` type and its supporting types. No logic.
- `lib/ai/booking-types/flight.ts` — flight handler, composing the existing prompt and schema modules.
- `lib/ai/booking-types/hotel.ts` — hotel handler.
- `lib/ai/booking-types/index.ts` — the registry map, `getBookingTypeHandler`, and the generated classifier prompt.
- `lib/ai/booking-types/__tests__/handlers.test.ts` — handler behavior.
- `lib/ai/booking-types/__tests__/registry.test.ts` — registry completeness and the generated prompt.

**Modify:**
- `lib/inngest/functions/parse-booking.ts` — consume the registry; delete the three type branches.
- `lib/ai/prompts/classifier.ts` — generate the system prompt from the registry.
- `CLAUDE.md` — update the prompt-convention section to describe the registry.

**Unchanged, deliberately:** `lib/ai/prompts/{flight,hotel}.ts` and `lib/ai/schemas/{flight,hotel}.ts` stay exactly where they are. The registry composes them. The details schemas are imported by `lib/itinerary/compute-annotations.ts` and `components/trips/BookingCard.tsx` for *rendering*, well outside the parsing pipeline — moving them would ripple into unrelated code for no benefit.

---

### Task 1: Handler type and the flight handler

**Files:**
- Create: `lib/ai/booking-types/types.ts`
- Create: `lib/ai/booking-types/flight.ts`
- Test: `lib/ai/booking-types/__tests__/handlers.test.ts`

**Interfaces:**
- Consumes: `FlightExtractionSchema`, `FlightDetailsSchema` from `@/lib/ai/schemas/flight`; `flightSystemPrompt`, `flightUserPrompt` from `@/lib/ai/prompts/flight`; `BookingType`, `SegmentType`, `NewSegment` from `@/lib/db/schema`.
- Produces:
  - `type HandledBookingType = Exclude<BookingType, 'unknown'>`
  - `type Coords = { startLat: string | null; startLng: string | null; endLat: string | null; endLng: string | null }`
  - `type GeocodeTargets = { start: string; end: string }`
  - `type SegmentFields = Omit<NewSegment, 'bookingId' | 'tripId'>`
  - `type BookingTypeHandler` (shape below)
  - `flightHandler: BookingTypeHandler`

- [ ] **Step 1: Write the failing tests**

Create `lib/ai/booking-types/__tests__/handlers.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { flightHandler } from '../flight';

const validFlight = {
  flight_number: 'AC001',
  airline: 'Air Canada',
  confirmation_code: 'ABC123',
  departure_airport_code: 'YYZ',
  arrival_airport_code: 'NRT',
  departure_terminal: '1',
  arrival_terminal: '2',
  seat: '14A',
  cabin_class: 'Economy',
  departure_iso: '2026-03-10T13:30:00-04:00',
  departure_timezone: 'America/Toronto',
  arrival_iso: '2026-03-11T16:20:00+09:00',
  arrival_timezone: 'Asia/Tokyo',
  departure_airport_label: 'Toronto Pearson (YYZ)',
  arrival_airport_label: 'Tokyo Narita (NRT)',
};

const coords = {
  startLat: '43.677700',
  startLng: '-79.624800',
  endLat: '35.771900',
  endLng: '140.392900',
};

describe('flightHandler', () => {
  it('declares its booking type, segment type, and tool name', () => {
    expect(flightHandler.bookingType).toBe('flight');
    expect(flightHandler.segmentType).toBe('flight');
    expect(flightHandler.toolName).toBe('record_flight_booking');
  });

  it('geocodes the departure and arrival airport labels', () => {
    expect(flightHandler.geocodeTargets(validFlight)).toEqual({
      start: 'Toronto Pearson (YYZ)',
      end: 'Tokyo Narita (NRT)',
    });
  });

  it('returns null geocode targets for data that does not match the schema', () => {
    expect(flightHandler.geocodeTargets({ nonsense: true })).toBeNull();
  });

  it('maps extraction and coordinates onto segment fields', () => {
    const fields = flightHandler.toSegmentFields(validFlight, coords);
    expect(fields).not.toBeNull();
    expect(fields!.type).toBe('flight');
    expect(fields!.startTime).toEqual(new Date('2026-03-10T13:30:00-04:00'));
    expect(fields!.endTime).toEqual(new Date('2026-03-11T16:20:00+09:00'));
    expect(fields!.startTimezone).toBe('America/Toronto');
    expect(fields!.endTimezone).toBe('Asia/Tokyo');
    expect(fields!.startLocation).toBe('Toronto Pearson (YYZ)');
    expect(fields!.endLocation).toBe('Tokyo Narita (NRT)');
    expect(fields!.startLat).toBe('43.677700');
    expect(fields!.endLng).toBe('140.392900');
  });

  it('strips extraction-only fields out of the stored details', () => {
    const fields = flightHandler.toSegmentFields(validFlight, coords);
    expect(fields!.details).toEqual({
      flight_number: 'AC001',
      airline: 'Air Canada',
      confirmation_code: 'ABC123',
      departure_airport_code: 'YYZ',
      arrival_airport_code: 'NRT',
      departure_terminal: '1',
      arrival_terminal: '2',
      seat: '14A',
      cabin_class: 'Economy',
    });
  });

  it('returns null segment fields for data that does not match the schema', () => {
    expect(flightHandler.toSegmentFields({ nonsense: true }, coords)).toBeNull();
  });

  it('validates raw tool input', () => {
    expect(flightHandler.isValidExtraction(validFlight)).toBe(true);
    expect(flightHandler.isValidExtraction({ nonsense: true })).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/ai/booking-types/__tests__/handlers.test.ts`
Expected: FAIL — cannot resolve `../flight`.

- [ ] **Step 3: Write the handler type**

Create `lib/ai/booking-types/types.ts`:

```typescript
import type Anthropic from '@anthropic-ai/sdk';
import type { BookingType, SegmentType, NewSegment } from '@/lib/db/schema';

/** Booking types that have a parsing handler. 'unknown' is a classification outcome, not a type we parse. */
export type HandledBookingType = Exclude<BookingType, 'unknown'>;

/** Geocoded coordinates as Drizzle numeric strings, or null when geocoding found nothing. */
export type Coords = {
  startLat: string | null;
  startLng: string | null;
  endLat: string | null;
  endLng: string | null;
};

/** Free-text locations to geocode. When start === end the caller geocodes once and reuses. */
export type GeocodeTargets = { start: string; end: string };

/** Everything needed to create a segment except its foreign keys. */
export type SegmentFields = Omit<NewSegment, 'bookingId' | 'tripId'>;

/**
 * Everything the parse job needs to know about one booking type.
 *
 * Methods take `unknown` rather than a narrowed type on purpose: their input has
 * crossed an Inngest step boundary and arrives as rehydrated JSON. Each handler
 * re-validates with its own Zod schema and narrows internally. They return null
 * rather than throwing so the job can mark the booking failed and stop cleanly.
 */
export type BookingTypeHandler = {
  bookingType: HandledBookingType;
  segmentType: SegmentType;
  /** Anthropic tool name, e.g. 'record_flight_booking'. Must be unique across handlers. */
  toolName: string;
  toolDescription: string;
  /** Phrase describing this document type, used to build the classifier prompt. */
  classifierDescription: string;
  systemPrompt: string;
  userPrompt: (fileName: string) => string;
  /** JSON Schema for the Anthropic tool's input_schema. */
  inputJsonSchema: () => Anthropic.Tool['input_schema'];
  isValidExtraction: (raw: unknown) => boolean;
  geocodeTargets: (raw: unknown) => GeocodeTargets | null;
  toSegmentFields: (raw: unknown, coords: Coords) => SegmentFields | null;
};
```

- [ ] **Step 4: Write the flight handler**

Create `lib/ai/booking-types/flight.ts`:

```typescript
import type Anthropic from '@anthropic-ai/sdk';
import { FlightExtractionSchema, FlightDetailsSchema } from '@/lib/ai/schemas/flight';
import { flightSystemPrompt, flightUserPrompt } from '@/lib/ai/prompts/flight';
import type { BookingTypeHandler, Coords, GeocodeTargets, SegmentFields } from './types';

export const flightHandler: BookingTypeHandler = {
  bookingType: 'flight',
  segmentType: 'flight',
  toolName: 'record_flight_booking',
  toolDescription: 'Record flight booking details',
  classifierDescription: 'a flight booking confirmation',
  systemPrompt: flightSystemPrompt,
  userPrompt: flightUserPrompt,

  inputJsonSchema: () =>
    FlightExtractionSchema.toJSONSchema() as Anthropic.Tool['input_schema'],

  isValidExtraction: (raw: unknown): boolean =>
    FlightExtractionSchema.safeParse(raw).success,

  geocodeTargets: (raw: unknown): GeocodeTargets | null => {
    const parsed = FlightExtractionSchema.safeParse(raw);
    if (!parsed.success) return null;
    return {
      start: parsed.data.departure_airport_label,
      end: parsed.data.arrival_airport_label,
    };
  },

  toSegmentFields: (raw: unknown, coords: Coords): SegmentFields | null => {
    const parsed = FlightExtractionSchema.safeParse(raw);
    if (!parsed.success) return null;
    const data = parsed.data;
    return {
      type: 'flight',
      startTime: new Date(data.departure_iso),
      startTimezone: data.departure_timezone,
      endTime: new Date(data.arrival_iso),
      endTimezone: data.arrival_timezone,
      startLocation: data.departure_airport_label,
      startLat: coords.startLat,
      startLng: coords.startLng,
      endLocation: data.arrival_airport_label,
      endLat: coords.endLat,
      endLng: coords.endLng,
      details: FlightDetailsSchema.parse(data),
    };
  },
};
```

Note `FlightDetailsSchema.parse(data)` strips the extraction-only fields — this mirrors exactly what `parse-booking.ts` does today.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run lib/ai/booking-types/__tests__/handlers.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Typecheck, lint, and commit**

```bash
npm run typecheck && npm run lint && npx vitest run
git add lib/ai/booking-types/types.ts lib/ai/booking-types/flight.ts lib/ai/booking-types/__tests__/handlers.test.ts
git commit -m "feat: add booking type handler contract and flight handler

First half of making the parse job type-agnostic. Handler methods take unknown
and re-validate internally because their input crosses an Inngest step boundary
and arrives as rehydrated JSON — a pre-narrowed generic would be a lie about
what the caller actually has."
```

---

### Task 2: The hotel handler

**Files:**
- Create: `lib/ai/booking-types/hotel.ts`
- Modify: `lib/ai/booking-types/__tests__/handlers.test.ts`

**Interfaces:**
- Consumes: `BookingTypeHandler`, `Coords`, `GeocodeTargets`, `SegmentFields` from `./types`; `HotelExtractionSchema`, `HotelDetailsSchema` from `@/lib/ai/schemas/hotel`; `hotelSystemPrompt`, `hotelUserPrompt` from `@/lib/ai/prompts/hotel`.
- Produces: `hotelHandler: BookingTypeHandler`

Hotels collapse to a single location: `geocodeTargets` returns the same address for both `start` and `end`. Task 4's geocode step detects that and geocodes once, preserving today's single-call behavior.

- [ ] **Step 1: Write the failing tests**

Append to `lib/ai/booking-types/__tests__/handlers.test.ts`, and add `import { hotelHandler } from '../hotel';` to the imports at the top:

```typescript
const validHotel = {
  hotel_name: 'Park Hotel Tokyo',
  address: '1-7-1 Higashi-Shimbashi, Minato-ku, Tokyo',
  confirmation_code: 'HTL789',
  room_type: 'Deluxe King',
  guests: 2,
  check_in_time: '15:00',
  check_out_time: '11:00',
  phone: '+81-3-6252-1111',
  check_in_iso: '2026-03-11T15:00:00+09:00',
  check_out_iso: '2026-03-14T11:00:00+09:00',
  timezone: 'Asia/Tokyo',
};

const hotelCoords = {
  startLat: '35.661900',
  startLng: '139.759400',
  endLat: '35.661900',
  endLng: '139.759400',
};

describe('hotelHandler', () => {
  it('declares its booking type, segment type, and tool name', () => {
    expect(hotelHandler.bookingType).toBe('hotel');
    expect(hotelHandler.segmentType).toBe('hotel_stay');
    expect(hotelHandler.toolName).toBe('record_hotel_booking');
  });

  it('geocodes the same address for both endpoints', () => {
    const targets = hotelHandler.geocodeTargets(validHotel);
    expect(targets).toEqual({
      start: '1-7-1 Higashi-Shimbashi, Minato-ku, Tokyo',
      end: '1-7-1 Higashi-Shimbashi, Minato-ku, Tokyo',
    });
    expect(targets!.start).toBe(targets!.end);
  });

  it('maps check-in and check-out onto segment start and end', () => {
    const fields = hotelHandler.toSegmentFields(validHotel, hotelCoords);
    expect(fields).not.toBeNull();
    expect(fields!.type).toBe('hotel_stay');
    expect(fields!.startTime).toEqual(new Date('2026-03-11T15:00:00+09:00'));
    expect(fields!.endTime).toEqual(new Date('2026-03-14T11:00:00+09:00'));
    expect(fields!.startTimezone).toBe('Asia/Tokyo');
    expect(fields!.endTimezone).toBe('Asia/Tokyo');
    expect(fields!.startLocation).toBe('1-7-1 Higashi-Shimbashi, Minato-ku, Tokyo');
    expect(fields!.endLocation).toBe('1-7-1 Higashi-Shimbashi, Minato-ku, Tokyo');
  });

  it('strips extraction-only fields out of the stored details', () => {
    const fields = hotelHandler.toSegmentFields(validHotel, hotelCoords);
    expect(fields!.details).toEqual({
      hotel_name: 'Park Hotel Tokyo',
      address: '1-7-1 Higashi-Shimbashi, Minato-ku, Tokyo',
      confirmation_code: 'HTL789',
      room_type: 'Deluxe King',
      guests: 2,
      check_in_time: '15:00',
      check_out_time: '11:00',
      phone: '+81-3-6252-1111',
    });
  });

  it('returns null for data that does not match the schema', () => {
    expect(hotelHandler.geocodeTargets({ nonsense: true })).toBeNull();
    expect(hotelHandler.toSegmentFields({ nonsense: true }, hotelCoords)).toBeNull();
    expect(hotelHandler.isValidExtraction({ nonsense: true })).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/ai/booking-types/__tests__/handlers.test.ts`
Expected: FAIL — cannot resolve `../hotel`.

- [ ] **Step 3: Write the hotel handler**

Create `lib/ai/booking-types/hotel.ts`:

```typescript
import type Anthropic from '@anthropic-ai/sdk';
import { HotelExtractionSchema, HotelDetailsSchema } from '@/lib/ai/schemas/hotel';
import { hotelSystemPrompt, hotelUserPrompt } from '@/lib/ai/prompts/hotel';
import type { BookingTypeHandler, Coords, GeocodeTargets, SegmentFields } from './types';

export const hotelHandler: BookingTypeHandler = {
  bookingType: 'hotel',
  segmentType: 'hotel_stay',
  toolName: 'record_hotel_booking',
  toolDescription: 'Record hotel booking details',
  classifierDescription: 'a hotel booking confirmation',
  systemPrompt: hotelSystemPrompt,
  userPrompt: hotelUserPrompt,

  inputJsonSchema: () =>
    HotelExtractionSchema.toJSONSchema() as Anthropic.Tool['input_schema'],

  isValidExtraction: (raw: unknown): boolean =>
    HotelExtractionSchema.safeParse(raw).success,

  // A hotel stay has one location. The job geocodes once when start === end.
  geocodeTargets: (raw: unknown): GeocodeTargets | null => {
    const parsed = HotelExtractionSchema.safeParse(raw);
    if (!parsed.success) return null;
    return { start: parsed.data.address, end: parsed.data.address };
  },

  toSegmentFields: (raw: unknown, coords: Coords): SegmentFields | null => {
    const parsed = HotelExtractionSchema.safeParse(raw);
    if (!parsed.success) return null;
    const data = parsed.data;
    return {
      type: 'hotel_stay',
      startTime: new Date(data.check_in_iso),
      startTimezone: data.timezone,
      endTime: new Date(data.check_out_iso),
      endTimezone: data.timezone,
      startLocation: data.address,
      startLat: coords.startLat,
      startLng: coords.startLng,
      endLocation: data.address,
      endLat: coords.endLat,
      endLng: coords.endLng,
      details: HotelDetailsSchema.parse(data),
    };
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/ai/booking-types/__tests__/handlers.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Typecheck, lint, and commit**

```bash
npm run typecheck && npm run lint && npx vitest run
git add lib/ai/booking-types/hotel.ts lib/ai/booking-types/__tests__/handlers.test.ts
git commit -m "feat: add hotel booking type handler

Mirrors the flight handler. geocodeTargets returns the same address for both
endpoints; the parse job geocodes once when they match, preserving today's
single-Mapbox-call behavior for hotels."
```

---

### Task 3: The registry and the generated classifier prompt

**Files:**
- Create: `lib/ai/booking-types/index.ts`
- Create: `lib/ai/booking-types/__tests__/registry.test.ts`
- Modify: `lib/ai/prompts/classifier.ts`

**Interfaces:**
- Consumes: `flightHandler`, `hotelHandler`, `BookingTypeHandler`, `HandledBookingType`.
- Produces:
  - `bookingTypeHandlers: Record<HandledBookingType, BookingTypeHandler>`
  - `getBookingTypeHandler(type: string): BookingTypeHandler | null`
  - `buildClassifierSystemPrompt(): string`

The registry is the single place that knows the set of parseable booking types. The classifier prompt is generated from it so the two cannot drift — adding a handler in 7C automatically teaches the classifier about it.

- [ ] **Step 1: Write the failing tests**

Create `lib/ai/booking-types/__tests__/registry.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  bookingTypeHandlers,
  getBookingTypeHandler,
  buildClassifierSystemPrompt,
} from '../index';

describe('bookingTypeHandlers', () => {
  it('keys every handler by its own booking type', () => {
    for (const [key, handler] of Object.entries(bookingTypeHandlers)) {
      expect(handler.bookingType).toBe(key);
    }
  });

  it('gives every handler a unique tool name', () => {
    const toolNames = Object.values(bookingTypeHandlers).map((h) => h.toolName);
    expect(new Set(toolNames).size).toBe(toolNames.length);
  });
});

describe('getBookingTypeHandler', () => {
  it('resolves a known booking type', () => {
    expect(getBookingTypeHandler('flight')).toBe(bookingTypeHandlers.flight);
    expect(getBookingTypeHandler('hotel')).toBe(bookingTypeHandlers.hotel);
  });

  it('returns null for unknown', () => {
    expect(getBookingTypeHandler('unknown')).toBeNull();
  });

  it('returns null for a string that is not a booking type at all', () => {
    expect(getBookingTypeHandler('spaceship')).toBeNull();
  });
});

describe('buildClassifierSystemPrompt', () => {
  it('lists every registered booking type', () => {
    const prompt = buildClassifierSystemPrompt();
    for (const handler of Object.values(bookingTypeHandlers)) {
      expect(prompt).toContain(`"${handler.bookingType}"`);
      expect(prompt).toContain(handler.classifierDescription);
    }
  });

  it('always offers unknown as an option', () => {
    expect(buildClassifierSystemPrompt()).toContain('"unknown"');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/ai/booking-types/__tests__/registry.test.ts`
Expected: FAIL — cannot resolve `../index`.

- [ ] **Step 3: Write the registry**

Create `lib/ai/booking-types/index.ts`:

```typescript
import { flightHandler } from './flight';
import { hotelHandler } from './hotel';
import type { BookingTypeHandler, HandledBookingType } from './types';

export type {
  BookingTypeHandler,
  HandledBookingType,
  Coords,
  GeocodeTargets,
  SegmentFields,
} from './types';

/**
 * The single place that knows which booking types can be parsed.
 * Adding a type means adding a file and one entry here — nothing else changes.
 */
export const bookingTypeHandlers: Record<HandledBookingType, BookingTypeHandler> = {
  flight: flightHandler,
  hotel: hotelHandler,
};

export function getBookingTypeHandler(type: string): BookingTypeHandler | null {
  return Object.hasOwn(bookingTypeHandlers, type)
    ? bookingTypeHandlers[type as HandledBookingType]
    : null;
}

/** Built from the registry so the classifier can never fall out of sync with the handlers. */
export function buildClassifierSystemPrompt(): string {
  const options = Object.values(bookingTypeHandlers)
    .map((h) => `- "${h.bookingType}" if it is ${h.classifierDescription}`)
    .join('\n');

  return `You are a document classifier. The user will provide a booking confirmation document. Your task is to identify what kind of booking it is.

Respond with exactly one word — no punctuation, no explanation:
${options}
- "unknown" if you cannot determine the type or it is none of these`;
}
```

- [ ] **Step 4: Point the classifier prompt module at the registry**

Replace the contents of `lib/ai/prompts/classifier.ts`:

```typescript
import { buildClassifierSystemPrompt } from '@/lib/ai/booking-types';

export const classifierSystemPrompt = buildClassifierSystemPrompt();

export function classifierUserPrompt(fileName: string): string {
  return `Please classify this booking document: ${fileName}`;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run`
Expected: PASS — 12 handler tests, 7 registry tests, plus the existing 27.

- [ ] **Step 6: Typecheck, lint, and commit**

```bash
npm run typecheck && npm run lint
git add lib/ai/booking-types/index.ts lib/ai/booking-types/__tests__/registry.test.ts lib/ai/prompts/classifier.ts
git commit -m "feat: add booking type registry and generate the classifier prompt from it

The classifier previously hardcoded its own list of document types, so adding a
booking type meant remembering to update a prompt in a different directory.
Generating it from the registry makes that impossible to forget."
```

---

### Task 4: Make the parse job type-agnostic

**Files:**
- Modify: `lib/inngest/functions/parse-booking.ts`

**Interfaces:**
- Consumes: `getBookingTypeHandler` and the `Coords` type from `@/lib/ai/booking-types`.

This is the task the previous three exist to enable. **It is a pure refactor — no behavior changes.** Re-read the "Existing behavior this refactor must preserve" section at the top of this plan before starting, and check your result against it line by line.

- [ ] **Step 1: Replace the file's contents**

The full new `lib/inngest/functions/parse-booking.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { inngest } from '@/lib/inngest/client';
import { anthropic } from '@/lib/ai/client';
import { getPresignedGetUrl } from '@/lib/r2';
import { geocode } from '@/lib/mapbox/client';
import { getBookingById, updateBooking } from '@/lib/db/repositories/bookings';
import { createSegment, segmentExistsForBooking } from '@/lib/db/repositories/segments';
import { classifierSystemPrompt, classifierUserPrompt } from '@/lib/ai/prompts/classifier';
import { getBookingTypeHandler, type Coords } from '@/lib/ai/booking-types';

function fileContentBlock(
  mimeType: string,
  fileUrl: string,
): Anthropic.MessageParam['content'][number] {
  return mimeType === 'application/pdf'
    ? { type: 'document', source: { type: 'url', url: fileUrl } }
    : { type: 'image', source: { type: 'url', url: fileUrl } };
}

export const parseBookingFunction = inngest.createFunction(
  { id: 'parse-booking', name: 'Parse Booking', triggers: [{ event: 'booking/uploaded' }] },
  async ({ event, step }) => {
    const { bookingId } = event.data as { bookingId: string };

    try {
      // ── Step 1: Classify ────────────────────────────────────────────────────
      const { bookingType } = await step.run('classify', async () => {
        const booking = await getBookingById(bookingId);
        if (!booking) throw new Error(`Booking ${bookingId} not found`);

        const fileUrl = await getPresignedGetUrl(booking.fileKey);

        const message = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 10,
          system: classifierSystemPrompt,
          messages: [
            {
              role: 'user',
              content: [
                fileContentBlock(booking.mimeType, fileUrl),
                { type: 'text', text: classifierUserPrompt(booking.fileName) },
              ],
            },
          ],
        });

        const firstBlock = message.content[0];
        const raw =
          firstBlock?.type === 'text' ? firstBlock.text.trim().toLowerCase() : 'unknown';

        const handler = getBookingTypeHandler(raw);
        if (!handler) {
          await updateBooking(bookingId, {
            status: 'parsing_failed',
            parseError: "We couldn't identify this document as a flight or hotel booking.",
          });
          return { bookingType: null };
        }

        await updateBooking(bookingId, { type: handler.bookingType });
        return { bookingType: handler.bookingType };
      });

      if (!bookingType) return { status: 'unknown_document' };

      // The handler is re-resolved per step: step results cross a serialization
      // boundary, so only the plain booking type travels between steps.
      const handler = getBookingTypeHandler(bookingType);
      if (!handler) throw new Error(`No handler registered for booking type ${bookingType}`);

      // ── Step 2: Extract ─────────────────────────────────────────────────────
      const extractionResult = await step.run('extract', async () => {
        const booking = await getBookingById(bookingId);
        if (!booking) throw new Error(`Booking ${bookingId} not found`);

        const fileUrl = await getPresignedGetUrl(booking.fileKey);

        const message = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          system: handler.systemPrompt,
          tools: [
            {
              name: handler.toolName,
              description: handler.toolDescription,
              input_schema: handler.inputJsonSchema(),
            },
          ],
          tool_choice: { type: 'tool', name: handler.toolName },
          messages: [
            {
              role: 'user',
              content: [
                fileContentBlock(booking.mimeType, fileUrl),
                { type: 'text', text: handler.userPrompt(booking.fileName) },
              ],
            },
          ],
        });

        const toolBlock = message.content.find(
          (c): c is Anthropic.ToolUseBlock => c.type === 'tool_use',
        );
        if (!toolBlock) {
          await updateBooking(bookingId, {
            status: 'parsing_failed',
            parseError: 'The AI did not return extraction results.',
          });
          return null;
        }

        if (!handler.isValidExtraction(toolBlock.input)) {
          await updateBooking(bookingId, {
            status: 'parsing_failed',
            parseError: 'The AI extracted data in an unexpected format.',
          });
          return null;
        }

        await updateBooking(bookingId, {
          rawAiOutput: toolBlock.input as Record<string, unknown>,
        });
        return toolBlock.input as Record<string, unknown>;
      });

      if (!extractionResult) return { status: 'extraction_failed' };

      // ── Step 3: Geocode ─────────────────────────────────────────────────────
      const coords = await step.run('geocode', async (): Promise<Coords> => {
        const targets = handler.geocodeTargets(extractionResult);
        if (!targets) return { startLat: null, startLng: null, endLat: null, endLng: null };

        // One location (a hotel stay) — geocode once and reuse for both endpoints.
        if (targets.start === targets.end) {
          const point = await geocode(targets.start);
          const lat = point ? String(point.lat) : null;
          const lng = point ? String(point.lng) : null;
          return { startLat: lat, startLng: lng, endLat: lat, endLng: lng };
        }

        const [startPoint, endPoint] = await Promise.all([
          geocode(targets.start),
          geocode(targets.end),
        ]);
        return {
          startLat: startPoint ? String(startPoint.lat) : null,
          startLng: startPoint ? String(startPoint.lng) : null,
          endLat: endPoint ? String(endPoint.lat) : null,
          endLng: endPoint ? String(endPoint.lng) : null,
        };
      });

      // ── Step 4: Write ───────────────────────────────────────────────────────
      const { segmentId } = await step.run('write', async () => {
        const booking = await getBookingById(bookingId);
        if (!booking) throw new Error(`Booking ${bookingId} not found`);

        if (await segmentExistsForBooking(bookingId)) {
          await updateBooking(bookingId, { status: 'parsed' });
          return { segmentId: null };
        }

        const fields = handler.toSegmentFields(extractionResult, coords);
        if (!fields) {
          await updateBooking(bookingId, {
            status: 'parsing_failed',
            parseError: 'The AI extracted data in an unexpected format.',
          });
          return { segmentId: null };
        }

        const segment = await createSegment({
          ...fields,
          bookingId,
          tripId: booking.tripId,
        });
        await updateBooking(bookingId, { status: 'parsed' });
        return { segmentId: segment.id };
      });

      return { status: 'parsed', segmentId };
    } catch (err) {
      await updateBooking(bookingId, {
        status: 'parsing_failed',
        parseError: 'Something went wrong while parsing your document.',
      });
      throw err;
    }
  },
);
```

- [ ] **Step 2: Check the result against the preserved-behavior list**

Go through the "Existing behavior this refactor must preserve" section at the top of this plan item by item against your new file. Note in your report any place the new code differs, and why.

Two deliberate differences to confirm rather than flag:
- The classify step now returns `{ bookingType: null }` instead of `'unknown'`, since the registry has no `unknown` handler. The user-facing error string and the `{ status: 'unknown_document' }` return are unchanged.
- The write step now checks `segmentExistsForBooking` first and returns early, rather than wrapping the creation in an `if (!alreadyExists)`. Same behavior, one less level of nesting.

- [ ] **Step 3: Verify nothing regressed**

```bash
npm run typecheck && npm run lint && npx vitest run
```

Expected: clean, and 46 tests passing (27 existing + 12 handler + 7 registry).

- [ ] **Step 4: Commit**

```bash
git add lib/inngest/functions/parse-booking.ts
git commit -m "refactor: drive the parse job from the booking type registry

The job branched on booking type in three separate steps — extract picked the
schema, prompt, and tool name; geocode picked which fields to geocode; write had
two near-identical createSegment calls. With four booking types that becomes a
four-way branch in three places.

Every branch now resolves through one handler lookup, so adding a type is a new
file plus a registry entry and no changes here. The handler is re-resolved
rather than carried across steps because Inngest step results are serialized.
Behavior for flights and hotels is unchanged."
```

---

### Task 5: Update the documented convention

**Files:**
- Modify: `CLAUDE.md`

`CLAUDE.md` currently states: *"Prompt engineering lives in `lib/ai/prompts/`. One file per booking type. Each prompt file exports `{ systemPrompt, userPromptTemplate, outputSchema }`."* That was never quite accurate and is now actively misleading — it would send someone to the wrong place to add a booking type.

- [ ] **Step 1: Replace the AI conventions bullet**

In `CLAUDE.md`, under "### AI / Anthropic API", replace the line beginning *"Prompt engineering lives in `lib/ai/prompts/`"* with:

```markdown
- Each parseable booking type is one file in `lib/ai/booking-types/`, exporting a `BookingTypeHandler`: its prompts, tool name, JSON schema, geocode targets, and segment mapper. `lib/ai/booking-types/index.ts` is the registry — the single place that knows which types exist, and the source the classifier prompt is generated from. Adding a booking type means adding a handler file and one registry entry; the Inngest parse job needs no changes.
- Prompt text lives in `lib/ai/prompts/<type>.ts` and Zod schemas in `lib/ai/schemas/<type>.ts`. Handlers compose them rather than absorbing them, because the details schemas are also used for rendering outside the parsing pipeline.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document the booking type registry convention

The AI conventions section pointed at lib/ai/prompts/ with an exported shape
that no longer matches the code, which would send someone to the wrong place to
add a booking type."
```

---

## Final verification

- [ ] `npm run typecheck` — clean
- [ ] `npm run lint` — clean
- [ ] `npx vitest run` — 46 passing
- [ ] `git diff a532f13 -- lib/ai/prompts/flight.ts lib/ai/prompts/hotel.ts lib/ai/schemas/` is **empty** — the prompt text and schemas must be untouched by this refactor
- [ ] Manual end-to-end (human partner): with `npm run dev` and `npx inngest-cli@latest dev`, upload a real flight PDF and a real hotel PDF. Both must classify, extract, geocode, and land on the timeline exactly as before. This is the only check that proves the refactor is behavior-preserving — the unit tests cover the handlers, not the job that drives them.
