# Phase 7C — Deferred Follow-Ups

Findings from the Phase 7C reviews that were deliberately not fixed there. None blocks merge; the final review's Critical and all four Importants were fixed on the branch.

---

## The annotation rules are now under-inclusive for the new types

`lib/itinerary/compute-annotations.ts` carries two conflict rules, both written when only flights and hotels existed:

- **flight → hotel**: warns when the flight lands after the hotel's check-in window closes.
- **hotel → flight**: warns when under 90 minutes separates checkout from departure.

Neither knows about trains. `hotel_stay → train_ride` with a tight gap is the same tight-connection risk as `hotel_stay → flight`, and `train_ride → hotel_stay` misses the check-in-window rule entirely. They are under-inclusive rather than wrong, so nothing misfires — a train pair just gets the generic gap-and-distance annotation.

The natural fix is to generalise on a transit/stay classification rather than enumerating types. `TripMap` already introduced exactly that vocabulary in this phase — `transit | stay | reservation` for marker kinds — and lifting it into the registry as a `segmentKind` field would let the annotation rules, the map markers, and 7D's lodging work all read one source instead of three inline comparisons.

## `hasAuthoritativeEnd` should become a property, not an inference

Phase 7C added `hasAuthoritativeEnd(segment)` to `compute-annotations.ts` to fix a Critical bug: the overlap rule treated a `hotel_stay`'s `endTime` as an occupancy end, when it is checkout days later, so a dinner on the check-in day produced a fabricated "These bookings overlap in time" warning. The same helper now also anchors the gap duration.

It works by inferring authoritativeness from `segment.type` plus, for reservations, a `safeParse` of `details.end_is_estimated`. That is the right behaviour reached the wrong way — a rendering-layer function reaching into a booking-type-specific detail schema.

**7D should absorb this.** Once lodging appears on covered days rather than only its check-in day, "when does this segment stop occupying the traveller" needs to be a first-class property of a segment, not something re-derived per annotation pair.

## The classifier relies on the model answering with the enum key

`getBookingTypeHandler` is an exact `Object.hasOwn` match on a single lowercase word. A Haiku reply of `restaurant`, `dining`, `rail`, or a quoted `"reservation"` all fall through to `unknown`, and the user is told which types we support — including the one they just uploaded.

Phase 7C mitigated the worst case by tightening the reservation `classifierDescription`, but the mechanism is still brittle and gets more so as the type list grows. A per-handler `classifierAliases: string[]` would be the registry-shaped fix, and normalising the reply (`raw.replace(/[^a-z]/g, '')`) would absorb stray punctuation cheaply. Neither is urgent while the four descriptions each contain an unambiguous keyword.

## Smaller items

- **The map's connecting line hops through reservation pins.** Pre-existing pattern extended — hotels already contributed a single point — but a flight → dinner → hotel day draws a dashed line that reads more like a suggested route than a timeline of unrelated points. Now that a day can hold four events, worth a look.
- **The gap pill is measured from an estimated end without saying so.** `ReservationCard` correctly suppresses a derived end time, but the annotation pill below it still measures from that derived number and presents it as fact. A `~` prefix or an "est." affordance would make the two consistent.
- **`registry.test.ts`'s prompt assertions are weak.** `not.toContain('flight or hotel')` passes largely because of pluralization, and `toContain(buildSupportedTypesPhrase())` would pass even if both builders hardcoded the same string. Looping `expect(message).toContain(handler.pluralLabel)` over the registry would actually pin the behaviour.
- **`ReservationCard` collapses to `'—'`** when `end_is_estimated` is false but `endTime` is an unparseable DateTime, discarding a valid start time. `TrainCard` guards per-field instead. Unreachable while `segments.endTime` is `notNull()`.
- **Four cards print a bare "Parsed"** when their `details` `safeParse` fails, with nothing logged. Harmless today, but if a details shape ever drifts, all four degrade identically and silently.
- **`app/page.tsx` landing copy** still says "flights, hotels, and map in one view" while the timeline empty state now generates its list from the registry.

---

## Worth knowing

**The demo seed now has a `--reset` path.** `scripts/seed-demo.ts` exits early when the demo trip exists, so re-running it after adding segments does nothing. `npm run seed:demo:reset` deletes the trip first and re-seeds; bookings and segments cascade. That command rewrites the trip behind the public `/demo` link — it is deliberately a separate script rather than the default.

**The dinner reservation in the seed is load-bearing.** It sits on the hotel's check-in day, which is exactly the pairing that produced the fabricated overlap warning. Keeping it there means the fix stays visible on the demo rather than living only in a unit test.
