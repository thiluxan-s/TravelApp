# Phase 7 — Booking Types, Calendar Export, Failure Recovery: Design Spec

**Date:** 2026-07-28
**Status:** Approved
**Phase doc:** none — this phase was scoped directly from a post-ship review

---

## Goal

Make Wayfare usable on a real trip. Three things stand between the shipped app and that:

1. It only understands flights and hotels, so the itinerary is never the complete picture.
2. The itinerary can't leave the browser, which is where you need it least while travelling.
3. When a parse fails, the user is told nothing at all.

This phase closes all three.

---

## Context — what the post-ship review found

The app shipped all six phases and works. The review surfaced four defects, one already fixed.

**Fixed ahead of this phase (commit `5c91f8b`, branch `fix-within-day-segment-ordering`):**
`groupSegmentsByDay` bucketed segments by local date but preserved insertion order within each bucket. Callers build the list with `trip.bookings.flatMap((b) => b.segments)` and bookings are ordered by `createdAt`, so a booking uploaded out of chronological order rendered its day backwards and made `computeAnnotations` emit a false "These bookings overlap in time" conflict. Pulled out as a standalone bugfix because it is independent of this phase's features and would only have been buried inside them.

**Addressed by this phase:**

- **Multi-day stays vanish.** Segments are keyed to their start day only, so a 3-night hotel appears on the check-in day and nowhere else. Days with no segment starting on them produce no `DayGroup` at all.
- **Parse failures are invisible.** Traced end to end: `BookingUploader` closes the dialog as soon as status flips to `parsing`; `ParsingBanner` filters for `uploading | parsing` only, so on failure its count drops to zero and the banner disappears; `ItineraryTimeline` renders from segments and a failed booking has none. `BookingCard.tsx` is the only component that reads `booking.parseError` and it is **imported nowhere** — dead code. `parseError` is written in four places in `parse-booking.ts` and displayed in zero. If every booking fails, the timeline falls through to its "No bookings yet" empty state, telling the user they haven't uploaded the file they just uploaded.
- **`parse-booking.ts` branches on type in three places.** The extract, geocode, and write steps each carry their own `isHotel` conditional, with two near-identical `createSegment` calls. Adding two types turns each into a four-way branch.

`trips.startDate` / `trips.endDate` are also dead columns — nothing writes them and no trip-edit action exists. Out of scope here; noted so it isn't rediscovered.

---

## What we decided and why

### Two new booking types, not five

`train` and `reservation`, chosen to cover the most real-world surface for the least prompt-tuning risk.

**`train`** is structurally a flight: origin → destination, operator, number, coach/seat, two timezones, two geocoded endpoints. It reuses the transit card shape and needs no changes to the distance or gap logic in `computeAnnotations`.

**`reservation`** is a single-location, point-in-time booking carrying a `category` field (`restaurant | activity | tour | attraction | other`). One prompt and one schema absorbs what would otherwise be four separate types, each with its own tuning burden.

### Reservation end times are estimated, and say so

`segments.endTime` is `notNull()`, but a dinner reservation rarely states an end time. Three options were considered:

- Make `endTime` nullable — ripples into `computeAnnotations`, `groupSegmentsByDay`, the map, and the `.ics` export. Rejected: too much blast radius on shipped code for one field.
- End = start (zero duration) — rejected because it silently corrupts the headline feature. "15 minutes between dinner and your train" would be measured from when dinner *starts*. A wrong annotation is worse than no annotation.
- **Chosen:** extract an explicit end when the document states one, otherwise fall back to a per-category default.

Defaults: `restaurant` 90 min, `activity` 2 h, `tour` 3 h, `attraction` 2 h, `other` 1 h.

To stay on the right side of the "don't generate placeholder data" rule, the details JSON carries `end_is_estimated: boolean`. The estimate feeds annotation and calendar math; the **card renders a time range only when the end was explicit**. An estimated dinner displays "7:00 PM", never a fabricated "7:00 – 8:30 PM".

### Per-type handler registry

`parse-booking.ts` becomes type-agnostic. Each booking type gets one file under `lib/ai/booking-types/` exporting its prompts, schemas, geocode targets, and segment mapper. The Inngest function looks up one handler and runs the same four steps for every type.

This is a deliberate refactor of shipped, working code. It is justified because this phase adds exactly the types that break the current shape, and adding a fifth type later becomes one file plus one registry entry with no orchestration changes. The classifier and `DaySection`'s card dispatch both read from the same registry, so one place knows the set of booking types.

**`CLAUDE.md` must be updated:** it currently states prompts live in `lib/ai/prompts/` with each file exporting `{ systemPrompt, userPromptTemplate, outputSchema }`. The registry supersedes that, and leaving the line as-is would contradict the code.

### Lodging on covered days

Derived at render time, never stored — the itinerary is derived, not stored (`ARCHITECTURE.md`). `DayGroup` gains `lodging: Segment | null`, populated by finding any `hotel_stay` whose interval covers that date.

Kept deliberately **out of** the `segments` array. If lodging were a regular member, every middle day would pair it with that day's real events and report a bogus gap between dinner and a hotel that started two days ago.

Because a day with only lodging currently produces no `DayGroup` at all, `groupSegmentsByDay` must also **create day groups for otherwise-empty days covered by a stay**. Without that, the feature does nothing on exactly the days that need it. Synthetic per-night segment rows were rejected: they duplicate data and break the one-booking-one-segment invariant.

### Calendar export: download, not a live feed

A subscribable `webcal://` feed that stays in sync as bookings are added is more useful mid-trip, but it needs a token column, an unauthenticated endpoint, and revocation UI — which is most of the deferred share-link feature. Download-only needs no schema change and no new auth surface. The feed can ride along with share links later.

**Times are emitted in UTC** (`DTSTART:20260310T080000Z`) rather than hand-rolled `VTIMEZONE` blocks. We store `timestamptz`, so UTC is exact, and clients render in the viewer's local time. Hand-writing VTIMEZONE definitions with DST rules is a real source of subtle bugs for no user-visible gain.

**Hotels emit two point events** — check-in and check-out — rather than one multi-day block that would sit on top of everything else in a phone's day view.

**No new dependency.** The serializer is a pure function over segments (~60 lines: VCALENDAR wrapper, VEVENT blocks, 75-octet line folding, escaping). Good TDD surface and avoids a dependency ask.

### Failure surface before failure recovery

The gap is not a missing retry button — it is that failures have nowhere to appear. Build the surface first, then hang recovery on it.

---

## Architecture

### Data model changes

One additive migration:

```
bookingTypeEnum: + 'train', + 'reservation'
segmentTypeEnum: + 'train_ride', + 'reservation'
```

Segment-type naming follows the existing `hotel` → `hotel_stay` convention.

**Migration risk to verify, not assume:** `ALTER TYPE ... ADD VALUE` has historically been illegal inside a transaction block, and Drizzle wraps migrations in one. On Neon's Postgres version it is permitted provided the new value is not *used* in the same transaction, which ours is not. Inspect the generated SQL before applying.

No column changes. `details` is `jsonb`, so new types need no schema work beyond the enums.

### Handler registry

```
lib/ai/booking-types/
  index.ts          // registry: Record<BookingType, BookingTypeHandler>
  flight.ts         // composes existing prompts/flight.ts + schemas/flight.ts
  hotel.ts          // composes existing prompts/hotel.ts + schemas/hotel.ts
  train.ts          // new, with new prompts/train.ts + schemas/train.ts
  reservation.ts    // new, with new prompts/ + schemas/ files
```

**`lib/ai/prompts/` and `lib/ai/schemas/` stay where they are.** The registry composes them; it does not absorb them. This is not optional — `lib/itinerary/compute-annotations.ts` and `components/trips/BookingCard.tsx` both import `HotelDetailsSchema` from `@/lib/ai/schemas/hotel`, and the details schemas are used for rendering well outside the parsing pipeline. Moving them would ripple into unrelated code for no benefit.

```ts
type BookingTypeHandler<TExtraction> = {
  bookingType: BookingType;        // 'flight'
  segmentType: SegmentType;        // 'flight'
  toolName: string;                // 'record_flight_booking'
  systemPrompt: string;
  userPrompt: (fileName: string) => string;
  extractionSchema: ZodType<TExtraction>;
  detailsSchema: ZodType<unknown>;
  geocodeTargets: (d: TExtraction) => { start: string; end: string };
  toSegment: (d: TExtraction, coords: Coords) => SegmentFields;
};
```

`parse-booking.ts` after the refactor:

```
classify  → handler = registry[bookingType]
extract   → handler.extractionSchema / systemPrompt / toolName   (no branching)
geocode   → handler.geocodeTargets(data)                          (no branching)
write     → handler.toSegment(data, coords)                       (no branching)
```

The classifier's hardcoded `raw === 'flight' ? ... : raw === 'hotel' ? ...` ladder is replaced by a lookup against the registry keys, and its system prompt is generated from the registry so the two cannot drift.

### New schemas

```ts
TrainDetailsSchema = {
  train_number, operator, confirmation_code: nullable,
  departure_station, arrival_station,
  coach: nullable, seat: nullable, travel_class: nullable
}
TrainExtractionSchema = TrainDetailsSchema.extend({
  departure_iso, departure_timezone, arrival_iso, arrival_timezone,
  departure_station_label, arrival_station_label
})

ReservationDetailsSchema = {
  name, category, confirmation_code: nullable,
  party_size: nullable, address, phone: nullable,
  notes: nullable, end_is_estimated: boolean
}
ReservationExtractionSchema = ReservationDetailsSchema.extend({
  start_iso, end_iso: nullable, timezone
})
```

Reservations geocode `address` for both endpoints, mirroring how hotels already collapse to a single point.

### Itinerary changes

```
DayGroup = { date, label, segments, annotations, lodging: Segment | null }
```

`groupSegmentsByDay` gains two responsibilities: resolve lodging per date, and emit day groups for dates covered by a stay that have no segments of their own.

`DaySection`'s `flight ? FlightCard : HotelCard` ternary is replaced by a card lookup keyed on `segment.type`. New `TrainCard` and `ReservationCard` join the existing two. Lodging renders as a quiet footer below the day's events.

### Calendar export

```
app/(app)/trips/[tripId]/calendar.ics/route.ts   // Clerk-authed, verifies trip ownership
lib/itinerary/to-ics.ts                          // pure: Segment[] -> string
```

Event mapping — flight and train: one event each. Hotel: two point events (`{segmentId}-checkin`, `{segmentId}-checkout`). Reservation: one event using the estimated end. UIDs are derived from segment ids so re-import updates rather than duplicates.

### Failure surface and recovery

- **Bookings panel on the trip page** listing every booking with status. Wires up the already-written, currently-unused `BookingCard`.
- **`ParsingBanner` gains a failed state** instead of vanishing — "1 booking couldn't be read," linking to the panel.
- **`ItineraryTimeline` empty state becomes status-aware.** "No bookings yet" and "your bookings couldn't be read" are different situations and must not share copy.
- **`retryBookingParseAction`** — verify ownership, require status `parsing_failed`, clear `parseError`, flip to `parsing`, re-send `booking/uploaded`. File is already in R2, so no re-upload. **Deletes any existing segments for the booking first:** `segmentExistsForBooking` guards double-writes on Inngest's own retries and would otherwise make a manual retry a silent no-op.
- **`deleteBookingAction`** — mirrors `deleteTripAction`: verify ownership, delete the R2 object, delete the row, segments cascade.

---

## Sequencing

This spec covers four loosely-coupled bodies of work. The implementation plan should stage them so each is independently shippable, in this order:

1. **Failure surface + recovery** — no new types involved, fixes a live user-visible hole, and gives the later stages somewhere to show their errors.
2. **Registry refactor** — pure refactor of flight and hotel with no behaviour change, so the existing tests are the safety net. Must land before new types, not alongside them.
3. **`train` and `reservation`** — enums, migration, schemas, prompts, cards, plus the lodging change to `groupSegmentsByDay`.
4. **Calendar export** — depends on the full set of segment types existing so `to-ics.ts` is written once.

---

## Testing

TDD throughout, per the existing pattern in `lib/itinerary/__tests__/`.

Pure functions, unit tested:

- `groupSegmentsByDay` — lodging resolution across covered days; empty days created for covered dates; lodging excluded from annotation pairing; a day with only lodging.
- `to-ics.ts` — one case per segment type; hotel producing two events; line folding past 75 octets; escaping commas/semicolons/newlines; stable UIDs across two calls.
- Reservation end-time fallback — explicit end honoured; per-category defaults applied; `end_is_estimated` set correctly in both cases.
- Registry — every `BookingType` (except `unknown`) resolves to a handler, so a type added to the enum without a handler fails a test rather than failing at runtime.

Manual verification: real train and restaurant confirmation PDFs through the full pipeline; a deliberately unparseable file to confirm the failure surface; retry and delete on a failed booking; import the `.ics` into a phone calendar and confirm times land correctly across timezones.

---

## Out of scope

- Live `webcal://` subscription feed
- Trip sharing / public read-only links
- Manual editing of parsed segment fields — parsing quality is not the current bottleneck
- Trip edit and the dead `startDate` / `endDate` columns
- Additional booking types beyond `train` and `reservation`
- README refresh — stale (still lists Phases 2–5 as remaining, demo URL is a placeholder), worth its own pass

---

## Definition of done

1. `npm run typecheck` and `npm run lint` clean.
2. All tests pass, including new ones.
3. Migration generated, SQL inspected for the `ALTER TYPE` transaction concern, and applied.
4. A real train PDF and a real restaurant PDF parse end to end and land on the timeline and the map.
5. A failed parse is visible in the UI, with working retry and delete.
6. `.ics` downloads and imports into a phone calendar with correct times.
7. `CLAUDE.md` prompt-convention section updated to describe the registry.
