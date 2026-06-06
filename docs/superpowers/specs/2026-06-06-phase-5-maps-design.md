# Phase 5 — Map Integration: Design Spec

**Date:** 2026-06-06  
**Status:** Approved  
**Phase doc:** `docs/phases/phase-5-maps.md`

---

## Goal

Add a Mapbox map to the trip detail page showing pins for each segment on the selected day. A day tab bar lets users switch which day the map displays. Hovering a timeline card highlights the corresponding pin on the map (one-way sync).

---

## What we decided and why

### Layout
**60/40 split on desktop** — timeline on the left (60%), map on the right (40%). The timeline stays comfortable and readable; the map is a supporting panel. The map column is sticky so it stays in view as the user scrolls through a long itinerary. On mobile (`< lg`), the map column stacks below the timeline — one CSS breakpoint, no tab switcher needed.

### Day selection
**Day tabs above the map.** Pill buttons (`Mar 10 · Mar 11 · Mar 15`) sit above the map; clicking one filters the map to that day's pins and fits bounds. The tabs are rendered by `MapPanel`, which holds `selectedDay` state (defaults to the first day). The timeline still shows all days scrolled vertically — the tabs control the map only.

### Hover sync
**One-way: card hover → pin highlight.** `SegmentWrapper` is a thin Client Component that wraps each timeline card. On `mouseenter` it fires a custom DOM event (`segment-hover`) with `{ segmentId, active: true }`; on `mouseleave` it fires `active: false`. `TripMap` listens for this event and updates `highlightedSegmentId` internally — no shared React state, no context, no new dependencies.

`FlightCard` and `HotelCard` stay as Server Components. `SegmentWrapper` is the only client-side addition to the timeline.

### Mobile
**Stacked.** Map column renders below the timeline at `< lg` breakpoint. No tab switcher or drawer.

---

## Architecture

### Data flow

```
page.tsx (Server Component)
  → getTripWithBookings(tripId)
  → groupSegmentsByDay(segments)        // existing
  → segments = trip.bookings.flatMap(b => b.segments)
  → days = dayGroups.map(d => ({ date: d.date, label: d.label }))

  → <div className="lg:grid lg:grid-cols-[3fr_2fr] lg:gap-6">
      <ItineraryTimeline dayGroups={dayGroups} tripId={tripId} />   // unchanged (left col)
      {segments.length > 0 && (
        <MapPanel segments={segments} days={days} />                 // right col
      )}
    </div>
```

### Sticky map column

The right column uses `lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)]` so the map stays visible while the user scrolls the timeline.

### Client component tree (right column)

```
MapPanel (Client) — holds selectedDay: string
  DayTabs (Client) — renders tab pills, calls onSelect
  TripMap (Client) — Mapbox GL JS map
```

### Hover event flow

```
DaySection (Server)
  SegmentWrapper (Client) — wraps each card
    FlightCard or HotelCard (Server, unchanged)

SegmentWrapper.mouseenter → dispatchEvent('segment-hover', { segmentId, active: true })
TripMap (global event listener) → setHighlightedSegmentId(segmentId)
```

---

## New components

### `components/itinerary/MapPanel.tsx` (Client)

Holds `selectedDay` state (initialises to `days[0].date`). Filters `segments` to those whose `startTime` falls on `selectedDay` in the segment's local timezone — using `DateTime.fromJSDate(seg.startTime, { zone: seg.startTimezone }).toISODate()`, matching `groupSegmentsByDay`'s logic. Passes filtered segments and `selectedDay` to `TripMap`, and `days`/`selectedDay`/`onSelect` to `DayTabs`.

```tsx
'use client';
// props: { segments: Segment[], days: { date: string, label: string }[] }
// state: selectedDay (string, defaults to days[0].date)
// renders: <DayTabs /> + <TripMap />
```

### `components/itinerary/DayTabs.tsx` (Client)

Pill row. Active tab has a solid background; inactive tabs are outlined. No internal state — fully controlled via `selectedDay` + `onSelect` from `MapPanel`.

```tsx
'use client';
// props: { days: { date: string, label: string }[], selectedDay: string, onSelect: (date: string) => void }
```

### `components/itinerary/TripMap.tsx` (Client)

Mapbox GL JS map. Style: `mapbox://styles/mapbox/dark-v11`. Token from `env.NEXT_PUBLIC_MAPBOX_TOKEN`.

**Pin rendering:**
- Flight segment → two markers: `startLat/startLng` (departure) and `endLat/endLng` (arrival), connected by a straight GeoJSON line
- Hotel segment → one marker at `startLat/startLng`
- Segments missing coordinates → skipped silently

**Highlight:** When `highlightedSegmentId` changes, the corresponding marker element gets a CSS class (`ring-2 ring-white`) to visually stand out.

**Bounds:** On `segments` prop change, calls `map.fitBounds()` with padding to frame all visible pins.

**No-coordinates fallback:** If all segments for the day lack coordinates, renders the map with an overlay note: "No location data for this day."

**Hover sync:** On mount, attaches a global `segment-hover` event listener. On unmount, removes it. Updates local `highlightedSegmentId` state.

```tsx
'use client';
// props: { segments: Segment[] }
// highlightedSegmentId is internal state, driven by the segment-hover DOM event
```

### `components/itinerary/SegmentWrapper.tsx` (Client)

Thin wrapper div with `onMouseEnter`/`onMouseLeave` that fires the `segment-hover` custom event.

```tsx
'use client';
// props: { segmentId: string, children: React.ReactNode }
```

---

## Changes to existing files

### `app/(app)/trips/[tripId]/page.tsx`

Add two-column grid wrapper. Compute `days` from `dayGroups`. Pass `segments` and `days` to `MapPanel`. Only render `MapPanel` if there are segments.

### `components/itinerary/DaySection.tsx`

Wrap each segment card in `<SegmentWrapper segmentId={segment.id}>`. `DaySection` stays a Server Component — `SegmentWrapper` as a child is fine (Client Components can be children of Server Components).

### `lib/env.client.ts`

Add `NEXT_PUBLIC_MAPBOX_TOKEN: z.string().min(1)` to the client env schema.

### `.env.example`

Add `NEXT_PUBLIC_MAPBOX_TOKEN=pk.your_public_token_here`.

---

## New dependencies

- `mapbox-gl` — Mapbox GL JS map renderer
- `@types/mapbox-gl` — TypeScript types

---

## Error handling

| Scenario | Behaviour |
|---|---|
| Segment has null coordinates | Pin skipped; line segment omitted |
| All day's segments lack coordinates | Map renders with overlay note |
| No segments at all | `MapPanel` not rendered; existing empty state shown |
| Mapbox token missing | App refuses to boot (Zod env validation) |
| Mapbox GL JS fails to initialise | `TripMap` catches the error, renders a placeholder box |

---

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_MAPBOX_TOKEN` | `lib/env.client.ts` | Client-side map rendering |
| `MAPBOX_SECRET_TOKEN` | `lib/env.server.ts` | Server-side geocoding (existing, unchanged) |

---

## What's explicitly out of scope for Phase 5

- Great-circle arc rendering for flight routes (straight line used instead)
- Clicking a map pin scrolls the timeline (reverse sync)
- Clustering pins when many are close together
- Custom pin icons beyond styled HTML markers
- Weather overlay on the map
