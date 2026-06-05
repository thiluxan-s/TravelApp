# Phase 4 — Itinerary Timeline View: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the trip detail page's bookings list with a day-grouped itinerary timeline showing route-forward flight cards, hotel headline cards, and pill-style annotations between adjacent events.

**Architecture:** Server Component page with three client islands (ParsingBanner, AddBookingDialog, DeleteTripButton). Pure itinerary logic lives in `lib/itinerary/` as tested pure functions. All timeline components are Server Components.

**Tech Stack:** Next.js App Router, Drizzle ORM, Luxon (new), Vitest (new), Tailwind CSS, shadcn/ui (base-ui Dialog), Zod

---

## File Map

**Create:**
- `lib/itinerary/types.ts` — DayGroup + Annotation types
- `lib/itinerary/haversine.ts` — haversineKm()
- `lib/itinerary/compute-annotations.ts` — computeAnnotations()
- `lib/itinerary/group-by-day.ts` — groupSegmentsByDay()
- `lib/itinerary/__tests__/helpers.ts` — makeSegment() test factory
- `lib/itinerary/__tests__/haversine.test.ts`
- `lib/itinerary/__tests__/compute-annotations.test.ts`
- `lib/itinerary/__tests__/group-by-day.test.ts`
- `vitest.config.ts`
- `components/itinerary/AnnotationPill.tsx`
- `components/itinerary/FlightCard.tsx`
- `components/itinerary/HotelCard.tsx`
- `components/itinerary/DaySection.tsx`
- `components/itinerary/ItinerarySkeleton.tsx`
- `components/itinerary/ItineraryTimeline.tsx`
- `components/itinerary/ParsingBanner.tsx`
- `components/trips/AddBookingDialog.tsx`
- `components/trips/DeleteTripButton.tsx`
- `app/(app)/trips/[tripId]/loading.tsx`

**Modify:**
- `package.json` — add luxon, @types/luxon, vitest
- `app/(app)/trips/[tripId]/page.tsx` — full rewrite

**Delete:**
- `components/trips/TripDetailClient.tsx`

---

### Task 1: Install Luxon and set up Vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install Luxon**

```bash
npm install luxon
npm install --save-dev @types/luxon
```

Expected: both packages appear in `package.json` dependencies.

- [ ] **Step 2: Install Vitest**

```bash
npm install --save-dev vitest
```

Expected: `"vitest"` appears in `devDependencies` in `package.json`.

- [ ] **Step 3: Add test script to package.json**

Open `package.json` and add to the `"scripts"` section:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Create vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
```

- [ ] **Step 5: Verify Vitest runs**

```bash
npm test
```

Expected output: `No test files found, exiting with code 0` (or similar — no error, no failures).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add luxon and vitest"
```

---

### Task 2: Define itinerary types

**Files:**
- Create: `lib/itinerary/types.ts`

- [ ] **Step 1: Create the types file**

```ts
import type { Segment } from '@/lib/db/schema';

export type DayGroup = {
  date: string;
  label: string;
  segments: Segment[];
  annotations: Annotation[];
};

export type Annotation = {
  kind: 'gap' | 'conflict';
  gapMinutes: number;
  distanceKm: number | null;
  message: string;
  conflictDetail?: string;
};
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/itinerary/types.ts
git commit -m "feat: add itinerary DayGroup and Annotation types"
```

---

### Task 3: haversineKm (TDD)

**Files:**
- Create: `lib/itinerary/haversine.ts`
- Create: `lib/itinerary/__tests__/haversine.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/itinerary/__tests__/haversine.test.ts
import { describe, it, expect } from 'vitest';
import { haversineKm } from '../haversine';

describe('haversineKm', () => {
  it('returns 0 for identical coordinates', () => {
    expect(haversineKm(43.677, -79.630, 43.677, -79.630)).toBe(0);
  });

  it('calculates distance between YYZ and NRT (~10,300 km)', () => {
    const km = haversineKm(43.677, -79.630, 35.765, 140.386);
    expect(km).toBeGreaterThan(10000);
    expect(km).toBeLessThan(11000);
  });

  it('calculates a short city distance correctly (~2 km)', () => {
    const km = haversineKm(35.689, 139.691, 35.705, 139.711);
    expect(km).toBeGreaterThan(1);
    expect(km).toBeLessThan(3);
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm test -- lib/itinerary/__tests__/haversine.test.ts
```

Expected: `FAIL` with "Cannot find module '../haversine'"

- [ ] **Step 3: Implement haversineKm**

```ts
// lib/itinerary/haversine.ts
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
npm test -- lib/itinerary/__tests__/haversine.test.ts
```

Expected: `✓ 3 tests passed`

- [ ] **Step 5: Commit**

```bash
git add lib/itinerary/haversine.ts lib/itinerary/__tests__/haversine.test.ts
git commit -m "feat: add haversineKm distance calculation"
```

---

### Task 4: Test helper factory

**Files:**
- Create: `lib/itinerary/__tests__/helpers.ts`

- [ ] **Step 1: Create makeSegment factory**

This is used by Tasks 5 and 6 tests. `Segment` has `startTime: Date`, `endTime: Date`, and `startLat/startLng/endLat/endLng: string | null` (Drizzle returns `numeric` columns as strings).

```ts
// lib/itinerary/__tests__/helpers.ts
import type { Segment } from '@/lib/db/schema';

export function makeSegment(overrides: Partial<Segment> = {}): Segment {
  return {
    id: 'seg-id',
    bookingId: 'booking-id',
    tripId: 'trip-id',
    type: 'flight',
    startTime: new Date('2026-03-10T09:00:00Z'),
    startTimezone: 'UTC',
    endTime: new Date('2026-03-10T11:00:00Z'),
    endTimezone: 'UTC',
    startLocation: 'Airport A',
    startLat: null,
    startLng: null,
    endLocation: 'Airport B',
    endLat: null,
    endLng: null,
    details: {},
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as Segment;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/itinerary/__tests__/helpers.ts
git commit -m "test: add makeSegment factory for itinerary tests"
```

---

### Task 5: computeAnnotations (TDD)

**Files:**
- Create: `lib/itinerary/compute-annotations.ts`
- Create: `lib/itinerary/__tests__/compute-annotations.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// lib/itinerary/__tests__/compute-annotations.test.ts
import { describe, it, expect } from 'vitest';
import { computeAnnotations } from '../compute-annotations';
import { makeSegment } from './helpers';

describe('computeAnnotations', () => {
  it('returns a gap annotation for a normal time gap', () => {
    // 8h 45m gap
    const prev = makeSegment({ endTime: new Date('2026-03-11T06:15:00Z') });
    const next = makeSegment({ startTime: new Date('2026-03-11T15:00:00Z') });
    const result = computeAnnotations(prev, next);
    expect(result.kind).toBe('gap');
    expect(result.gapMinutes).toBe(525);
    expect(result.message).toContain('8h');
    expect(result.message).toContain('45m');
  });

  it('includes distance in message when both segments have coordinates', () => {
    const prev = makeSegment({
      endTime: new Date('2026-03-11T06:15:00Z'),
      endLat: '35.765',
      endLng: '140.386',
    });
    const next = makeSegment({
      startTime: new Date('2026-03-11T15:00:00Z'),
      startLat: '35.689',
      startLng: '139.691',
    });
    const result = computeAnnotations(prev, next);
    expect(result.distanceKm).not.toBeNull();
    expect(result.message).toContain('km');
  });

  it('omits distance when coordinates are missing', () => {
    const prev = makeSegment({ endTime: new Date('2026-03-11T06:15:00Z') });
    const next = makeSegment({ startTime: new Date('2026-03-11T15:00:00Z') });
    const result = computeAnnotations(prev, next);
    expect(result.distanceKm).toBeNull();
    expect(result.message).not.toContain('km');
  });

  it('detects overlap conflict', () => {
    // next starts before prev ends
    const prev = makeSegment({ endTime: new Date('2026-03-11T10:00:00Z') });
    const next = makeSegment({ startTime: new Date('2026-03-11T09:00:00Z') });
    const result = computeAnnotations(prev, next);
    expect(result.kind).toBe('conflict');
    expect(result.message).toContain('overlap');
  });

  it('detects flight-lands-after-check-in-closes conflict', () => {
    // Flight lands at 23:15 JST (14:15 UTC), hotel check-in closes at 22:00
    const prev = makeSegment({
      type: 'flight',
      endTime: new Date('2026-03-11T14:15:00Z'),
      endTimezone: 'Asia/Tokyo',
    });
    const next = makeSegment({
      type: 'hotel_stay',
      startTime: new Date('2026-03-11T15:00:00Z'),
      startTimezone: 'Asia/Tokyo',
      details: {
        hotel_name: 'Test Hotel',
        address: '1-1 Test, Tokyo',
        confirmation_code: null,
        room_type: null,
        guests: null,
        check_in_time: '22:00',
        check_out_time: '11:00',
        phone: '+81-3-1234-5678',
      },
    });
    const result = computeAnnotations(prev, next);
    expect(result.kind).toBe('conflict');
    expect(result.message).toContain('Check-in closes');
    expect(result.conflictDetail).toContain('+81-3-1234-5678');
  });

  it('does not flag check-in conflict when flight lands before check-in closes', () => {
    // Flight lands at 18:00 JST (09:00 UTC), hotel check-in closes at 22:00
    const prev = makeSegment({
      type: 'flight',
      endTime: new Date('2026-03-11T09:00:00Z'),
      endTimezone: 'Asia/Tokyo',
    });
    const next = makeSegment({
      type: 'hotel_stay',
      startTime: new Date('2026-03-11T15:00:00Z'),
      startTimezone: 'Asia/Tokyo',
      details: {
        hotel_name: 'Test Hotel',
        address: '1-1 Test, Tokyo',
        confirmation_code: null,
        room_type: null,
        guests: null,
        check_in_time: '22:00',
        check_out_time: '11:00',
        phone: null,
      },
    });
    const result = computeAnnotations(prev, next);
    expect(result.kind).toBe('gap');
  });

  it('detects tight hotel-checkout-to-flight conflict (under 90 min)', () => {
    // 60 min gap between checkout and flight
    const prev = makeSegment({
      type: 'hotel_stay',
      endTime: new Date('2026-03-15T02:00:00Z'),
    });
    const next = makeSegment({
      type: 'flight',
      startTime: new Date('2026-03-15T03:00:00Z'),
    });
    const result = computeAnnotations(prev, next);
    expect(result.kind).toBe('conflict');
    expect(result.gapMinutes).toBe(60);
    expect(result.message).toContain('60 min');
  });

  it('does not flag checkout conflict when gap is 90 min or more', () => {
    const prev = makeSegment({
      type: 'hotel_stay',
      endTime: new Date('2026-03-15T02:00:00Z'),
    });
    const next = makeSegment({
      type: 'flight',
      startTime: new Date('2026-03-15T03:30:00Z'), // exactly 90 min
    });
    const result = computeAnnotations(prev, next);
    expect(result.kind).toBe('gap');
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test -- lib/itinerary/__tests__/compute-annotations.test.ts
```

Expected: `FAIL` with "Cannot find module '../compute-annotations'"

- [ ] **Step 3: Implement computeAnnotations**

```ts
// lib/itinerary/compute-annotations.ts
import { DateTime } from 'luxon';
import type { Segment } from '@/lib/db/schema';
import type { Annotation } from './types';
import { haversineKm } from './haversine';
import { HotelDetailsSchema } from '@/lib/ai/schemas/hotel';

export function computeAnnotations(prev: Segment, next: Segment): Annotation {
  const gapMinutes = Math.round(
    DateTime.fromJSDate(next.startTime)
      .diff(DateTime.fromJSDate(prev.endTime), 'minutes')
      .minutes,
  );

  const prevLat = prev.endLat != null ? parseFloat(prev.endLat) : null;
  const prevLng = prev.endLng != null ? parseFloat(prev.endLng) : null;
  const nextLat = next.startLat != null ? parseFloat(next.startLat) : null;
  const nextLng = next.startLng != null ? parseFloat(next.startLng) : null;
  const distanceKm =
    prevLat != null && prevLng != null && nextLat != null && nextLng != null
      ? haversineKm(prevLat, prevLng, nextLat, nextLng)
      : null;

  // Conflict: time overlap
  if (next.startTime < prev.endTime) {
    return {
      kind: 'conflict',
      gapMinutes,
      distanceKm,
      message: 'These bookings overlap in time',
      conflictDetail: 'Two events are scheduled at the same time.',
    };
  }

  // Conflict: flight lands after hotel check-in closes
  if (prev.type === 'flight' && next.type === 'hotel_stay') {
    const parsed = HotelDetailsSchema.safeParse(next.details);
    if (parsed.success && parsed.data.check_in_time) {
      const [closeHour, closeMin] = parsed.data.check_in_time.split(':').map(Number);
      const arrivalLocal = DateTime.fromJSDate(prev.endTime, { zone: next.startTimezone });
      const arrivesAfterClose =
        arrivalLocal.hour > closeHour ||
        (arrivalLocal.hour === closeHour && arrivalLocal.minute > (closeMin ?? 0));
      if (arrivesAfterClose) {
        const phone = parsed.data.phone;
        const phoneMsg = phone ? ` Call ahead: ${phone}` : '';
        return {
          kind: 'conflict',
          gapMinutes,
          distanceKm,
          message: `Check-in closes at ${parsed.data.check_in_time} — your flight lands at ${arrivalLocal.toFormat('HH:mm')}`,
          conflictDetail: `Hotel check-in window may be closed on arrival.${phoneMsg}`,
        };
      }
    }
  }

  // Conflict: hotel checkout < 90 min before flight
  if (prev.type === 'hotel_stay' && next.type === 'flight' && gapMinutes < 90) {
    return {
      kind: 'conflict',
      gapMinutes,
      distanceKm,
      message: `Only ${gapMinutes} min between check-out and departure`,
      conflictDetail: 'Less than 90 minutes is tight for airport travel.',
    };
  }

  // Normal gap
  return {
    kind: 'gap',
    gapMinutes,
    distanceKm,
    message: buildGapMessage(gapMinutes, distanceKm),
  };
}

function buildGapMessage(gapMinutes: number, distanceKm: number | null): string {
  const abs = Math.abs(gapMinutes);
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  const timeStr = hours > 0 && mins > 0
    ? `${hours}h ${mins}m`
    : hours > 0
    ? `${hours}h`
    : `${mins}m`;
  return distanceKm != null ? `${timeStr} · ~${distanceKm} km` : timeStr;
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test -- lib/itinerary/__tests__/compute-annotations.test.ts
```

Expected: `✓ 8 tests passed`

- [ ] **Step 5: Commit**

```bash
git add lib/itinerary/compute-annotations.ts lib/itinerary/__tests__/compute-annotations.test.ts
git commit -m "feat: add computeAnnotations with gap and conflict detection"
```

---

### Task 6: groupSegmentsByDay (TDD)

**Files:**
- Create: `lib/itinerary/group-by-day.ts`
- Create: `lib/itinerary/__tests__/group-by-day.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// lib/itinerary/__tests__/group-by-day.test.ts
import { describe, it, expect } from 'vitest';
import { groupSegmentsByDay } from '../group-by-day';
import { makeSegment } from './helpers';

describe('groupSegmentsByDay', () => {
  it('returns empty array for no segments', () => {
    expect(groupSegmentsByDay([])).toEqual([]);
  });

  it('groups two segments on the same local day into one DayGroup', () => {
    const seg1 = makeSegment({
      id: 'a',
      startTime: new Date('2026-03-10T09:00:00Z'),
      endTime: new Date('2026-03-10T11:00:00Z'),
      startTimezone: 'UTC',
    });
    const seg2 = makeSegment({
      id: 'b',
      startTime: new Date('2026-03-10T14:00:00Z'),
      endTime: new Date('2026-03-10T16:00:00Z'),
      startTimezone: 'UTC',
    });
    const result = groupSegmentsByDay([seg1, seg2]);
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe('2026-03-10');
    expect(result[0].segments).toHaveLength(2);
    expect(result[0].annotations).toHaveLength(1);
  });

  it('places segments on different days into separate DayGroups', () => {
    const seg1 = makeSegment({
      id: 'a',
      startTime: new Date('2026-03-10T09:00:00Z'),
      endTime: new Date('2026-03-10T11:00:00Z'),
      startTimezone: 'UTC',
    });
    const seg2 = makeSegment({
      id: 'b',
      startTime: new Date('2026-03-11T09:00:00Z'),
      endTime: new Date('2026-03-11T11:00:00Z'),
      startTimezone: 'UTC',
    });
    const result = groupSegmentsByDay([seg1, seg2]);
    expect(result).toHaveLength(2);
    expect(result[0].date).toBe('2026-03-10');
    expect(result[1].date).toBe('2026-03-11');
  });

  it('respects timezone when determining local date', () => {
    // 2026-03-10T23:00:00Z = Mar 10 in UTC, but Mar 11 in Asia/Tokyo (UTC+9)
    const seg = makeSegment({
      startTime: new Date('2026-03-10T23:00:00Z'),
      endTime: new Date('2026-03-10T23:30:00Z'),
      startTimezone: 'Asia/Tokyo',
    });
    const result = groupSegmentsByDay([seg]);
    expect(result[0].date).toBe('2026-03-11');
  });

  it('sorts day groups chronologically regardless of input order', () => {
    const seg1 = makeSegment({
      id: 'a',
      startTime: new Date('2026-03-12T09:00:00Z'),
      endTime: new Date('2026-03-12T10:00:00Z'),
      startTimezone: 'UTC',
    });
    const seg2 = makeSegment({
      id: 'b',
      startTime: new Date('2026-03-10T09:00:00Z'),
      endTime: new Date('2026-03-10T10:00:00Z'),
      startTimezone: 'UTC',
    });
    const result = groupSegmentsByDay([seg1, seg2]);
    expect(result[0].date).toBe('2026-03-10');
    expect(result[1].date).toBe('2026-03-12');
  });

  it('formats the day label in the correct timezone', () => {
    // 2026-03-10 is a Tuesday
    const seg = makeSegment({
      startTime: new Date('2026-03-10T09:00:00Z'),
      endTime: new Date('2026-03-10T10:00:00Z'),
      startTimezone: 'UTC',
    });
    const result = groupSegmentsByDay([seg]);
    expect(result[0].label).toBe('Tuesday, March 10');
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test -- lib/itinerary/__tests__/group-by-day.test.ts
```

Expected: `FAIL` with "Cannot find module '../group-by-day'"

- [ ] **Step 3: Implement groupSegmentsByDay**

```ts
// lib/itinerary/group-by-day.ts
import { DateTime } from 'luxon';
import type { Segment } from '@/lib/db/schema';
import type { DayGroup } from './types';
import { computeAnnotations } from './compute-annotations';

export function groupSegmentsByDay(segments: Segment[]): DayGroup[] {
  if (segments.length === 0) return [];

  const dayMap = new Map<string, Segment[]>();

  for (const segment of segments) {
    const date = DateTime.fromJSDate(segment.startTime, {
      zone: segment.startTimezone,
    }).toISODate()!;
    const existing = dayMap.get(date);
    if (existing) {
      existing.push(segment);
    } else {
      dayMap.set(date, [segment]);
    }
  }

  const sortedDates = [...dayMap.keys()].sort();

  return sortedDates.map((date) => {
    const segs = dayMap.get(date)!;
    const label = DateTime.fromISO(date, { zone: segs[0].startTimezone }).toFormat(
      'cccc, MMMM d',
    );
    const annotations = segs
      .slice(0, -1)
      .map((seg, i) => computeAnnotations(seg, segs[i + 1]));
    return { date, label, segments: segs, annotations };
  });
}
```

- [ ] **Step 4: Run all itinerary tests — verify they pass**

```bash
npm test
```

Expected: `✓ all tests passed` (haversine + compute-annotations + group-by-day)

- [ ] **Step 5: Commit**

```bash
git add lib/itinerary/group-by-day.ts lib/itinerary/__tests__/group-by-day.test.ts
git commit -m "feat: add groupSegmentsByDay with Luxon timezone grouping"
```

---

### Task 7: DeleteTripButton component

**Files:**
- Create: `components/trips/DeleteTripButton.tsx`

This is extracted verbatim from `TripDetailClient.tsx`. Do not delete `TripDetailClient` yet — that happens in Task 17.

- [ ] **Step 1: Create DeleteTripButton**

```tsx
// components/trips/DeleteTripButton.tsx
'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { deleteTripAction } from '@/app/(app)/trips/actions';

export function DeleteTripButton({ tripId }: { tripId: string }) {
  const [isDeleting, startDelete] = useTransition();
  const router = useRouter();

  function handleDelete() {
    if (!confirm('Delete this trip and all its bookings? This cannot be undone.')) return;
    startDelete(async () => {
      const result = await deleteTripAction(tripId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.push('/trips');
    });
  }

  return (
    <Button
      render={<button type="button" />}
      variant="ghost"
      onClick={handleDelete}
      disabled={isDeleting}
      className="text-muted-foreground hover:text-destructive text-sm"
    >
      {isDeleting ? 'Deleting…' : 'Delete trip'}
    </Button>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/trips/DeleteTripButton.tsx
git commit -m "feat: extract DeleteTripButton client component"
```

---

### Task 8: AddBookingDialog component

**Files:**
- Create: `components/trips/AddBookingDialog.tsx`

Follow the same Dialog pattern as `components/trips/NewTripDialog.tsx` — open state managed with `useState`, trigger is a plain `<Button>` with `onClick`, no `<DialogTrigger>`.

- [ ] **Step 1: Create AddBookingDialog**

```tsx
// components/trips/AddBookingDialog.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { BookingUploader } from '@/components/trips/BookingUploader';

export function AddBookingDialog({ tripId }: { tripId: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  function handleUploadComplete() {
    router.refresh();
    setOpen(false);
  }

  return (
    <>
      <Button
        render={<button type="button" />}
        variant="outline"
        onClick={() => setOpen(true)}
        className="text-sm"
      >
        + Add booking
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a booking</DialogTitle>
          </DialogHeader>
          <BookingUploader tripId={tripId} onUploadComplete={handleUploadComplete} />
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/trips/AddBookingDialog.tsx
git commit -m "feat: add AddBookingDialog client component"
```

---

### Task 9: AnnotationPill component

**Files:**
- Create: `components/itinerary/AnnotationPill.tsx`

- [ ] **Step 1: Create AnnotationPill**

```tsx
// components/itinerary/AnnotationPill.tsx
import type { Annotation } from '@/lib/itinerary/types';

export function AnnotationPill({ annotation }: { annotation: Annotation }) {
  const isConflict = annotation.kind === 'conflict';
  return (
    <div className="flex justify-center py-1">
      <span
        className={
          isConflict
            ? 'inline-flex items-center gap-1.5 rounded-full border border-destructive/60 bg-destructive/10 px-3 py-1 text-xs text-destructive'
            : 'inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs text-muted-foreground'
        }
      >
        {isConflict && <span aria-hidden>⚠</span>}
        {annotation.message}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/itinerary/AnnotationPill.tsx
git commit -m "feat: add AnnotationPill component"
```

---

### Task 10: FlightCard component

**Files:**
- Create: `components/itinerary/FlightCard.tsx`

- [ ] **Step 1: Create FlightCard**

```tsx
// components/itinerary/FlightCard.tsx
import { DateTime } from 'luxon';
import { FlightDetailsSchema } from '@/lib/ai/schemas/flight';
import type { Segment } from '@/lib/db/schema';

export function FlightCard({ segment }: { segment: Segment }) {
  const details = FlightDetailsSchema.safeParse(segment.details);
  const dep = DateTime.fromJSDate(segment.startTime, { zone: segment.startTimezone });
  const arr = DateTime.fromJSDate(segment.endTime, { zone: segment.endTimezone });
  const durationMins = Math.round(arr.diff(dep, 'minutes').minutes);
  const durationHours = Math.floor(durationMins / 60);
  const durationRemMins = durationMins % 60;
  const durationStr =
    durationRemMins > 0 ? `${durationHours}h ${durationRemMins}m` : `${durationHours}h`;

  if (!details.success) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">✈ Flight</p>
        <p className="text-sm text-muted-foreground">Parsed</p>
      </div>
    );
  }

  const d = details.data;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">✈ Flight</span>
        {d.confirmation_code && (
          <span className="text-xs text-muted-foreground">Conf: {d.confirmation_code}</span>
        )}
      </div>

      {/* Route */}
      <div className="mb-3 flex items-center">
        <div className="text-center">
          <div className="text-3xl font-bold tracking-tight">{d.departure_airport_code}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{dep.toFormat('HH:mm')}</div>
          <div className="text-xs text-muted-foreground">{dep.toFormat('EEE MMM d')}</div>
        </div>
        <div className="relative flex flex-1 flex-col items-center px-3">
          <div className="mb-1 text-xs text-muted-foreground">{durationStr}</div>
          <div className="relative w-full">
            <div className="h-px w-full bg-border" />
            <span className="absolute -right-1 -top-[5px] text-xs text-muted-foreground">▶</span>
          </div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold tracking-tight">{d.arrival_airport_code}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{arr.toFormat('HH:mm')}</div>
          <div className="text-xs text-muted-foreground">{arr.toFormat('EEE MMM d')}</div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex flex-wrap gap-3 border-t border-border pt-3 text-xs text-muted-foreground">
        <span>{d.airline}</span>
        <span>{d.flight_number}</span>
        {d.seat && <span>Seat {d.seat}</span>}
        {d.cabin_class && <span>{d.cabin_class}</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/itinerary/FlightCard.tsx
git commit -m "feat: add FlightCard component with route-forward design"
```

---

### Task 11: HotelCard component

**Files:**
- Create: `components/itinerary/HotelCard.tsx`

- [ ] **Step 1: Create HotelCard**

```tsx
// components/itinerary/HotelCard.tsx
import { DateTime } from 'luxon';
import { HotelDetailsSchema } from '@/lib/ai/schemas/hotel';
import type { Segment } from '@/lib/db/schema';

export function HotelCard({ segment }: { segment: Segment }) {
  const details = HotelDetailsSchema.safeParse(segment.details);
  const checkIn = DateTime.fromJSDate(segment.startTime, { zone: segment.startTimezone });
  const checkOut = DateTime.fromJSDate(segment.endTime, { zone: segment.endTimezone });
  const nights = Math.round(checkOut.diff(checkIn, 'days').days);

  if (!details.success) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">🏨 Hotel</p>
        <p className="text-sm text-muted-foreground">Parsed</p>
      </div>
    );
  }

  const d = details.data;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">🏨 Hotel</span>
        {d.confirmation_code && (
          <span className="text-xs text-muted-foreground">Conf: {d.confirmation_code}</span>
        )}
      </div>

      {/* Hotel name */}
      <div className="mb-3 text-xl font-semibold">{d.hotel_name}</div>

      {/* Check-in / check-out / nights */}
      <div className="mb-3 flex gap-4">
        <div>
          <div className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
            Check-in
          </div>
          <div className="text-sm font-medium">
            {checkIn.toFormat('MMM d')}
            {d.check_in_time && (
              <span className="text-muted-foreground"> · {d.check_in_time}</span>
            )}
          </div>
        </div>
        <div className="w-px bg-border" />
        <div>
          <div className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
            Check-out
          </div>
          <div className="text-sm font-medium">
            {checkOut.toFormat('MMM d')}
            {d.check_out_time && (
              <span className="text-muted-foreground"> · {d.check_out_time}</span>
            )}
          </div>
        </div>
        <div className="w-px bg-border" />
        <div>
          <div className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">Nights</div>
          <div className="text-sm font-medium">{nights}</div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex flex-wrap gap-3 border-t border-border pt-3 text-xs text-muted-foreground">
        {d.room_type && <span>{d.room_type}</span>}
        <span className="truncate">{d.address}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/itinerary/HotelCard.tsx
git commit -m "feat: add HotelCard component"
```

---

### Task 12: DaySection component

**Files:**
- Create: `components/itinerary/DaySection.tsx`

- [ ] **Step 1: Create DaySection**

```tsx
// components/itinerary/DaySection.tsx
import type { DayGroup } from '@/lib/itinerary/types';
import { FlightCard } from './FlightCard';
import { HotelCard } from './HotelCard';
import { AnnotationPill } from './AnnotationPill';

export function DaySection({ day }: { day: DayGroup }) {
  return (
    <div className="space-y-2">
      <h2 className="pt-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {day.label}
      </h2>
      {day.segments.map((segment, i) => (
        <div key={segment.id}>
          {segment.type === 'flight' ? (
            <FlightCard segment={segment} />
          ) : (
            <HotelCard segment={segment} />
          )}
          {day.annotations[i] && <AnnotationPill annotation={day.annotations[i]!} />}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/itinerary/DaySection.tsx
git commit -m "feat: add DaySection component"
```

---

### Task 13: ItinerarySkeleton component

**Files:**
- Create: `components/itinerary/ItinerarySkeleton.tsx`

- [ ] **Step 1: Create ItinerarySkeleton**

```tsx
// components/itinerary/ItinerarySkeleton.tsx
export function ItinerarySkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      {[0, 1].map((day) => (
        <div key={day} className="space-y-2">
          <div className="h-3 w-32 rounded bg-muted" />
          <div className="h-[130px] rounded-lg bg-muted" />
          <div className="flex justify-center py-1">
            <div className="h-6 w-28 rounded-full bg-muted" />
          </div>
          <div className="h-[110px] rounded-lg bg-muted" />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/itinerary/ItinerarySkeleton.tsx
git commit -m "feat: add ItinerarySkeleton loading placeholder"
```

---

### Task 14: ItineraryTimeline component

**Files:**
- Create: `components/itinerary/ItineraryTimeline.tsx`

- [ ] **Step 1: Create ItineraryTimeline**

```tsx
// components/itinerary/ItineraryTimeline.tsx
import type { DayGroup } from '@/lib/itinerary/types';
import { DaySection } from './DaySection';
import { AddBookingDialog } from '@/components/trips/AddBookingDialog';

export function ItineraryTimeline({
  dayGroups,
  tripId,
}: {
  dayGroups: DayGroup[];
  tripId: string;
}) {
  if (dayGroups.length === 0) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border p-8 text-center">
        <span className="text-4xl opacity-20">🗺</span>
        <div>
          <p className="text-sm font-medium">No bookings yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Upload a flight or hotel confirmation PDF to build your itinerary
          </p>
        </div>
        <AddBookingDialog tripId={tripId} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {dayGroups.map((day) => (
        <DaySection key={day.date} day={day} />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/itinerary/ItineraryTimeline.tsx
git commit -m "feat: add ItineraryTimeline with empty state"
```

---

### Task 15: ParsingBanner component

**Files:**
- Create: `components/itinerary/ParsingBanner.tsx`

- [ ] **Step 1: Create ParsingBanner**

```tsx
// components/itinerary/ParsingBanner.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Booking } from '@/lib/db/schema';

export function ParsingBanner({ bookings }: { bookings: Booking[] }) {
  const router = useRouter();
  const inFlight = bookings.filter(
    (b) => b.status === 'parsing' || b.status === 'uploading',
  );

  useEffect(() => {
    if (inFlight.length === 0) return;
    const interval = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(interval);
  }, [inFlight.length, router]);

  if (inFlight.length === 0) return null;

  return (
    <div className="mb-4 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
      <span className="block h-3 w-3 flex-shrink-0 animate-spin rounded-full border-2 border-amber-500/30 border-t-amber-500" />
      Parsing {inFlight.length} booking{inFlight.length > 1 ? 's' : ''}… results will appear
      automatically
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/itinerary/ParsingBanner.tsx
git commit -m "feat: add ParsingBanner with router.refresh polling"
```

---

### Task 16: loading.tsx for the trip detail page

**Files:**
- Create: `app/(app)/trips/[tripId]/loading.tsx`

- [ ] **Step 1: Create loading.tsx**

```tsx
// app/(app)/trips/[tripId]/loading.tsx
import { ItinerarySkeleton } from '@/components/itinerary/ItinerarySkeleton';

export default function TripDetailLoading() {
  return (
    <div>
      <div className="mb-6 flex animate-pulse items-start justify-between">
        <div className="space-y-1.5">
          <div className="h-3 w-16 rounded bg-muted" />
          <div className="h-6 w-48 rounded bg-muted" />
        </div>
      </div>
      <ItinerarySkeleton />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(app\)/trips/\[tripId\]/loading.tsx
git commit -m "feat: add skeleton loading state for trip detail page"
```

---

### Task 17: Refactor page.tsx and delete TripDetailClient

**Files:**
- Modify: `app/(app)/trips/[tripId]/page.tsx`
- Delete: `components/trips/TripDetailClient.tsx`

- [ ] **Step 1: Replace page.tsx**

Overwrite the entire file with:

```tsx
// app/(app)/trips/[tripId]/page.tsx
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { getUserByClerkId } from '@/lib/db/repositories/users';
import { getTripWithBookings } from '@/lib/db/repositories/trips';
import { groupSegmentsByDay } from '@/lib/itinerary/group-by-day';
import { ItineraryTimeline } from '@/components/itinerary/ItineraryTimeline';
import { ParsingBanner } from '@/components/itinerary/ParsingBanner';
import { AddBookingDialog } from '@/components/trips/AddBookingDialog';
import { DeleteTripButton } from '@/components/trips/DeleteTripButton';

export default async function TripDetailPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;

  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) redirect('/sign-in');

  const user = await getUserByClerkId(clerkUserId);
  if (!user) redirect('/sign-in');

  const trip = await getTripWithBookings(tripId);
  if (!trip) notFound();
  if (trip.userId !== user.id) notFound();

  const segments = trip.bookings.flatMap((b) => b.segments);
  const dayGroups = groupSegmentsByDay(segments);

  return (
    <div>
      {/* Page header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <Link
            href="/trips"
            className="mb-1 block text-xs text-muted-foreground hover:text-foreground"
          >
            ← Your trips
          </Link>
          <h1 className="text-xl font-semibold">{trip.title}</h1>
          {trip.destination && (
            <p className="mt-0.5 text-sm text-muted-foreground">{trip.destination}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <AddBookingDialog tripId={tripId} />
          <DeleteTripButton tripId={tripId} />
        </div>
      </div>

      {/* Parsing banner */}
      <ParsingBanner bookings={trip.bookings} />

      {/* Itinerary */}
      <ItineraryTimeline dayGroups={dayGroups} tripId={tripId} />
    </div>
  );
}
```

- [ ] **Step 2: Delete TripDetailClient**

```bash
rm components/trips/TripDetailClient.tsx
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: no errors. If there are any — fix them before continuing.

- [ ] **Step 4: Lint**

```bash
npm run lint
```

Expected: no errors. Fix any that appear.

- [ ] **Step 5: Run all tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/\(app\)/trips/\[tripId\]/page.tsx
git rm components/trips/TripDetailClient.tsx
git commit -m "feat: refactor trip page to Server Component itinerary view

Replace TripDetailClient with a Server Component that computes the day-grouped
itinerary and renders it via ItineraryTimeline. Polling handled by ParsingBanner
client island using router.refresh(). Upload accessible via AddBookingDialog in
the page header and from the itinerary empty state."
```

---

### Task 18: Manual smoke test

No code changes. Verify the feature works end-to-end in the browser.

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Start the Inngest dev server (second terminal)**

```bash
npx inngest-cli@latest dev
```

- [ ] **Step 3: Check empty state**

Navigate to a trip that has no parsed bookings. Verify:
- Page shows the dashed empty state box
- "No bookings yet" text is visible
- "+ Add booking" button is present

- [ ] **Step 4: Check header button**

Navigate to any trip. Verify:
- "+ Add booking" button appears in the top-right of the page header
- Clicking it opens the upload dialog
- Dialog contains the upload drop zone

- [ ] **Step 5: Check skeleton loading**

In the browser dev tools, throttle to Slow 3G. Navigate to a trip. Verify the skeleton placeholder appears before the itinerary loads.

- [ ] **Step 6: Check parsed trip**

Navigate to a trip that has at least one parsed flight and one parsed hotel. Verify:
- Flight card shows large airport codes (e.g. YYZ → NRT)
- Times appear in local timezone
- Hotel card shows hotel name prominently with check-in/check-out dates
- An annotation pill appears between adjacent events on the same day

- [ ] **Step 7: Upload a new booking**

Upload a new flight or hotel PDF via the "+ Add booking" dialog. Verify:
- Dialog closes after upload
- Amber parsing banner appears
- Banner disappears automatically when Inngest finishes parsing
- New segment card appears in the timeline

- [ ] **Step 8: Delete trip**

Click "Delete trip" and confirm. Verify redirect to `/trips`.
