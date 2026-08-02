# Phase 7D — Lodging on Covered Days Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a multi-day hotel stay visible on every night it covers, instead of only on its check-in day.

**Architecture:** `groupSegmentsByDay` keys each segment to its *start* day, so a three-night hotel appears once and the middle days show nothing — or don't exist at all. This phase derives lodging per day at render time, adds day groups for otherwise-empty covered nights, and renders a quiet footer. Nothing is stored: the itinerary is derived, not stored (`ARCHITECTURE.md`).

**Tech Stack:** TypeScript strict, Luxon, Vitest, Tailwind, Mapbox GL JS, Drizzle.

## Global Constraints

- `strict: true`. **No `any`** — use `unknown` and narrow.
- Absolute imports via `@/`. Test files import the module under test relatively (`../`).
- Prefer `type` over `interface`.
- **Default to Server Components.** `MapPanel` is already a client component and stays one; `DaySection` is a Server Component and must stay one.
- Conventional commits. `npm run typecheck` and `npm run lint` clean before every commit.
- **No new dependencies.**
- Vitest is `environment: 'node'` — no jsdom, no DB harness. **Only pure functions get unit tests.** `groupSegmentsByDay` is pure and fully testable; the components are verified by the human partner.
- **Existing behavior for days that already had segments must not change** — same segments, same order, same annotations. This phase adds; it does not rewrite.

## The rules this phase implements

Decided with the human partner before planning:

1. **Lodging covers nights, not days.** A stay with check-in on Mar 11 and checkout on Mar 14 covers the nights of Mar 11, 12, and 13 — **not** Mar 14. You are not "staying at" a hotel on the morning you leave it, and the checkout time is already on the `HotelCard`.
2. **No footer on the check-in day.** The stay is already rendered as a full `HotelCard` in that day's `segments`; a footer beneath it saying "Staying at Park Hyatt Tokyo" is pure duplication.
3. **Lodging stays out of the `segments` array.** If it were a regular member, every covered day would pair it with that day's real events and `computeAnnotations` would report a gap measured from a hotel that started days ago. Keeping it a separate `DayGroup` field is what makes that impossible rather than merely unlikely.
4. **Covered dates are computed in the stay's own timezone** (`startTimezone`), consistent with how `groupSegmentsByDay` already assigns segments to local dates.
5. **On a day with no segments of its own, the map shows the lodging pin.** Otherwise a lodging-only day opens a blank map, which is worse than the day tab not existing.

## File Structure

**Modify:**
- `lib/itinerary/types.ts` — `DayGroup` gains `lodging`
- `lib/itinerary/group-by-day.ts` — lodging resolution and covered-day creation
- `lib/itinerary/__tests__/group-by-day.test.ts` — new cases
- `components/itinerary/DaySection.tsx` — the footer
- `components/itinerary/MapPanel.tsx` — lodging pin fallback
- `app/(app)/trips/[tripId]/page.tsx` and `app/demo/page.tsx` — pass lodging through to `MapPanel`

**Unchanged, deliberately:** `lib/itinerary/compute-annotations.ts`. Rule 3 keeps lodging out of annotation pairing entirely, so `hasAuthoritativeEnd` stays exactly as Phase 7C left it. Turning it into a first-class segment property remains a deferred follow-up — see `docs/superpowers/plans/2026-07-30-phase-7c-follow-ups.md` — and is **not** in scope here.

---

### Task 1: Resolve lodging and create covered days

**Files:**
- Modify: `lib/itinerary/types.ts`, `lib/itinerary/group-by-day.ts`
- Test: `lib/itinerary/__tests__/group-by-day.test.ts`

**Interfaces:**
- `DayGroup` gains `lodging: Segment | null`

This is the whole substance of the phase. Everything else renders what this computes.

- [ ] **Step 1: Write the failing tests**

Read the existing test file first for the `makeSegment` helper and style. Append these inside the existing `describe('groupSegmentsByDay', …)` block:

```typescript
  const hotel = () =>
    makeSegment({
      id: 'hotel',
      type: 'hotel_stay',
      startTime: new Date('2026-03-11T18:00:00Z'),
      endTime: new Date('2026-03-14T11:00:00Z'),
      startTimezone: 'UTC',
      endTimezone: 'UTC',
    });

  it('creates day groups for nights a stay covers that have no segments', () => {
    const result = groupSegmentsByDay([hotel()]);
    expect(result.map((d) => d.date)).toEqual(['2026-03-11', '2026-03-12', '2026-03-13']);
  });

  it('does not create a day group for the checkout day', () => {
    const result = groupSegmentsByDay([hotel()]);
    expect(result.map((d) => d.date)).not.toContain('2026-03-14');
  });

  it('sets lodging on covered nights after the check-in day', () => {
    const result = groupSegmentsByDay([hotel()]);
    const mar12 = result.find((d) => d.date === '2026-03-12');
    expect(mar12!.lodging?.id).toBe('hotel');
    expect(mar12!.segments).toHaveLength(0);
  });

  it('leaves lodging null on the check-in day, where the stay is already a card', () => {
    const result = groupSegmentsByDay([hotel()]);
    const mar11 = result.find((d) => d.date === '2026-03-11');
    expect(mar11!.lodging).toBeNull();
    expect(mar11!.segments.map((s) => s.id)).toEqual(['hotel']);
  });

  it('keeps lodging out of the segments array so it never becomes an annotation pair', () => {
    const dinner = makeSegment({
      id: 'dinner',
      type: 'reservation',
      startTime: new Date('2026-03-12T19:00:00Z'),
      endTime: new Date('2026-03-12T20:30:00Z'),
      startTimezone: 'UTC',
      endTimezone: 'UTC',
    });
    const result = groupSegmentsByDay([hotel(), dinner]);
    const mar12 = result.find((d) => d.date === '2026-03-12');
    expect(mar12!.segments.map((s) => s.id)).toEqual(['dinner']);
    expect(mar12!.lodging?.id).toBe('hotel');
    expect(mar12!.annotations).toHaveLength(0);
  });

  it('labels a lodging-only day using the stay timezone', () => {
    const result = groupSegmentsByDay([hotel()]);
    // 2026-03-12 is a Thursday
    expect(result.find((d) => d.date === '2026-03-12')!.label).toBe('Thursday, March 12');
  });

  it('covers no nights when check-in and checkout fall on the same local date', () => {
    const dayUse = makeSegment({
      id: 'dayuse',
      type: 'hotel_stay',
      startTime: new Date('2026-03-11T09:00:00Z'),
      endTime: new Date('2026-03-11T17:00:00Z'),
      startTimezone: 'UTC',
      endTimezone: 'UTC',
    });
    const result = groupSegmentsByDay([dayUse]);
    expect(result.map((d) => d.date)).toEqual(['2026-03-11']);
    expect(result[0].lodging).toBeNull();
  });

  it('leaves lodging null on days no stay covers', () => {
    const flight = makeSegment({
      id: 'flight',
      startTime: new Date('2026-03-20T09:00:00Z'),
      endTime: new Date('2026-03-20T11:00:00Z'),
      startTimezone: 'UTC',
    });
    const result = groupSegmentsByDay([flight]);
    expect(result[0].lodging).toBeNull();
  });

  it('prefers the most recent check-in when two stays cover the same night', () => {
    const first = makeSegment({
      id: 'first',
      type: 'hotel_stay',
      startTime: new Date('2026-03-11T15:00:00Z'),
      endTime: new Date('2026-03-14T11:00:00Z'),
      startTimezone: 'UTC',
      endTimezone: 'UTC',
    });
    const second = makeSegment({
      id: 'second',
      type: 'hotel_stay',
      startTime: new Date('2026-03-12T15:00:00Z'),
      endTime: new Date('2026-03-14T11:00:00Z'),
      startTimezone: 'UTC',
      endTimezone: 'UTC',
    });
    const result = groupSegmentsByDay([first, second]);
    expect(result.find((d) => d.date === '2026-03-13')!.lodging?.id).toBe('second');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/itinerary/__tests__/group-by-day.test.ts`
Expected: FAIL — `lodging` is not a property of `DayGroup`, and the covered-day groups don't exist.

- [ ] **Step 3: Extend the DayGroup type**

In `lib/itinerary/types.ts`:

```typescript
export type DayGroup = {
  date: string;
  label: string;
  segments: Segment[];
  annotations: Annotation[];
  /**
   * The stay covering this night, or null. Deliberately NOT a member of
   * `segments`: as a regular member it would pair with the day's real events and
   * produce a gap measured from a hotel that started days ago. Null on the
   * check-in day, where the stay already renders as its own card.
   */
  lodging: Segment | null;
};
```

- [ ] **Step 4: Implement**

Replace `lib/itinerary/group-by-day.ts`:

```typescript
import { DateTime } from 'luxon';
import type { Segment } from '@/lib/db/schema';
import type { DayGroup } from './types';
import { computeAnnotations } from './compute-annotations';

function localDate(instant: Date, zone: string): string {
  return DateTime.fromJSDate(instant, { zone }).toISODate()!;
}

/**
 * The local dates a stay covers as nights: check-in date through the date before
 * checkout. A stay checking out on the 14th does not cover the 14th — you are not
 * staying there the morning you leave, and the checkout time is on the card.
 * Returns [] for a same-day stay, which covers no nights at all.
 */
function coveredNights(stay: Segment): string[] {
  const zone = stay.startTimezone;
  const checkIn = DateTime.fromJSDate(stay.startTime, { zone }).startOf('day');
  const checkOut = DateTime.fromJSDate(stay.endTime, { zone }).startOf('day');

  const nights: string[] = [];
  for (let d = checkIn; d < checkOut; d = d.plus({ days: 1 })) {
    nights.push(d.toISODate()!);
  }
  return nights;
}

export function groupSegmentsByDay(segments: Segment[]): DayGroup[] {
  if (segments.length === 0) return [];

  const dayMap = new Map<string, Segment[]>();

  for (const segment of segments) {
    const date = localDate(segment.startTime, segment.startTimezone);
    const existing = dayMap.get(date);
    if (existing) {
      existing.push(segment);
    } else {
      dayMap.set(date, [segment]);
    }
  }

  // Which stay covers each night. Later check-ins win, so moving hotels
  // mid-trip resolves to where you actually are.
  const stays = segments
    .filter((s) => s.type === 'hotel_stay')
    .slice()
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  const lodgingByDate = new Map<string, Segment>();
  for (const stay of stays) {
    for (const night of coveredNights(stay)) {
      lodgingByDate.set(night, stay);
      // A covered night with nothing else on it still deserves a day.
      if (!dayMap.has(night)) dayMap.set(night, []);
    }
  }

  const sortedDates = [...dayMap.keys()].sort();

  return sortedDates.map((date) => {
    // Callers flatten segments in booking-creation order, so sort within the day
    // before pairing — otherwise adjacent pairs come out reversed and
    // computeAnnotations reports a false overlap conflict.
    const segs = dayMap
      .get(date)!
      .slice()
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    const stay = lodgingByDate.get(date) ?? null;
    // Suppress on the check-in day: the stay is already a card there.
    const lodging = stay && segs.some((s) => s.id === stay.id) ? null : stay;

    const zone = segs[0]?.startTimezone ?? stay?.startTimezone ?? 'UTC';
    const label = DateTime.fromISO(date, { zone }).toFormat('cccc, MMMM d');

    const annotations = segs
      .slice(0, -1)
      .map((seg, i) => computeAnnotations(seg, segs[i + 1]));

    return { date, label, segments: segs, annotations, lodging };
  });
}
```

Two details worth not "simplifying": the `zone` fallback chain exists because a lodging-only day has no `segs[0]` to read a timezone from, and the check-in-day suppression compares by `id` rather than by date so it stays correct if a stay is ever grouped somewhere unexpected.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run`
Expected: PASS. The suite is 78; this adds 9 → **87**. Existing `group-by-day` tests must all still pass — they assert existing days, ordering, and annotations, none of which this changes.

- [ ] **Step 6: Typecheck, lint, and commit**

Typecheck will fail until Task 2 if `DayGroup` is constructed anywhere else — check and report if so.

```bash
npm run typecheck && npm run lint
git add lib/itinerary/types.ts lib/itinerary/group-by-day.ts lib/itinerary/__tests__/group-by-day.test.ts
git commit -m "feat: resolve lodging per night and create day groups for covered nights

A three-night stay appeared only on its check-in day, so the middle days showed
nothing about where you were sleeping — and a day with only lodging produced no
day group at all.

Lodging is derived per night and kept out of the segments array on purpose: as a
regular member it would pair with the day's real events and report a gap measured
from a hotel that started days ago. Nights run check-in through the night before
checkout, so the checkout day is not covered."
```

---

### Task 2: Render the lodging footer

**Files:**
- Modify: `components/itinerary/DaySection.tsx`

**Interfaces:**
- Consumes `day.lodging` from Task 1.

Quiet by design: this is ambient context, not an event. It must not compete with the cards above it.

- [ ] **Step 1: Add the footer**

In `components/itinerary/DaySection.tsx`, add the schema import beside the existing ones:

```typescript
import { HotelDetailsSchema } from '@/lib/ai/schemas/hotel';
```

Then render the footer as the last child of the outer `<div className="space-y-2">`, after the segments `.map(...)`:

```tsx
      {day.lodging && <LodgingFooter segment={day.lodging} />}
```

And add this component at the bottom of the file:

```tsx
function LodgingFooter({ segment }: { segment: Segment }) {
  const details = HotelDetailsSchema.safeParse(segment.details);
  const name = details.success ? details.data.hotel_name : segment.startLocation;

  return (
    <p className="pt-1 text-xs text-muted-foreground">
      <span aria-hidden="true">🏨</span> Staying at {name}
    </p>
  );
}
```

Falling back to `segment.startLocation` rather than bailing out means a stay whose details fail to parse still tells the user where they are — `startLocation` is `notNull()` and holds the address.

- [ ] **Step 2: Verify**

```bash
npm run typecheck && npm run lint && npx vitest run
```

Do not start a dev server — visual verification is the human partner's step.

- [ ] **Step 3: Commit**

```bash
git add components/itinerary/DaySection.tsx
git commit -m "feat: show which hotel you are staying at on covered nights

Deliberately quiet — muted, small, below the day's events. It is ambient context
answering 'where am I sleeping tonight', not an event competing with the cards."
```

---

### Task 3: Show the lodging pin on lodging-only days

**Files:**
- Modify: `components/itinerary/MapPanel.tsx`, `app/(app)/trips/[tripId]/page.tsx`, `app/demo/page.tsx`

Task 1 creates day groups for covered nights, which become day tabs. `MapPanel` filters `segments` by local start date, so a lodging-only day currently produces an **empty map** behind its tab. Showing the stay's pin answers "where am I on the 12th" instead.

Only when the day has no segments of its own: on a day where you have a train to Kyoto, adding the Tokyo hotel pin would stretch the map bounds across the country for no reason.

- [ ] **Step 1: Widen the `days` prop**

In `components/itinerary/MapPanel.tsx`, change the prop type and the fallback:

```tsx
export function MapPanel({
  segments,
  days,
}: {
  segments: Segment[];
  days: { date: string; label: string; lodging: Segment | null }[];
}) {
```

Then, after the existing `daySegments` computation, add:

```tsx
  // A day whose only content is a stay would otherwise render an empty map.
  // Show the stay's pin so the tab answers "where am I tonight".
  const selectedLodging = days.find((d) => d.date === selectedDay)?.lodging ?? null;
  const mapSegments =
    daySegments.length === 0 && selectedLodging ? [selectedLodging] : daySegments;
```

and pass `mapSegments` to `TripMap` instead of `daySegments`.

Leave `tabDays` as it is — it already maps only `date` and `label`, so the extra field is ignored.

- [ ] **Step 2: Pass lodging from both call sites**

`ItineraryTimeline` and `MapPanel` have two call sites each. In `app/(app)/trips/[tripId]/page.tsx`, the `days` array is built from `dayGroups`:

```tsx
  const days = dayGroups.map((d) => ({ date: d.date, label: d.label, lodging: d.lodging }));
```

Apply the identical change in `app/demo/page.tsx`, which builds the same array. **Both must change** — a required prop makes the omission a compile error, but check deliberately rather than relying on that.

- [ ] **Step 3: Verify**

```bash
npm run typecheck && npm run lint && npx vitest run
```

- [ ] **Step 4: Commit**

```bash
git add components/itinerary/MapPanel.tsx "app/(app)/trips/[tripId]/page.tsx" app/demo/page.tsx
git commit -m "feat: show the lodging pin on days whose only content is a stay

Covered nights are day tabs now, and a night with no events of its own would open
an empty map. Restricted to days with no segments — adding a Tokyo hotel pin to a
day trip to Kyoto would stretch the bounds across the country for nothing."
```

---

## Final verification

- [ ] `npm run typecheck` — clean
- [ ] `npm run lint` — clean
- [ ] `npx vitest run` — 87 passing (78 + 9); reconcile any difference rather than adjusting the expectation
- [ ] Manual (human partner), against the seeded demo trip — its hotel runs Mar 11 18:00 → Mar 14 11:00, so it is exactly the case this phase targets:
  - **Mar 11** shows the `HotelCard` and **no** footer
  - **Mar 12** exists as a day, shows no event cards, shows "Staying at Park Hyatt Tokyo", and its map tab shows the hotel pin
  - **Mar 13** shows the Kyoto day trip *and* the footer, since that night is still covered
  - **Mar 14** shows the return flight and **no** footer — it is the checkout day
  - The Mar 11 dinner still shows a `2h` gap pill and no conflict — the Phase 7C fix must survive the reshape
