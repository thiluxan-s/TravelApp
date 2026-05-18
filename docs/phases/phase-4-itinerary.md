# Phase 4 — Itinerary Timeline View

**Goal:** The trip page shows a day-grouped vertical timeline of segments with type-specific cards. Timezones handled correctly. Still no map this phase.

**Prerequisite:** Phase 3 complete.

## Deliverables (high level)

1. `lib/itinerary/` module with pure functions:
   - `groupSegmentsByDay(segments)` — groups by local date of each segment's start time + timezone.
   - `computeAnnotations(prev, next)` — given two adjacent segments, returns `{ timeGap, distance, conflicts }`.
2. Components:
   - `<DayHeader date={Date} segments={Segment[]}>` — date, weather, summary.
   - `<FlightCard segment={Segment}>` — airline, flight number, departure/arrival cities + times.
   - `<HotelCard segment={Segment}>` — hotel name, address, check-in/out times.
   - `<Annotation between={[Segment, Segment]}>` — "32 min taxi", "8h45m gap", "conflict: lands after check-in closes".
3. Use `date-fns-tz` or Luxon for timezone-aware rendering.
4. Skeleton loading states while segments load.

## Notes for when we get here

- Cards should look distinctly different — a flight card visually says "this is a flight" before you read it. Don't make them generic.
- The conflict cases worth detecting in v1: flight lands after hotel check-in window ends, hotel check-out before next flight gives less than 90 min, two segments overlap in time.
- Conflict messages need to be specific and helpful, not alarming. "Hotel check-in closes at 22:00 — your flight lands at 23:15. Here's their after-hours line: [phone]" is good.

---

(More detail to be added before starting this phase.)
