# Phase 4 — Itinerary Timeline View: Design Spec

**Date:** 2026-06-05  
**Status:** Approved  
**Phase doc:** `docs/phases/phase-4-itinerary.md`

---

## Goal

Replace the current bookings list on the trip detail page with a day-grouped itinerary timeline. Segments are displayed as visually distinct cards (flight vs. hotel), with intelligent annotations between adjacent events. No map yet — that's Phase 5.

---

## What we decided and why

### Layout
**Full container width** for the timeline. The trip detail page uses the existing `max-w-6xl` container from the app layout. No right-side placeholder in Phase 4. When Phase 5 adds the map, the timeline becomes the natural left column with minimal layout changes.

### Card visual style
**Route-forward.** Flight cards lead with large airport codes (`YYZ → NRT`) as the visual headline — you know it's a flight before you read a word. Hotel cards lead with the hotel name in large text. Both cards have a footer row for supporting details (confirmation code, seat, address, room type).

### Annotations
**Centered pill badge.** A small pill sits centered between adjacent segment cards. Normal gaps show time + distance (e.g. `8h 45m · ~2 km`). Conflicts use a red-bordered pill with a specific, actionable message.

### Upload access
**Two entry points:** a `+ Add booking` button in the page header (always visible) and an inline CTA in the empty state (when no segments exist yet).

### Parsing state
**Amber status banner** at the top of the itinerary while any booking has `status: 'parsing'`. The banner polls via `router.refresh()` every 3s and disappears automatically when parsing completes.

### Timezone handling
**Luxon** (`luxon` + `@types/luxon`). Already in scope per the phase doc. Cleaner API than raw `Intl` for grouping by local date and formatting display times.

---

## Architecture

The trip detail page is refactored to a **Server Component with client islands**. `TripDetailClient` is deleted; its responsibilities are split into focused components.

### Data flow

```
page.tsx (Server Component)
  → getTripWithBookings(tripId)          // existing repo function
  → extract segments from all bookings
  → groupSegmentsByDay(segments)         // lib/itinerary/group-by-day.ts
  → for each day: computeAnnotations()   // lib/itinerary/compute-annotations.ts
  → <ItineraryTimeline dayGroups={...} />
  → <ParsingBanner bookings={...} />     // client island
  → <AddBookingDialog tripId={...} />    // client island (header button)
  → <DeleteTripButton tripId={...} />    // client island
```

### Loading state

`app/(app)/trips/[tripId]/loading.tsx` — Next.js automatically shows this while the Server Component loads. Renders `<ItinerarySkeleton>`.

### Client islands

| Component | Why client |
|---|---|
| `<ParsingBanner>` | `useEffect` + `useRouter` for polling |
| `<AddBookingDialog>` | Dialog open/close state + `router.refresh()` on upload |
| `<DeleteTripButton>` | `useTransition` + `useRouter` for navigation after delete |

Everything else (timeline, cards, annotation pills, day headers) is Server Components.

---

## `lib/itinerary/` module

Pure functions, no framework dependencies. Lives in `lib/itinerary/`.

### `types.ts`

```ts
type DayGroup = {
  date: string;              // "2026-03-10" — ISO local date, used as React key
  label: string;             // "Monday, March 10" — formatted for display
  segments: Segment[];
  annotations: Annotation[]; // annotations[i] sits between segments[i] and segments[i+1]
                             // length is always segments.length - 1
};

type Annotation = {
  kind: 'gap' | 'conflict';
  gapMinutes: number;
  distanceKm: number | null;  // null if either segment lacks coordinates
  message: string;            // e.g. "8h 45m · ~2 km to hotel"
  conflictDetail?: string;    // only present when kind === 'conflict'
};
```

### `group-by-day.ts` — `groupSegmentsByDay(segments: Segment[]): DayGroup[]`

1. For each segment, derive local date key: `DateTime.fromJSDate(seg.startTime, { zone: seg.startTimezone }).toISODate()`
2. Group segments by that key (Map preserves insertion order)
3. For each day, run `computeAnnotations` on each adjacent pair
4. Day label: `DateTime.fromISO(date, { zone: firstSegment.startTimezone }).toFormat('cccc, MMMM d')`
5. Sort days by date string (lexicographic = chronological for ISO dates)

### `compute-annotations.ts` — `computeAnnotations(prev: Segment, next: Segment): Annotation`

**Gap calculation:**
```ts
const gapMinutes = DateTime.fromJSDate(next.startTime)
  .diff(DateTime.fromJSDate(prev.endTime), 'minutes').minutes;
```

**Distance calculation:**
- Uses `prev.endLat/endLng` and `next.startLat/startLng`
- Returns `null` if any coordinate is missing
- Drizzle `numeric` columns return strings — parse with `parseFloat()` before use

**Conflict detection (v1):**

| Conflict | Condition |
|---|---|
| Flight lands after hotel check-in closes | `prev.type === 'flight'` AND `next.type === 'hotel_stay'` AND `check_in_time` is set AND the flight arrival wall-clock time in the hotel's timezone is after `check_in_time` |
| Too little time before flight | `prev.type === 'hotel_stay'` AND `next.type === 'flight'` AND `gapMinutes < 90` |
| Overlap | `next.startTime < prev.endTime` (any type combination) |

Conflict messages are specific and calm: `"Check-in closes at 22:00 — your flight lands at 23:15"`, not `"CONFLICT"`.

### `haversine.ts` — `haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number`

Standard haversine formula. Returns distance in km, rounded to one decimal.

---

## Components

### File structure

```
components/
  itinerary/
    ItineraryTimeline.tsx    # Server — top-level, handles empty state
    DaySection.tsx           # Server — day header + segments + pills
    FlightCard.tsx           # Server — route-forward card
    HotelCard.tsx            # Server — hotel name headline card
    AnnotationPill.tsx       # Server — centered pill, red when conflict
    ParsingBanner.tsx        # Client — polling banner
    ItinerarySkeleton.tsx    # Skeleton for loading.tsx
  trips/
    AddBookingDialog.tsx     # Client — dialog wrapping BookingUploader
    DeleteTripButton.tsx     # Client — extracted from TripDetailClient
```

### `<ItineraryTimeline dayGroups={DayGroup[]} tripId={string}>`

If `dayGroups` is empty: renders centered empty state with icon, "No bookings yet" text, and an `<AddBookingDialog>` trigger button.

Otherwise: renders `<DaySection>` for each day group.

### `<DaySection day={DayGroup}>`

Renders:
1. Day header — `Monday, March 10` in muted uppercase small caps
2. For each segment: the appropriate card (`<FlightCard>` or `<HotelCard>`)
3. After each segment (except the last): `<AnnotationPill annotation={...} />`

### `<FlightCard segment={Segment}>`

```
[✈ FLIGHT label]                     [confirmation code]

   YYZ    ──── 13h 45m ────    NRT
 Toronto                         Tokyo
 14:30 Mon Mar 10          15:15 Tue Mar 11

─────────────────────────────────────────
Air Canada  ·  Seat 34A  ·  Economy
```

- Uses `FlightDetailsSchema.safeParse(segment.details)` — falls back to minimal display if parse fails
- Times formatted with Luxon in the segment's local timezone
- Duration derived from `endTime - startTime`

### `<HotelCard segment={Segment}>`

```
[🏨 HOTEL label]                     [confirmation code]

Shinjuku Granbell Hotel

 Check-in          │  Check-out       │  Nights
 Mar 11 · 15:00    │  Mar 15 · 11:00  │  4

─────────────────────────────────────────
Deluxe King  ·  1-10-1 Kabukicho, Shinjuku
```

- Uses `HotelDetailsSchema.safeParse(segment.details)`
- Nights = `Math.round(endTime - startTime in days)`

### `<AnnotationPill annotation={Annotation}>`

Normal: `<span>` pill with dark background — `8h 45m · ~2 km`  
Conflict: pill with red border + red text — `⚠ Check-in closes at 22:00 — flight lands at 23:15`  
If `distanceKm` is null: omit the distance part — `8h 45m`

### `<ParsingBanner bookings={Booking[]}>`

- Filters bookings to those with `status === 'parsing' || status === 'uploading'`
- If none: renders nothing
- If any: amber banner — `"Parsing 1 booking… results will appear automatically"`
- `useEffect`: calls `router.refresh()` every 3000ms while parsing bookings exist

### `<ItinerarySkeleton>`

Two day-shaped blocks using `animate-pulse`:
- Day header placeholder (short gray bar)
- Two card-height gray rectangles per day
- Annotation pill placeholder between cards

### `<AddBookingDialog tripId={string}>`

- Button labeled `+ Add booking` in the page header
- Opens a shadcn `<Dialog>` containing `<BookingUploader>`
- On upload complete: calls `router.refresh()` and closes the dialog

### `<DeleteTripButton tripId={string}>`

Extracted verbatim from `TripDetailClient`. Same confirm dialog + `deleteTripAction` + router push.

---

## Updated `page.tsx`

```tsx
// Server Component
export default async function TripDetailPage({ params }) {
  const { tripId } = await params;
  // auth + user check (unchanged)
  const trip = await getTripWithBookings(tripId);
  // ownership check (unchanged)

  const segments = trip.bookings.flatMap(b => b.segments);
  const dayGroups = groupSegmentsByDay(segments);

  return (
    <div>
      {/* Page header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link href="/trips">← Your trips</Link>
          <h1>{trip.title}</h1>
          {trip.destination && <p>{trip.destination}</p>}
        </div>
        <div className="flex gap-2">
          <AddBookingDialog tripId={tripId} />
          <DeleteTripButton tripId={tripId} />
        </div>
      </div>

      {/* Parsing status */}
      <ParsingBanner bookings={trip.bookings} />

      {/* Itinerary */}
      <ItineraryTimeline dayGroups={dayGroups} tripId={tripId} />
    </div>
  );
}
```

---

## Error handling

- `FlightDetailsSchema.safeParse` / `HotelDetailsSchema.safeParse` failures: card renders a minimal fallback (`✓ Parsed` line) rather than crashing
- Missing coordinates: annotation shows time gap only, no distance
- Conflict detection: if `check_in_time` is null (hotel didn't have one), skip that conflict check — no false positives
- `groupSegmentsByDay` with zero segments: returns `[]`, `<ItineraryTimeline>` renders empty state

---

## What's explicitly out of scope for Phase 4

- Map (Phase 5)
- Weather on day headers (no weather API planned)
- Manual editing of parsed segment data
- Multi-segment bookings (one PDF → multiple flight legs) — current schema supports it but UI assumes one segment per booking for now
- Drag-to-reorder segments

---

## Dependencies to add

- `luxon` — timezone-aware date math and formatting
- `@types/luxon` — TypeScript types
