# Phase 5 — Map Integration

**Goal:** Right pane (or bottom panel on mobile) shows a Mapbox map with pins for the segments on the currently selected day. Hover interaction syncs between timeline and map.

**Prerequisite:** Phase 4 complete.

## Deliverables (high level)

1. `<TripMap segments={Segment[]} highlightedSegmentId={string | null}>` client component.
2. Mapbox GL JS integration with our token.
3. Pins: start and end locations for flights, single pin for hotel stays.
4. Lines between consecutive segments on a day (great-circle for flights, straight for ground).
5. Hovering a timeline card highlights the corresponding pin; clicking a pin scrolls the timeline.
6. Auto-fit bounds to the day's pins on day change.
7. Responsive: desktop = side-by-side, mobile = collapsible map drawer.

## Notes for when we get here

- Mapbox styles: pick one clean style and stick with it. The `streets-v12` or a custom dark style both work; don't go overboard.
- Skip Mapbox if all segments on a day lack coordinates (geocoding failed for everything).
- Performance: only mount the map when the user navigates to a trip page, not in the trips list.

---

(More detail to be added before starting this phase.)
