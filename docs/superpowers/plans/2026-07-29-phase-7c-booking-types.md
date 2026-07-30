# Phase 7C — Train and Reservation Booking Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach Wayfare two new booking types — `train` and `reservation` — so an itinerary can hold most of what's actually in a traveller's inbox, not just flights and hotels.

**Architecture:** Phase 7B made the Inngest parse job type-agnostic: each booking type is one handler file under `lib/ai/booking-types/` plus one registry entry. This phase spends that. Two new handlers, an additive enum migration, and the UI surfaces that still learn types by inline comparison. It opens with three registry-hygiene items 7B's review deferred, because each is cheaper at two handlers than at four.

**Re-staged from the spec:** the Phase 7 spec bundled lodging-on-covered-days into this stage. It is an independent subsystem — it changes `groupSegmentsByDay`'s shape and doesn't depend on the new types — so it moves to **7D**, and calendar export to **7E**.

**Tech Stack:** TypeScript strict, Zod v4, Anthropic SDK (Claude vision), Inngest v4, Drizzle + Neon Postgres, Mapbox GL JS, Tailwind + shadcn/ui, Vitest, Luxon.

## Global Constraints

- `strict: true`. **No `any`** — use `unknown` and narrow.
- Absolute imports via `@/`. Never `../../../lib/...`. Test files import the module under test relatively (`../`), matching existing tests.
- Prefer `type` over `interface`.
- **Zod schemas are the source of truth** — derive types with `z.infer`, never parallel declarations.
- Zod schemas are `SomethingSchema`; utilities are `kebab-case.ts` exporting `camelCase`; components are `PascalCase.tsx`.
- **Default to Server Components.** `"use client"` only for state, effects, or browser APIs. The new cards are Server Components.
- Server Actions return `{ ok: true, data } | { ok: false, error }` and never throw across the boundary.
- All schema changes go through Drizzle migrations. Never edit the database directly.
- **No new dependencies.**
- **Behavior for flights and hotels must not change.** They are the two types already in production; this phase adds alongside them.
- Conventional commits. `npm run typecheck` and `npm run lint` clean before every commit.
- Vitest runs in `environment: 'node'` — no jsdom, no testing-library, no DB harness. **Only pure functions get unit tests.** React components and the Inngest job are verified manually by the human partner. Do not add a test harness or testing dependencies.

## Prompt-tuning reality

The two new prompts are the least predictable work in this phase. You are writing them against your understanding of what these documents look like, without real PDFs to test against — the human partner will tune them during end-to-end verification. So:

- Model the new prompts closely on `lib/ai/prompts/flight.ts` and `lib/ai/prompts/hotel.ts`. They encode hard-won instructions (IANA names not offsets, ISO 8601 with UTC offset, nullable fields as `null` not `""`). Carry those forward.
- Do not invent elaborate instructions for cases you're guessing at. A focused prompt that gets tuned beats a speculative one.
- If you find yourself unsure what a field should contain, say so in your report rather than guessing silently.

## File Structure

**Create:**
- `lib/ai/schemas/train.ts`, `lib/ai/prompts/train.ts`, `lib/ai/booking-types/train.ts`
- `lib/ai/schemas/reservation.ts`, `lib/ai/prompts/reservation.ts`, `lib/ai/booking-types/reservation.ts`
- `components/itinerary/TrainCard.tsx`, `components/itinerary/ReservationCard.tsx`
- `drizzle/0003_*.sql` (generated)

**Modify:**
- `lib/ai/booking-types/types.ts` — `isValidExtraction` → `validateExtraction` carrying the error
- `lib/ai/booking-types/flight.ts`, `hotel.ts` — same contract change
- `lib/ai/booking-types/index.ts` — register the two handlers; add `buildUnidentifiedDocumentMessage()`
- `lib/inngest/functions/parse-booking.ts` — consume the widened contract and the generated message
- `lib/db/schema.ts` — enum values
- `components/itinerary/DaySection.tsx` — card dispatch by segment type
- `components/itinerary/TripMap.tsx` — markers for the new types
- `components/trips/BookingCard.tsx` — panel summary lines for the new types
- `components/itinerary/ItineraryTimeline.tsx` — empty-state copy that no longer names only two types
- `lib/ai/booking-types/__tests__/handlers.test.ts`, `registry.test.ts`

**Unchanged, deliberately:** `lib/itinerary/compute-annotations.ts`. Its gap and distance logic is type-agnostic and already applies to any segment pair; its two conflict rules are specific to flight↔hotel and stay that way. Reservation-specific conflict rules are not in scope — YAGNI until someone wants one.

---

### Task 1: Carry the validation error out of the handlers

**Files:**
- Modify: `lib/ai/booking-types/types.ts`, `flight.ts`, `hotel.ts`, `lib/inngest/functions/parse-booking.ts`
- Test: `lib/ai/booking-types/__tests__/handlers.test.ts`

**Interfaces:**
- Replaces: `isValidExtraction: (raw: unknown) => boolean`
- Produces: `validateExtraction: (raw: unknown) => { ok: true } | { ok: false; error: string }`

`CLAUDE.md`'s AI convention says *"If validation fails, mark the booking `parsing_failed` with the validation error stored."* The codebase has never met that: the `ZodError` is created inside the handler and discarded. Two more handlers land in this phase, so widen now — four sites today, six later.

The user-facing `parseError` copy must not change. The Zod message goes into `bookings.rawAiOutput` alongside the raw input, which is the existing debug channel.

- [ ] **Step 1: Write the failing tests**

Add to `lib/ai/booking-types/__tests__/handlers.test.ts`, inside the existing `describe('flightHandler', …)` block:

```typescript
  it('reports ok for a valid extraction', () => {
    expect(flightHandler.validateExtraction(validFlight)).toEqual({ ok: true });
  });

  it('reports the validation error for an invalid extraction', () => {
    const result = flightHandler.validateExtraction({ nonsense: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.length).toBeGreaterThan(0);
      expect(result.error).toContain('flight_number');
    }
  });
```

And inside `describe('hotelHandler', …)`:

```typescript
  it('reports ok for a valid extraction', () => {
    expect(hotelHandler.validateExtraction(validHotel)).toEqual({ ok: true });
  });

  it('reports the validation error for an invalid extraction', () => {
    const result = hotelHandler.validateExtraction({ nonsense: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('hotel_name');
    }
  });
```

Then delete the two existing `isValidExtraction` assertions — in `flightHandler`'s `'validates raw tool input'` test and in `hotelHandler`'s `'returns null for data that does not match the schema'` test. In the hotel case keep the other two assertions in that test and drop only the `isValidExtraction` line; in the flight case the whole `it('validates raw tool input', …)` block becomes empty, so delete the block.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/ai/booking-types/__tests__/handlers.test.ts`
Expected: FAIL — `validateExtraction is not a function`.

- [ ] **Step 3: Change the contract**

In `lib/ai/booking-types/types.ts`, replace the `isValidExtraction` member of `BookingTypeHandler` with:

```typescript
  /**
   * Validates raw tool input. On failure the message is stored for debugging —
   * the user-facing copy stays generic.
   */
  validateExtraction: (raw: unknown) => { ok: true } | { ok: false; error: string };
```

- [ ] **Step 4: Update both handlers**

In `lib/ai/booking-types/flight.ts`, replace the `isValidExtraction` property with:

```typescript
  validateExtraction: (raw: unknown) => {
    const parsed = FlightExtractionSchema.safeParse(raw);
    return parsed.success ? { ok: true } : { ok: false, error: parsed.error.message };
  },
```

In `lib/ai/booking-types/hotel.ts`, the same with `HotelExtractionSchema`.

- [ ] **Step 5: Consume it in the parse job**

In `lib/inngest/functions/parse-booking.ts`'s extract step, replace the `if (!handler.isValidExtraction(toolBlock.input)) { … }` block with:

```typescript
        const validation = handler.validateExtraction(toolBlock.input);
        if (!validation.ok) {
          await updateBooking(bookingId, {
            status: 'parsing_failed',
            parseError: 'The AI extracted data in an unexpected format.',
            rawAiOutput: {
              input: toolBlock.input,
              validationError: validation.error,
            } as Record<string, unknown>,
          });
          return null;
        }
```

The `parseError` string is unchanged. `rawAiOutput` now carries both the raw input and why it was rejected, so a failed parse is diagnosable from the database.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run`
Expected: PASS, **50** tests. The arithmetic: 47 at the end of 7B, plus 4 new tests, minus the one now-empty `'validates raw tool input'` block you deleted. Removing an assertion from hotel's existing test doesn't change the count. If your number differs, work out why before proceeding.

- [ ] **Step 7: Typecheck, lint, and commit**

```bash
npm run typecheck && npm run lint
git add lib/ai/booking-types lib/inngest/functions/parse-booking.ts
git commit -m "feat: carry the Zod validation error out of booking type handlers

CLAUDE.md's AI convention says a failed validation should store the error, and
the codebase never has — the ZodError was created inside the handler and thrown
away. Widening the contract now costs four call sites; after this phase's two new
handlers it would cost six. User-facing copy is unchanged; the message goes to
rawAiOutput, the existing debug channel."
```

---

### Task 2: Stop hardcoding the type set in user-facing text

**Files:**
- Modify: `lib/ai/booking-types/index.ts`, `lib/inngest/functions/parse-booking.ts`, `components/itinerary/ItineraryTimeline.tsx`
- Test: `lib/ai/booking-types/__tests__/registry.test.ts`

**Interfaces:**
- Produces: `buildUnidentifiedDocumentMessage(): string`, `buildSupportedTypesPhrase(): string`

Two strings still enumerate "flight or hotel": the classify step's failure message (which carries a `TODO(7C)` marker from 7B) and the timeline's empty-state copy. After this phase both would be wrong.

`buildSupportedTypesPhrase()` produces a human list from the registry — `"flights, hotels, trains, or reservations"` once all four are registered. Handlers gain a `pluralLabel` for this.

- [ ] **Step 1: Write the failing tests**

Add to `lib/ai/booking-types/__tests__/registry.test.ts`:

```typescript
describe('buildSupportedTypesPhrase', () => {
  it('lists every registered handler by its plural label', () => {
    const phrase = buildSupportedTypesPhrase();
    for (const handler of Object.values(bookingTypeHandlers)) {
      expect(handler.pluralLabel.length).toBeGreaterThan(0);
      expect(phrase).toContain(handler.pluralLabel);
    }
  });

  it('joins the last item with "or"', () => {
    expect(buildSupportedTypesPhrase()).toMatch(/, or |^\w+ or /);
  });
});

describe('buildUnidentifiedDocumentMessage', () => {
  it('names the supported types', () => {
    const message = buildUnidentifiedDocumentMessage();
    expect(message).toContain(buildSupportedTypesPhrase());
  });

  it('does not hardcode a type list', () => {
    expect(buildUnidentifiedDocumentMessage()).not.toContain('flight or hotel');
  });
});
```

Add `buildSupportedTypesPhrase` and `buildUnidentifiedDocumentMessage` to the import from `../index` at the top of the file.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/ai/booking-types/__tests__/registry.test.ts`
Expected: FAIL — the two functions don't exist.

- [ ] **Step 3: Add `pluralLabel` to the contract and both handlers**

In `lib/ai/booking-types/types.ts`, add to `BookingTypeHandler`, next to `classifierDescription`:

```typescript
  /** Plural human label for user-facing type lists, e.g. 'flights'. */
  pluralLabel: string;
```

In `flight.ts` add `pluralLabel: 'flights',`; in `hotel.ts` add `pluralLabel: 'hotels',`.

- [ ] **Step 4: Add the builders**

In `lib/ai/booking-types/index.ts`, after `buildClassifierSystemPrompt`:

```typescript
/** e.g. "flights, hotels, trains, or reservations" — built from the registry. */
export function buildSupportedTypesPhrase(): string {
  const labels = Object.values(bookingTypeHandlers).map((h) => h.pluralLabel);
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} or ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, or ${labels[labels.length - 1]}`;
}

export function buildUnidentifiedDocumentMessage(): string {
  return `We couldn't identify this document. We can read ${buildSupportedTypesPhrase()}.`;
}
```

- [ ] **Step 5: Use it in the parse job**

In `lib/inngest/functions/parse-booking.ts`, add `buildUnidentifiedDocumentMessage` to the existing `@/lib/ai/booking-types` import. Then in the classify step, **delete the three-line `TODO(7C)` comment** and replace the hardcoded string:

```typescript
          await updateBooking(bookingId, {
            status: 'parsing_failed',
            parseError: buildUnidentifiedDocumentMessage(),
          });
```

- [ ] **Step 6: Use it in the timeline empty state**

In `components/itinerary/ItineraryTimeline.tsx`, add `import { buildSupportedTypesPhrase } from '@/lib/ai/booking-types';` and change the `'no-bookings'` entry's `body`. Because `EMPTY_STATE_COPY` is a module-level `as const` object, the value must stay a static expression — call the function inline:

```typescript
  'no-bookings': {
    icon: '🗺',
    title: 'No bookings yet',
    body: `Upload a confirmation PDF to build your itinerary — we can read ${buildSupportedTypesPhrase()}`,
  },
```

- [ ] **Step 7: Run tests, typecheck, lint, and commit**

```bash
npx vitest run && npm run typecheck && npm run lint
git add lib/ai/booking-types lib/inngest/functions/parse-booking.ts components/itinerary/ItineraryTimeline.tsx
git commit -m "feat: generate user-facing type lists from the booking type registry

Two strings hardcoded 'flight or hotel' — the classify step's failure message
and the timeline empty state. Both would have become wrong the moment this phase
lands, and one already carried a TODO to that effect. Now derived from the
registry, so a new handler updates them by existing."
```

---

### Task 3: Additive enum migration

**Files:**
- Modify: `lib/db/schema.ts`
- Create: `drizzle/0003_*.sql` (generated)

**Interfaces:**
- Produces: `bookingTypeEnum` gains `'train'`, `'reservation'`; `segmentTypeEnum` gains `'train_ride'`, `'reservation'`.

Naming follows the existing `hotel` → `hotel_stay` convention: a booking type and its segment type may differ.

**This task will break typecheck until Tasks 4 and 5 land, and that is the point.** `bookingTypeHandlers` is typed `Record<HandledBookingType, BookingTypeHandler>` where `HandledBookingType = Exclude<BookingType, 'unknown'>`, so adding enum values makes the registry incomplete and `tsc` says so. A booking type cannot be half-landed. Expect the failure, confirm it names the two missing keys, and report it — do not add placeholder handlers to silence it.

- [ ] **Step 1: Add the enum values**

In `lib/db/schema.ts`:

```typescript
export const bookingTypeEnum = pgEnum('booking_type', [
  'flight',
  'hotel',
  'train',
  'reservation',
  'unknown',
]);
export const segmentTypeEnum = pgEnum('segment_type', [
  'flight',
  'hotel_stay',
  'train_ride',
  'reservation',
]);
```

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate`

- [ ] **Step 3: Inspect the generated SQL before applying it**

Read the new file in `drizzle/`. Confirm it contains only `ALTER TYPE ... ADD VALUE` statements and does **not** drop, recreate, or rewrite either enum type or any table using it. A generated `DROP TYPE` or table rewrite would risk existing rows — if you see one, **stop and report** rather than applying it.

Also note: `ALTER TYPE ... ADD VALUE` historically could not run inside a transaction block, and Drizzle wraps migrations in one. On Neon's Postgres it is permitted provided the new value isn't *used* in the same transaction, which ours isn't. Record in your report exactly what the generated SQL says.

- [ ] **Step 4: Apply the migration**

Run: `npm run db:migrate`

Report the output. If it fails on the transaction issue, report the error — the fallback is running the `ALTER TYPE` statements individually, but do not improvise before reporting.

- [ ] **Step 5: Confirm typecheck fails for the expected reason**

Run: `npm run typecheck`
Expected: FAIL, naming `bookingTypeHandlers` as missing the `train` and `reservation` properties. Quote the error in your report. **Do not fix it** — Tasks 4 and 5 do.

- [ ] **Step 6: Commit**

Committing a state where typecheck fails is deliberate here: the migration and the schema belong in one atomic commit, and the compiler is correctly reporting that the registry is now incomplete.

```bash
git add lib/db/schema.ts drizzle/
git commit -m "feat: add train and reservation to the booking and segment type enums

Additive migration only. This intentionally breaks typecheck until the two
handlers land: the registry is typed Record<HandledBookingType, ...> derived from
this enum, so the compiler now reports the two missing handlers. That coupling is
what makes it impossible to half-land a booking type."
```

---

### Task 4: The train booking type

**Files:**
- Create: `lib/ai/schemas/train.ts`, `lib/ai/prompts/train.ts`, `lib/ai/booking-types/train.ts`
- Modify: `lib/ai/booking-types/index.ts`
- Test: `lib/ai/booking-types/__tests__/handlers.test.ts`

**Interfaces:**
- Produces: `TrainDetailsSchema`, `TrainExtractionSchema`, `trainSystemPrompt`, `trainUserPrompt`, `trainHandler`; registry entry `train`.

A train is structurally a flight: two geocoded endpoints, two timezones, a carrier and a service number. Model `train.ts` on `lib/ai/booking-types/flight.ts` — it should read as its sibling.

- [ ] **Step 1: Write the failing tests**

Add to `lib/ai/booking-types/__tests__/handlers.test.ts`, plus `import { trainHandler } from '../train';` at the top:

```typescript
const validTrain = {
  train_number: 'NZ 21',
  operator: 'JR Central',
  confirmation_code: 'TRN456',
  departure_station: 'Tokyo',
  arrival_station: 'Kyoto',
  coach: '7',
  seat: '11D',
  travel_class: 'Green Car',
  departure_iso: '2026-03-14T09:00:00+09:00',
  departure_timezone: 'Asia/Tokyo',
  arrival_iso: '2026-03-14T11:15:00+09:00',
  arrival_timezone: 'Asia/Tokyo',
  departure_station_label: 'Tokyo Station, Tokyo, Japan',
  arrival_station_label: 'Kyoto Station, Kyoto, Japan',
};

describe('trainHandler', () => {
  it('declares its booking type and tool name', () => {
    expect(trainHandler.bookingType).toBe('train');
    expect(trainHandler.toolName).toBe('record_train_booking');
  });

  it('geocodes the departure and arrival station labels', () => {
    expect(trainHandler.geocodeTargets(validTrain)).toEqual({
      start: 'Tokyo Station, Tokyo, Japan',
      end: 'Kyoto Station, Kyoto, Japan',
    });
  });

  it('maps extraction and coordinates onto segment fields', () => {
    const fields = trainHandler.toSegmentFields(validTrain, coords);
    expect(fields).not.toBeNull();
    expect(fields!.type).toBe('train_ride');
    expect(fields!.startTime).toEqual(new Date('2026-03-14T09:00:00+09:00'));
    expect(fields!.endTime).toEqual(new Date('2026-03-14T11:15:00+09:00'));
    expect(fields!.startTimezone).toBe('Asia/Tokyo');
    expect(fields!.startLocation).toBe('Tokyo Station, Tokyo, Japan');
    expect(fields!.endLocation).toBe('Kyoto Station, Kyoto, Japan');
  });

  it('strips extraction-only fields out of the stored details', () => {
    const fields = trainHandler.toSegmentFields(validTrain, coords);
    expect(fields!.details).toEqual({
      train_number: 'NZ 21',
      operator: 'JR Central',
      confirmation_code: 'TRN456',
      departure_station: 'Tokyo',
      arrival_station: 'Kyoto',
      coach: '7',
      seat: '11D',
      travel_class: 'Green Car',
    });
  });

  it('returns null for data that does not match the schema', () => {
    expect(trainHandler.geocodeTargets({ nonsense: true })).toBeNull();
    expect(trainHandler.toSegmentFields({ nonsense: true }, coords)).toBeNull();
    expect(trainHandler.validateExtraction({ nonsense: true }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/ai/booking-types/__tests__/handlers.test.ts`
Expected: FAIL — cannot resolve `../train`.

- [ ] **Step 3: Write the schema**

Create `lib/ai/schemas/train.ts`:

```typescript
import { z } from 'zod';

export const TrainDetailsSchema = z.object({
  train_number: z.string(),
  operator: z.string(),
  confirmation_code: z.string().nullable(),
  departure_station: z.string(),
  arrival_station: z.string(),
  coach: z.string().nullable(),
  seat: z.string().nullable(),
  travel_class: z.string().nullable(),
});

export type TrainDetails = z.infer<typeof TrainDetailsSchema>;

// Full tool output — extends details with fields used in the segments row
export const TrainExtractionSchema = TrainDetailsSchema.extend({
  departure_iso: z.string(),            // ISO 8601 with UTC offset
  departure_timezone: z.string(),       // IANA, e.g. "Asia/Tokyo"
  arrival_iso: z.string(),
  arrival_timezone: z.string(),
  departure_station_label: z.string(),  // geocodable, e.g. "Tokyo Station, Tokyo, Japan"
  arrival_station_label: z.string(),
});

export type TrainExtraction = z.infer<typeof TrainExtractionSchema>;
```

- [ ] **Step 4: Write the prompt**

Create `lib/ai/prompts/train.ts`:

```typescript
export const trainSystemPrompt = `You are a data extraction assistant specializing in train and rail booking confirmations.

For departure_iso and arrival_iso: use ISO 8601 format with the UTC offset for the local time at that station, e.g. "2026-03-14T09:00:00+09:00". Use the standard offset for that timezone (DST approximation is acceptable).

For departure_timezone and arrival_timezone: use IANA timezone identifiers, e.g. "Asia/Tokyo", "Europe/Paris". Never use offset strings like "UTC+9" or "GMT+9" — always the IANA name. A domestic journey usually has the same timezone at both ends; international routes may not.

For departure_station_label and arrival_station_label: a geocodable station name including city and country, e.g. "Tokyo Station, Tokyo, Japan" or "Gare de Lyon, Paris, France". These are used for map lookup, so favour the full official station name over an abbreviation.

For train_number: the service or train number as printed, e.g. "NZ 21", "TGV 6205", "Acela 2170".
For operator: the rail company, e.g. "JR Central", "SNCF", "Amtrak".
For travel_class: the fare class as printed, e.g. "Green Car", "First", "Standard Premier".

All nullable fields must be null (not empty string) when the information is absent.`;

export function trainUserPrompt(fileName: string): string {
  return `Extract all train booking details from this confirmation document: ${fileName}`;
}
```

- [ ] **Step 5: Write the handler**

Create `lib/ai/booking-types/train.ts`:

```typescript
import type Anthropic from '@anthropic-ai/sdk';
import { TrainExtractionSchema, TrainDetailsSchema } from '@/lib/ai/schemas/train';
import { trainSystemPrompt, trainUserPrompt } from '@/lib/ai/prompts/train';
import type { BookingTypeHandler, Coords, GeocodeTargets, SegmentFields } from './types';

export const trainHandler: BookingTypeHandler = {
  bookingType: 'train',
  toolName: 'record_train_booking',
  toolDescription: 'Record train booking details',
  classifierDescription: 'a train or rail booking confirmation',
  pluralLabel: 'trains',
  systemPrompt: trainSystemPrompt,
  userPrompt: trainUserPrompt,

  inputJsonSchema: () =>
    TrainExtractionSchema.toJSONSchema() as Anthropic.Tool['input_schema'],

  validateExtraction: (raw: unknown) => {
    const parsed = TrainExtractionSchema.safeParse(raw);
    return parsed.success ? { ok: true } : { ok: false, error: parsed.error.message };
  },

  geocodeTargets: (raw: unknown): GeocodeTargets | null => {
    const parsed = TrainExtractionSchema.safeParse(raw);
    if (!parsed.success) return null;
    return {
      start: parsed.data.departure_station_label,
      end: parsed.data.arrival_station_label,
    };
  },

  toSegmentFields: (raw: unknown, coords: Coords): SegmentFields | null => {
    const parsed = TrainExtractionSchema.safeParse(raw);
    if (!parsed.success) return null;
    const data = parsed.data;
    return {
      type: 'train_ride',
      startTime: new Date(data.departure_iso),
      startTimezone: data.departure_timezone,
      endTime: new Date(data.arrival_iso),
      endTimezone: data.arrival_timezone,
      startLocation: data.departure_station_label,
      startLat: coords.startLat,
      startLng: coords.startLng,
      endLocation: data.arrival_station_label,
      endLat: coords.endLat,
      endLng: coords.endLng,
      details: TrainDetailsSchema.parse(data),
    };
  },
};
```

- [ ] **Step 6: Register it**

In `lib/ai/booking-types/index.ts`, add `import { trainHandler } from './train';` and the entry `train: trainHandler,` to `bookingTypeHandlers`.

- [ ] **Step 7: Run tests**

Run: `npx vitest run`
Expected: the train tests pass. `npm run typecheck` should now report only `reservation` missing from the registry — quote that in your report as confirmation the coupling works.

- [ ] **Step 8: Commit**

```bash
npm run lint
git add lib/ai/schemas/train.ts lib/ai/prompts/train.ts lib/ai/booking-types
git commit -m "feat: add the train booking type

Structurally a flight — two geocoded endpoints, two timezones, a carrier and a
service number — so it reuses the existing transit shape and needs no changes to
the parse job or the annotation logic. Typecheck still reports reservation
missing, which is the registry doing its job."
```

Note: typecheck still fails at this point (reservation is unregistered). That is expected and Task 5 resolves it.

---

### Task 5: The reservation booking type

**Files:**
- Create: `lib/ai/schemas/reservation.ts`, `lib/ai/prompts/reservation.ts`, `lib/ai/booking-types/reservation.ts`
- Modify: `lib/ai/booking-types/index.ts`
- Test: `lib/ai/booking-types/__tests__/handlers.test.ts`

**Interfaces:**
- Produces: `ReservationDetailsSchema`, `ReservationExtractionSchema`, `RESERVATION_CATEGORIES`, `CATEGORY_DEFAULT_DURATION_MINUTES`, `reservationSystemPrompt`, `reservationUserPrompt`, `reservationHandler`; registry entry `reservation`.

A reservation is a single-location, point-in-time booking — a restaurant, a museum ticket, a tour. One prompt and one schema absorbs what would otherwise be four separate types.

**The design problem it creates.** `segments.endTime` is `notNull()`, but a dinner reservation rarely states an end time. The decision, from the spec:

- Extract an explicit end when the document states one.
- Otherwise derive one from a per-category default: `restaurant` 90 min, `activity` 120, `tour` 180, `attraction` 120, `other` 60.
- Record `end_is_estimated: boolean` in the stored details, so the card can render a time *range* only when the end was real. An estimated dinner shows "7:00 PM", never a fabricated "7:00 – 8:30 PM".

`end_is_estimated` is **derived, not extracted** — the model must never be asked for it. That's why the schemas are built from a shared base rather than the usual `Details.extend(...)`: the details schema and the extraction schema each add different fields to the same core.

- [ ] **Step 1: Write the failing tests**

Add to `lib/ai/booking-types/__tests__/handlers.test.ts`, plus `import { reservationHandler } from '../reservation';`:

```typescript
const validReservation = {
  name: 'Narisawa',
  category: 'restaurant',
  confirmation_code: 'RES999',
  party_size: 2,
  address: '2-6-15 Minami Aoyama, Minato-ku, Tokyo',
  phone: '+81-3-5785-0799',
  notes: 'Counter seating',
  start_iso: '2026-03-12T19:00:00+09:00',
  end_iso: null,
  timezone: 'Asia/Tokyo',
};

const resCoords = {
  startLat: '35.665500',
  startLng: '139.712400',
  endLat: '35.665500',
  endLng: '139.712400',
};

describe('reservationHandler', () => {
  it('declares its booking type and tool name', () => {
    expect(reservationHandler.bookingType).toBe('reservation');
    expect(reservationHandler.toolName).toBe('record_reservation_booking');
  });

  it('geocodes the same address for both endpoints', () => {
    const targets = reservationHandler.geocodeTargets(validReservation);
    expect(targets!.start).toBe('2-6-15 Minami Aoyama, Minato-ku, Tokyo');
    expect(targets!.start).toBe(targets!.end);
  });

  it('uses the explicit end time when the document states one', () => {
    const withEnd = { ...validReservation, end_iso: '2026-03-12T21:30:00+09:00' };
    const fields = reservationHandler.toSegmentFields(withEnd, resCoords);
    expect(fields!.endTime).toEqual(new Date('2026-03-12T21:30:00+09:00'));
  });

  it('marks an explicit end time as not estimated', () => {
    const withEnd = { ...validReservation, end_iso: '2026-03-12T21:30:00+09:00' };
    const fields = reservationHandler.toSegmentFields(withEnd, resCoords);
    expect(fields!.details).toMatchObject({ end_is_estimated: false });
  });

  it('derives a 90 minute end for a restaurant with no stated end', () => {
    const fields = reservationHandler.toSegmentFields(validReservation, resCoords);
    expect(fields!.endTime).toEqual(new Date('2026-03-12T20:30:00+09:00'));
  });

  it('derives a 3 hour end for a tour with no stated end', () => {
    const tour = { ...validReservation, category: 'tour' };
    const fields = reservationHandler.toSegmentFields(tour, resCoords);
    expect(fields!.endTime).toEqual(new Date('2026-03-12T22:00:00+09:00'));
  });

  it('marks a derived end time as estimated', () => {
    const fields = reservationHandler.toSegmentFields(validReservation, resCoords);
    expect(fields!.details).toMatchObject({ end_is_estimated: true });
  });

  it('maps the single location onto both segment endpoints', () => {
    const fields = reservationHandler.toSegmentFields(validReservation, resCoords);
    expect(fields!.type).toBe('reservation');
    expect(fields!.startTime).toEqual(new Date('2026-03-12T19:00:00+09:00'));
    expect(fields!.startTimezone).toBe('Asia/Tokyo');
    expect(fields!.endTimezone).toBe('Asia/Tokyo');
    expect(fields!.startLocation).toBe('2-6-15 Minami Aoyama, Minato-ku, Tokyo');
    expect(fields!.endLocation).toBe('2-6-15 Minami Aoyama, Minato-ku, Tokyo');
  });

  it('keeps extraction-only fields out of the stored details', () => {
    const fields = reservationHandler.toSegmentFields(validReservation, resCoords);
    const details = fields!.details as Record<string, unknown>;
    expect(details).not.toHaveProperty('start_iso');
    expect(details).not.toHaveProperty('end_iso');
    expect(details).not.toHaveProperty('timezone');
    expect(details).toMatchObject({
      name: 'Narisawa',
      category: 'restaurant',
      party_size: 2,
    });
  });

  it('rejects a category outside the allowed set', () => {
    const bad = { ...validReservation, category: 'spaceflight' };
    expect(reservationHandler.validateExtraction(bad).ok).toBe(false);
    expect(reservationHandler.toSegmentFields(bad, resCoords)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/ai/booking-types/__tests__/handlers.test.ts`
Expected: FAIL — cannot resolve `../reservation`.

- [ ] **Step 3: Write the schema**

Create `lib/ai/schemas/reservation.ts`:

```typescript
import { z } from 'zod';

export const RESERVATION_CATEGORIES = [
  'restaurant',
  'activity',
  'tour',
  'attraction',
  'other',
] as const;

export const ReservationCategorySchema = z.enum(RESERVATION_CATEGORIES);
export type ReservationCategory = z.infer<typeof ReservationCategorySchema>;

/** Used when the document states no end time. See end_is_estimated. */
export const CATEGORY_DEFAULT_DURATION_MINUTES: Record<ReservationCategory, number> = {
  restaurant: 90,
  activity: 120,
  tour: 180,
  attraction: 120,
  other: 60,
};

// Fields common to what the model extracts and what we store.
const ReservationBaseSchema = z.object({
  name: z.string(),
  category: ReservationCategorySchema,
  confirmation_code: z.string().nullable(),
  party_size: z.number().nullable(),
  address: z.string(),
  phone: z.string().nullable(),
  notes: z.string().nullable(),
});

/**
 * What we store. end_is_estimated is derived by the handler, never extracted —
 * the model is not asked whether it guessed.
 */
export const ReservationDetailsSchema = ReservationBaseSchema.extend({
  end_is_estimated: z.boolean(),
});

export type ReservationDetails = z.infer<typeof ReservationDetailsSchema>;

/** What the model returns. end_iso is null when the document states no end time. */
export const ReservationExtractionSchema = ReservationBaseSchema.extend({
  start_iso: z.string(),          // ISO 8601 with UTC offset
  end_iso: z.string().nullable(),
  timezone: z.string(),           // IANA, e.g. "Asia/Tokyo"
});

export type ReservationExtraction = z.infer<typeof ReservationExtractionSchema>;
```

- [ ] **Step 4: Write the prompt**

Create `lib/ai/prompts/reservation.ts`:

```typescript
export const reservationSystemPrompt = `You are a data extraction assistant specializing in reservation confirmations — restaurants, tours, activities, museum and attraction tickets.

For start_iso: use ISO 8601 format with the UTC offset for the local time at the venue, e.g. "2026-03-12T19:00:00+09:00". Use the standard offset for that timezone (DST approximation is acceptable).

For end_iso: only fill this in if the document actually states an end time, a finish time, or a duration you can add to the start. If it does not, use null. Do not guess — a null end time is handled correctly downstream, but an invented one is not.

For timezone: use the IANA timezone identifier for the venue's location, e.g. "Asia/Tokyo", "Europe/Rome". Never use offset strings like "UTC+9".

For category: choose the single best fit from exactly these values — "restaurant" (any dining booking), "tour" (a guided experience with a set duration), "activity" (a booked participatory experience such as a class or a dive), "attraction" (timed entry to a museum, gallery, park, or landmark), "other" (anything else).

For name: the venue or experience name as a traveller would recognise it, e.g. "Narisawa", "teamLab Planets", "Vatican Museums Early Access Tour".

For address: a geocodable street address for the venue. This is used for map lookup, so include city and country when the document gives them.

For notes: only genuinely useful practical details the traveller would want at a glance — seating, dress code, what to bring, where to meet. Not marketing copy, not cancellation policy boilerplate. Use null if there is nothing worth carrying.

All nullable fields must be null (not empty string) when the information is absent.`;

export function reservationUserPrompt(fileName: string): string {
  return `Extract all reservation details from this confirmation document: ${fileName}`;
}
```

- [ ] **Step 5: Write the handler**

Create `lib/ai/booking-types/reservation.ts`:

```typescript
import type Anthropic from '@anthropic-ai/sdk';
import {
  ReservationExtractionSchema,
  ReservationDetailsSchema,
  CATEGORY_DEFAULT_DURATION_MINUTES,
} from '@/lib/ai/schemas/reservation';
import { reservationSystemPrompt, reservationUserPrompt } from '@/lib/ai/prompts/reservation';
import type { BookingTypeHandler, Coords, GeocodeTargets, SegmentFields } from './types';

export const reservationHandler: BookingTypeHandler = {
  bookingType: 'reservation',
  toolName: 'record_reservation_booking',
  toolDescription: 'Record reservation details',
  classifierDescription:
    'a reservation confirmation for a restaurant, tour, activity, or attraction',
  pluralLabel: 'reservations',
  systemPrompt: reservationSystemPrompt,
  userPrompt: reservationUserPrompt,

  inputJsonSchema: () =>
    ReservationExtractionSchema.toJSONSchema() as Anthropic.Tool['input_schema'],

  validateExtraction: (raw: unknown) => {
    const parsed = ReservationExtractionSchema.safeParse(raw);
    return parsed.success ? { ok: true } : { ok: false, error: parsed.error.message };
  },

  // A reservation has one location. The job geocodes once when start === end.
  geocodeTargets: (raw: unknown): GeocodeTargets | null => {
    const parsed = ReservationExtractionSchema.safeParse(raw);
    if (!parsed.success) return null;
    return { start: parsed.data.address, end: parsed.data.address };
  },

  toSegmentFields: (raw: unknown, coords: Coords): SegmentFields | null => {
    const parsed = ReservationExtractionSchema.safeParse(raw);
    if (!parsed.success) return null;
    const data = parsed.data;

    const startTime = new Date(data.start_iso);
    // The document rarely states an end. Derive one so gap and distance
    // annotations have something honest to measure from, and record that we did.
    const endIsEstimated = data.end_iso === null;
    const endTime = endIsEstimated
      ? new Date(
          startTime.getTime() + CATEGORY_DEFAULT_DURATION_MINUTES[data.category] * 60_000,
        )
      : new Date(data.end_iso);

    return {
      type: 'reservation',
      startTime,
      startTimezone: data.timezone,
      endTime,
      endTimezone: data.timezone,
      startLocation: data.address,
      startLat: coords.startLat,
      startLng: coords.startLng,
      endLocation: data.address,
      endLat: coords.endLat,
      endLng: coords.endLng,
      details: ReservationDetailsSchema.parse({ ...data, end_is_estimated: endIsEstimated }),
    };
  },
};
```

`ReservationDetailsSchema.parse({ ...data, end_is_estimated })` strips `start_iso`, `end_iso`, and `timezone` the same way the other handlers strip their extraction-only fields.

- [ ] **Step 6: Register it**

In `lib/ai/booking-types/index.ts`, add `import { reservationHandler } from './reservation';` and the entry `reservation: reservationHandler,`.

- [ ] **Step 7: Add the two round-trip property tests**

These are 7B's deferred item 4, and they only become meaningful now that every handler exists. Both guard invariants the parse job silently depends on. Add to `lib/ai/booking-types/__tests__/registry.test.ts`, inside the `describe('bookingTypeHandlers', …)` block:

```typescript
  it('never accepts an extraction it cannot then map to segment fields', () => {
    // The parse job validates in the extract step and maps in the write step.
    // If those two ever disagree, a booking is marked failed after its raw output
    // was already stored — the write step's failure branch exists only for that.
    const samples: Record<string, unknown> = {
      flight: validFlight,
      hotel: validHotel,
      train: validTrain,
      reservation: validReservation,
    };
    const coordsAllNull = {
      startLat: null,
      startLng: null,
      endLat: null,
      endLng: null,
    };
    for (const [key, handler] of Object.entries(bookingTypeHandlers)) {
      const sample = samples[key];
      expect(sample, `no sample extraction for handler "${key}"`).toBeDefined();
      expect(handler.validateExtraction(sample)).toEqual({ ok: true });
      expect(handler.toSegmentFields(sample, coordsAllNull)).not.toBeNull();
    }
  });

  it('returns identical geocode targets exactly for single-location types', () => {
    // The parse job geocodes once when start === end. A one-location handler that
    // returned two different strings for the same place would silently double
    // Mapbox calls against a metered free tier.
    const singleLocation = new Set(['hotel', 'reservation']);
    const samples: Record<string, unknown> = {
      flight: validFlight,
      hotel: validHotel,
      train: validTrain,
      reservation: validReservation,
    };
    for (const [key, handler] of Object.entries(bookingTypeHandlers)) {
      const targets = handler.geocodeTargets(samples[key]);
      expect(targets).not.toBeNull();
      if (singleLocation.has(key)) {
        expect(targets!.start, `${key} should geocode one location`).toBe(targets!.end);
      } else {
        expect(targets!.start, `${key} should geocode two locations`).not.toBe(targets!.end);
      }
    }
  });
```

This needs the four sample extractions. Rather than duplicating them, extract them into a shared test fixture: create `lib/ai/booking-types/__tests__/fixtures.ts` exporting `validFlight`, `validHotel`, `validTrain`, `validReservation`, and the `coords` objects, then import from it in **both** `handlers.test.ts` and `registry.test.ts`, deleting the now-duplicated const declarations from `handlers.test.ts`. Keep the values byte-identical to what the handler tests already assert against.

- [ ] **Step 8: Verify the registry is complete again**

```bash
npm run typecheck && npm run lint && npx vitest run
```

Expected: **all clean.** Typecheck passing again is the signal that both enum values now have handlers.

Test count should be **72**. The arithmetic: 47 at the end of 7B, then Task 1 adds 4 and deletes 1 (the now-empty `'validates raw tool input'` block) → 50; Task 2 adds 4 → 54; Task 4 adds 5 → 59; this task adds 11 handler tests and 2 property tests → 72. If your number differs, work out why and say so in your report rather than adjusting the expectation.

- [ ] **Step 9: Commit**

```bash
git add lib/ai/schemas/reservation.ts lib/ai/prompts/reservation.ts lib/ai/booking-types
git commit -m "feat: add the reservation booking type

One schema covers restaurants, tours, activities, and attractions via a category
field, rather than four near-identical types each needing its own prompt tuned.

segments.endTime is notNull but a dinner booking rarely states an end, so the
handler derives one from a per-category default and records end_is_estimated in
the details. The estimate exists so gap and distance annotations have something
honest to measure; the card will render a range only when the end was real.
end_is_estimated is derived, never extracted — the model is not asked whether it
guessed."
```

---

### Task 6: Cards for the new types

**Files:**
- Create: `components/itinerary/TrainCard.tsx`, `components/itinerary/ReservationCard.tsx`
- Modify: `components/itinerary/DaySection.tsx`

**Interfaces:**
- Consumes: `TrainDetailsSchema`, `ReservationDetailsSchema`.
- Produces: `TrainCard`, `ReservationCard`; `DaySection` dispatches by `segment.type` through a lookup.

Read `components/itinerary/FlightCard.tsx` and `HotelCard.tsx` first. Match their structure exactly: a bordered card, an uppercase type label with a glyph, an optional confirmation code top-right, a body, and a footer of muted detail chips. Each also has a `safeParse` fallback that renders a minimal card when details don't match — keep that pattern; the new cards need it too.

`TrainCard` mirrors `FlightCard`'s route layout but uses station names rather than three-letter codes, so it cannot reuse the giant-monospace-code treatment. Use the station name at a readable size.

`ReservationCard` renders a time **range only when `end_is_estimated` is false**. When it's true, show the start time alone. This is the whole point of the flag — do not render an estimated end as though it were extracted.

**Do not use the frontend-design skill's full workflow here.** These two cards must match two existing components exactly; inventing a new visual language for them would make the timeline inconsistent. Copy the established pattern.

- [ ] **Step 1: Create `TrainCard`**

```tsx
import { DateTime } from 'luxon';
import { TrainDetailsSchema } from '@/lib/ai/schemas/train';
import type { Segment } from '@/lib/db/schema';

function fmt(dt: DateTime, pattern: string): string {
  return dt.isValid ? dt.toFormat(pattern) : '—';
}

export function TrainCard({ segment }: { segment: Segment }) {
  const details = TrainDetailsSchema.safeParse(segment.details);
  const dep = DateTime.fromJSDate(segment.startTime, { zone: segment.startTimezone });
  const arr = DateTime.fromJSDate(segment.endTime, { zone: segment.endTimezone });
  const durationMins =
    dep.isValid && arr.isValid ? Math.round(arr.diff(dep, 'minutes').minutes) : null;
  const durationStr =
    durationMins != null
      ? durationMins % 60 > 0
        ? `${Math.floor(durationMins / 60)}h ${durationMins % 60}m`
        : `${Math.floor(durationMins / 60)}h`
      : '—';

  if (!details.success) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">🚄 Train</p>
        <p className="text-sm text-muted-foreground">Parsed</p>
      </div>
    );
  }

  const d = details.data;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">🚄 Train</span>
        {d.confirmation_code && (
          <span className="text-xs text-muted-foreground">Conf: {d.confirmation_code}</span>
        )}
      </div>

      <div className="mb-3 flex items-center">
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-semibold tracking-tight">
            {d.departure_station}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">{fmt(dep, 'HH:mm')}</div>
          <div className="text-xs text-muted-foreground">{fmt(dep, 'EEE MMM d')}</div>
        </div>
        <div className="flex flex-col items-center px-3">
          <div className="mb-1 whitespace-nowrap text-xs text-muted-foreground">
            {durationStr}
          </div>
          <div className="relative w-12">
            <div className="h-px w-full bg-border" />
            <span className="absolute -right-1 -top-[5px] text-xs text-muted-foreground">▶</span>
          </div>
        </div>
        <div className="min-w-0 flex-1 text-right">
          <div className="truncate text-lg font-semibold tracking-tight">{d.arrival_station}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{fmt(arr, 'HH:mm')}</div>
          <div className="text-xs text-muted-foreground">{fmt(arr, 'EEE MMM d')}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 border-t border-border pt-3 text-xs text-muted-foreground">
        <span>{d.operator}</span>
        <span>{d.train_number}</span>
        {d.coach && <span>Coach {d.coach}</span>}
        {d.seat && <span>Seat {d.seat}</span>}
        {d.travel_class && <span>{d.travel_class}</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `ReservationCard`**

```tsx
import { DateTime } from 'luxon';
import { ReservationDetailsSchema } from '@/lib/ai/schemas/reservation';
import type { Segment } from '@/lib/db/schema';

const CATEGORY_LABEL: Record<string, string> = {
  restaurant: '🍽 Restaurant',
  activity: '🎟 Activity',
  tour: '🧭 Tour',
  attraction: '🎫 Attraction',
  other: '📌 Reservation',
};

export function ReservationCard({ segment }: { segment: Segment }) {
  const details = ReservationDetailsSchema.safeParse(segment.details);
  const start = DateTime.fromJSDate(segment.startTime, { zone: segment.startTimezone });
  const end = DateTime.fromJSDate(segment.endTime, { zone: segment.endTimezone });

  if (!details.success) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
          📌 Reservation
        </p>
        <p className="text-sm text-muted-foreground">Parsed</p>
      </div>
    );
  }

  const d = details.data;
  const label = CATEGORY_LABEL[d.category] ?? CATEGORY_LABEL.other;

  // Only show a range when the document actually gave us an end time.
  const timeStr = d.end_is_estimated
    ? start.isValid
      ? start.toFormat('HH:mm')
      : '—'
    : start.isValid && end.isValid
      ? `${start.toFormat('HH:mm')} – ${end.toFormat('HH:mm')}`
      : '—';

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
        {d.confirmation_code && (
          <span className="text-xs text-muted-foreground">Conf: {d.confirmation_code}</span>
        )}
      </div>

      <div className="mb-1 text-xl font-semibold">{d.name}</div>
      <div className="mb-3 text-sm font-medium">
        {timeStr}
        {d.party_size != null && (
          <span className="text-muted-foreground">
            {' '}
            · {d.party_size} {d.party_size === 1 ? 'guest' : 'guests'}
          </span>
        )}
      </div>

      {d.notes && <p className="mb-3 text-xs text-muted-foreground">{d.notes}</p>}

      <div className="flex flex-wrap gap-3 border-t border-border pt-3 text-xs text-muted-foreground">
        <span className="truncate">{d.address}</span>
        {d.phone && <span className="whitespace-nowrap">{d.phone}</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Dispatch by segment type in `DaySection`**

`DaySection.tsx` currently uses a binary ternary — `segment.type === 'flight' ? <FlightCard/> : <HotelCard/>` — which would render a reservation as a hotel. Replace the imports and that expression:

```tsx
import type { ComponentType } from 'react';
import type { DayGroup } from '@/lib/itinerary/types';
import type { Segment, SegmentType } from '@/lib/db/schema';
import { FlightCard } from './FlightCard';
import { HotelCard } from './HotelCard';
import { TrainCard } from './TrainCard';
import { ReservationCard } from './ReservationCard';
import { AnnotationPill } from './AnnotationPill';
import { SegmentWrapper } from './SegmentWrapper';

const CARD_BY_SEGMENT_TYPE: Record<SegmentType, ComponentType<{ segment: Segment }>> = {
  flight: FlightCard,
  hotel_stay: HotelCard,
  train_ride: TrainCard,
  reservation: ReservationCard,
};
```

and inside the map:

```tsx
      {day.segments.map((segment, i) => {
        const Card = CARD_BY_SEGMENT_TYPE[segment.type];
        return (
          <div key={segment.id}>
            <SegmentWrapper segmentId={segment.id}>
              <Card segment={segment} />
            </SegmentWrapper>
            {day.annotations[i] && <AnnotationPill annotation={day.annotations[i]!} />}
          </div>
        );
      })}
```

Typing the lookup `Record<SegmentType, …>` means a future segment type without a card is a compile error, matching how the handler registry works.

- [ ] **Step 4: Verify**

```bash
npm run typecheck && npm run lint && npx vitest run
```

Do not start a dev server — visual verification is the human partner's step.

- [ ] **Step 5: Commit**

```bash
git add components/itinerary/TrainCard.tsx components/itinerary/ReservationCard.tsx components/itinerary/DaySection.tsx
git commit -m "feat: add train and reservation cards to the itinerary timeline

DaySection dispatched with a binary ternary that fell through to HotelCard, so a
reservation would have rendered as a hotel. Now a Record<SegmentType, …> lookup,
which makes a future type without a card a compile error.

ReservationCard shows a time range only when end_is_estimated is false — an
estimated end exists for annotation math and is never displayed as though the
document stated it."
```

---

### Task 7: Map markers and the bookings panel

**Files:**
- Modify: `components/itinerary/TripMap.tsx`, `components/trips/BookingCard.tsx`

`TripMap` branches on `seg.type === 'flight'` to draw two markers plus a connecting line, else one marker, and `makeMarkerEl` is typed `'flight' | 'hotel'`. A train needs the two-marker treatment; a reservation needs the single-marker one. `BookingCard`'s `ParsedLine` similarly only knows flights and hotels, so a parsed train would show a bare "✓ Parsed" in the bookings panel.

Read both files before editing. `TripMap` is a client component using Mapbox GL JS directly — keep its existing structure and only widen the type handling.

- [ ] **Step 1: Replace `makeMarkerEl` with a three-kind version**

At the bottom of `components/itinerary/TripMap.tsx`, replace the whole `makeMarkerEl` function:

```typescript
type MarkerKind = 'transit' | 'stay' | 'reservation';

const MARKER_COLOR: Record<MarkerKind, string> = {
  transit: '#3b82f6',
  stay: '#a855f7',
  reservation: '#f59e0b',
};

function makeMarkerEl(kind: MarkerKind): { container: HTMLElement; dot: HTMLElement } {
  // container: Mapbox owns its transform for positioning — never touch it
  const container = document.createElement('div');
  container.style.cssText = 'width:14px;height:14px;display:flex;align-items:center;justify-content:center;';
  // dot: we own its transform for hover scaling
  const dot = document.createElement('div');
  dot.style.cssText = [
    'width: 14px',
    'height: 14px',
    'border-radius: 50%',
    'border: 2px solid #09090b',
    `background: ${MARKER_COLOR[kind]}`,
    'transition: transform 150ms ease, box-shadow 150ms ease',
    'cursor: default',
  ].join(';');
  container.appendChild(dot);
  return { container, dot };
}
```

The colours are unchanged for the two existing kinds — blue for transit, purple for stays — with amber added for reservations.

- [ ] **Step 2: Give trains the two-marker treatment**

In the same file, replace the `for (const seg of segments) { … }` body's marker block. The existing `if (seg.type === 'flight') { … } else { … }` becomes:

```typescript
      const isTransit = seg.type === 'flight' || seg.type === 'train_ride';

      if (isTransit) {
        if (startLat != null && startLng != null) {
          const { container, dot } = makeMarkerEl('transit');
          const marker = new mapboxgl.Marker({ element: container })
            .setLngLat([startLng, startLat])
            .addTo(m);
          markersRef.current.set(`${seg.id}::start`, { marker, el: dot });
          coords.push([startLng, startLat]);
        }
        if (endLat != null && endLng != null) {
          const { container, dot } = makeMarkerEl('transit');
          const marker = new mapboxgl.Marker({ element: container })
            .setLngLat([endLng, endLat])
            .addTo(m);
          markersRef.current.set(`${seg.id}::end`, { marker, el: dot });
          coords.push([endLng, endLat]);
        }
      } else {
        // hotel_stay and reservation: a single pin at startLat/startLng
        if (startLat != null && startLng != null) {
          const { container, dot } = makeMarkerEl(
            seg.type === 'reservation' ? 'reservation' : 'stay',
          );
          const marker = new mapboxgl.Marker({ element: container })
            .setLngLat([startLng, startLat])
            .addTo(m);
          markersRef.current.set(`${seg.id}::point`, { marker, el: dot });
          coords.push([startLng, startLat]);
        }
      }
```

Two notes. The connecting-line rendering below this loop is unchanged and now applies to trains as well as flights, which is correct. The single-pin key changes from `::hotel` to `::point` because reservations use this branch too — safe, because the hover sync consumes keys via `key.split('::')[0]` and never reads the suffix. **Update the comment on the `markersRef` declaration** to match:

```typescript
  // keys: "${segmentId}::start" | "${segmentId}::end" | "${segmentId}::point"
```

- [ ] **Step 3: Add panel summary lines for the new types**

In `components/trips/BookingCard.tsx`, add the two schema imports beside the existing ones:

```typescript
import { TrainDetailsSchema } from '@/lib/ai/schemas/train';
import { ReservationDetailsSchema } from '@/lib/ai/schemas/reservation';
```

Then in `ParsedLine`, add these two branches after the existing `hotel_stay` branch and before the final `return`:

```tsx
  if (segment.type === 'train_ride') {
    const parsed = TrainDetailsSchema.safeParse(segment.details);
    if (!parsed.success) return <p className="text-xs text-emerald-500">✓ Parsed</p>;
    const details = parsed.data;
    const depTime = formatLocalTime(new Date(segment.startTime), segment.startTimezone);
    const arrTime = formatLocalTime(new Date(segment.endTime), segment.endTimezone);
    return (
      <div className="text-xs text-muted-foreground space-y-0.5 mt-0.5">
        <p className="font-medium text-foreground">
          {details.departure_station} → {details.arrival_station}
        </p>
        <p>
          {details.train_number} · {details.operator}
        </p>
        <p>
          {depTime} → {arrTime}
        </p>
      </div>
    );
  }

  if (segment.type === 'reservation') {
    const parsed = ReservationDetailsSchema.safeParse(segment.details);
    if (!parsed.success) return <p className="text-xs text-emerald-500">✓ Parsed</p>;
    const details = parsed.data;
    const date = formatLocalDate(new Date(segment.startTime), segment.startTimezone);
    const time = formatLocalTime(new Date(segment.startTime), segment.startTimezone);
    return (
      <div className="text-xs text-muted-foreground space-y-0.5 mt-0.5">
        <p className="font-medium text-foreground">{details.name}</p>
        <p>
          {date} · {time}
        </p>
        <p className="truncate">{details.address}</p>
      </div>
    );
  }
```

`formatLocalDate` and `formatLocalTime` already exist at the top of this file. Do not restructure the rest of it.

Note the reservation line shows only the start time, consistent with `ReservationCard` — the panel should not display an estimated end either.

- [ ] **Step 4: Update the booking-type icon map**

Still in `components/trips/BookingCard.tsx`, the `typeIcon` record is keyed by *booking* type (not segment type) and currently has `flight`, `hotel`, `unknown`. Add the two new booking types so a train doesn't fall back to the generic document glyph:

```typescript
const typeIcon: Record<string, string> = {
  flight: '✈',
  hotel: '🏨',
  train: '🚄',
  reservation: '📌',
  unknown: '📄',
};
```

- [ ] **Step 3: Verify**

```bash
npm run typecheck && npm run lint && npx vitest run
```

- [ ] **Step 4: Commit**

```bash
git add components/itinerary/TripMap.tsx components/trips/BookingCard.tsx
git commit -m "feat: show trains and reservations on the map and in the bookings panel

The map drew two markers and a connecting line only for flights, and one marker
for everything else; trains now get the transit treatment they need and
reservations get their own marker colour. The bookings panel showed a bare
'Parsed' for anything that wasn't a flight or hotel."
```

---

## Final verification

- [ ] `npm run typecheck` — clean
- [ ] `npm run lint` — clean
- [ ] `npx vitest run` — all passing (expect 72; reconcile any difference rather than adjusting the expectation)
- [ ] `git diff <merge-base> -- lib/ai/prompts/flight.ts lib/ai/prompts/hotel.ts lib/ai/schemas/flight.ts lib/ai/schemas/hotel.ts` is **empty** — flight and hotel parsing must be untouched by this phase
- [ ] Migration applied and `drizzle/` contains the generated file
- [ ] Manual end-to-end (human partner), with `npm run dev` and `npx inngest-cli@latest dev`:
  - A real **train** confirmation parses, lands on the timeline, and shows two map markers with a line between them
  - A real **restaurant** confirmation parses, shows a start time with no fabricated end, and one amber map marker
  - A real **flight** and **hotel** still parse exactly as before — this is the regression check that matters
  - The two new prompts will likely need tuning against real documents; that is expected work, not a defect
