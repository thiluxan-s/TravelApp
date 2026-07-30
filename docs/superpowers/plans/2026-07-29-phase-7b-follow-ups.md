# Phase 7B — Deferred Follow-Ups

Findings from the Phase 7B reviews that were deliberately not fixed there, because fixing them would have meant a user-facing behavior change on a branch whose entire claim was "pure refactor." Do these in Phase 7C **before** adding `train` or `reservation` — each is cheaper now than after two more handlers copy the pattern.

---

## 1. The unidentified-document message still enumerates the type set

`lib/inngest/functions/parse-booking.ts`, classify step:

```
parseError: "We couldn't identify this document as a flight or hotel booking."
```

A `TODO(7C)` marker sits above that line. Once `train` and `reservation` exist, a user whose restaurant confirmation fails classification is told the app only reads flights and hotels.

Fix: generate it from the registry the way `buildClassifierSystemPrompt()` already is — a `buildUnidentifiedDocumentMessage()` beside it in `lib/ai/booking-types/index.ts`. This is also what makes `CLAUDE.md`'s claim about the parse job needing no changes fully true rather than nearly true.

## 2. `isValidExtraction` throws away the only diagnostic

The contract is `isValidExtraction: (raw: unknown) => boolean`. The `ZodError` is created inside the handler and discarded, so the job can never recover why validation failed.

Before the refactor the job held `parsed.error` at the failure site. Nothing regressed — the user-facing message was already generic — but `CLAUDE.md`'s own AI convention says *"If validation fails, mark the booking `parsing_failed` with the validation error stored"*, and the codebase has never actually met it.

Fix: widen to `validateExtraction: (raw: unknown) => { ok: true } | { ok: false; error: string }`, with the job storing the message alongside the friendly copy. Four call sites today, six after 7C.

## 3. UI copy has the same drift

`components/itinerary/ItineraryTimeline.tsx` — the `no-bookings` empty state says "Upload a flight or hotel confirmation PDF to build your itinerary." Same drift class as item 1, in the UI rather than the job. Pre-existing and outside 7B's diff.

## 4. Two handler round-trip property tests worth having

Both are pure functions over the handlers, need no I/O, and either one failing is precisely what would make the `toSegmentFields → null` branch in the write step reachable:

- `isValidExtraction(x)` implies `toSegmentFields(x, coords) !== null` for the same `x`
- `geocodeTargets` yields `start === end` exactly for one-location handlers

The second matters for cost: the geocode dedupe is a runtime string comparison, so a one-location handler that returned two different strings for the same place would silently double Mapbox calls against a metered free tier.

---

## Not to do

**Do not extend the registry into rendering.** Booking types are still learned by inline comparison in `components/trips/BookingCard.tsx`, `components/itinerary/DaySection.tsx`, `components/itinerary/TripMap.tsx`, and `lib/itinerary/compute-annotations.ts`. That is the right call at four types — the comparisons are cheaper to read than a second registry, and the annotation rules are genuinely pairwise rather than per-type. Revisit only if a fifth type appears.

The failure mode is also benign: `typeIcon` in `BookingCard.tsx` has a `?? '📄'` fallback and the comparisons fall through to their else branches, so an unhandled type mis-renders a card rather than crashing.

## Worth knowing

The registry and the database migration are **mutually enforcing**. `HandledBookingType` is `Exclude<BookingType, 'unknown'>` derived from the pgEnum, and the registry is typed `Record<HandledBookingType, BookingTypeHandler>` — so adding `'train'` to `bookingTypeEnum` fails typecheck until a handler exists. You cannot half-land a booking type. This was not a designed property of the plan; it fell out of deriving the type from the schema, and it is the single best guard 7C has.
