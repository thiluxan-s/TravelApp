# Phase 7A — Failure Surface and Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make failed parses visible in the UI, and let the user retry or delete a failed booking.

**Architecture:** Today a failed parse is invisible — `ParsingBanner` filters for `uploading | parsing` so its count drops to zero on failure and the banner disappears, `ItineraryTimeline` renders from segments and a failed booking has none, and `BookingCard` (the only component that reads `parseError`) is imported nowhere. This plan extracts the status-summarization logic into pure, tested functions, wires up the existing `BookingCard` inside a new bookings panel, and adds two server actions for retry and delete.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Drizzle + Neon, Clerk, Inngest, Vitest, Tailwind + shadcn/ui, sonner for toasts.

## Global Constraints

- `strict: true`. No `any` — use `unknown` and narrow.
- Absolute imports via `@/`. Never `../../../lib/...`.
- Server Actions return `{ ok: true, data } | { ok: false, error }` — never throw across the boundary.
- Every server action that touches user data must resolve the Clerk user and verify the resource belongs to them.
- All Postgres access goes through repository functions in `lib/db/repositories/`. No raw Drizzle calls in actions or components.
- Default to Server Components; `"use client"` only for state, effects, or browser APIs.
- Utilities are `kebab-case.ts` files exporting `camelCase`. Zod schemas are `SomethingSchema`.
- Conventional commits (`feat:`, `fix:`, `chore:`, `refactor:`).
- `npm run typecheck` and `npm run lint` must be clean before every commit.
- **No new dependencies in this plan.** `vitest.config.ts` uses `environment: 'node'` with no jsdom or testing-library, and there is no DB test harness. Server actions and React components are therefore verified manually (each task says how); only pure functions get unit tests. Adding component/DB test infrastructure is a separate decision to raise with Thiluxan, not something to slip into this plan.

---

## File Structure

**Create:**
- `lib/itinerary/booking-status.ts` — pure status summarization and empty-state selection. This is where the banner bug actually lives, so it is the part worth testing.
- `lib/itinerary/__tests__/booking-status.test.ts` — its tests.
- `components/trips/BookingActions.tsx` — client component holding the retry and delete buttons for one booking.
- `components/trips/BookingsPanel.tsx` — server component listing all bookings for a trip.

**Modify:**
- `lib/db/repositories/bookings.ts` — add `deleteBookingById`.
- `lib/db/repositories/segments.ts` — add `deleteSegmentsByBookingId`.
- `app/(app)/trips/[tripId]/actions.ts` — add `deleteBookingAction`, `retryBookingParseAction`.
- `components/trips/BookingCard.tsx` — accept and render an actions slot.
- `components/itinerary/ParsingBanner.tsx` — show a failed state instead of vanishing.
- `components/itinerary/ItineraryTimeline.tsx` — status-aware empty state.
- `app/(app)/trips/[tripId]/page.tsx` — render `BookingsPanel`, pass bookings to the timeline.

---

### Task 1: Pure status summarization

**Files:**
- Create: `lib/itinerary/booking-status.ts`
- Test: `lib/itinerary/__tests__/booking-status.test.ts`

**Interfaces:**
- Consumes: `BookingStatus` from `@/lib/db/schema`.
- Produces:
  - `type BookingStatusSummary = { total: number; inFlight: number; failed: number; parsed: number }`
  - `summarizeBookingStatuses(bookings: { status: BookingStatus }[]): BookingStatusSummary`
  - `type TimelineEmptyReason = 'no-bookings' | 'parsing' | 'all-failed'`
  - `emptyTimelineReason(summary: BookingStatusSummary): TimelineEmptyReason`

- [ ] **Step 1: Write the failing tests**

Create `lib/itinerary/__tests__/booking-status.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  summarizeBookingStatuses,
  emptyTimelineReason,
} from '../booking-status';

describe('summarizeBookingStatuses', () => {
  it('returns all zeros for no bookings', () => {
    expect(summarizeBookingStatuses([])).toEqual({
      total: 0,
      inFlight: 0,
      failed: 0,
      parsed: 0,
    });
  });

  it('counts uploading and parsing together as in-flight', () => {
    const summary = summarizeBookingStatuses([
      { status: 'uploading' },
      { status: 'parsing' },
    ]);
    expect(summary.inFlight).toBe(2);
  });

  it('counts failed bookings separately from in-flight ones', () => {
    const summary = summarizeBookingStatuses([
      { status: 'parsing' },
      { status: 'parsing_failed' },
      { status: 'parsing_failed' },
    ]);
    expect(summary.inFlight).toBe(1);
    expect(summary.failed).toBe(2);
    expect(summary.total).toBe(3);
  });

  it('counts parsed bookings', () => {
    const summary = summarizeBookingStatuses([
      { status: 'parsed' },
      { status: 'parsed' },
      { status: 'parsing_failed' },
    ]);
    expect(summary.parsed).toBe(2);
  });
});

describe('emptyTimelineReason', () => {
  it('reports no-bookings when nothing has been uploaded', () => {
    const summary = summarizeBookingStatuses([]);
    expect(emptyTimelineReason(summary)).toBe('no-bookings');
  });

  it('reports parsing while work is still in flight', () => {
    const summary = summarizeBookingStatuses([
      { status: 'parsing' },
      { status: 'parsing_failed' },
    ]);
    expect(emptyTimelineReason(summary)).toBe('parsing');
  });

  it('reports all-failed when every booking failed to parse', () => {
    const summary = summarizeBookingStatuses([
      { status: 'parsing_failed' },
      { status: 'parsing_failed' },
    ]);
    expect(emptyTimelineReason(summary)).toBe('all-failed');
  });

  it('reports no-bookings when something parsed but produced no segments', () => {
    const summary = summarizeBookingStatuses([{ status: 'parsed' }]);
    expect(emptyTimelineReason(summary)).toBe('no-bookings');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/itinerary/__tests__/booking-status.test.ts`
Expected: FAIL — cannot resolve `../booking-status`.

- [ ] **Step 3: Write the minimal implementation**

Create `lib/itinerary/booking-status.ts`:

```typescript
import type { BookingStatus } from '@/lib/db/schema';

export type BookingStatusSummary = {
  total: number;
  inFlight: number;
  failed: number;
  parsed: number;
};

export type TimelineEmptyReason = 'no-bookings' | 'parsing' | 'all-failed';

export function summarizeBookingStatuses(
  bookings: { status: BookingStatus }[],
): BookingStatusSummary {
  let inFlight = 0;
  let failed = 0;
  let parsed = 0;

  for (const booking of bookings) {
    if (booking.status === 'uploading' || booking.status === 'parsing') inFlight++;
    else if (booking.status === 'parsing_failed') failed++;
    else if (booking.status === 'parsed') parsed++;
  }

  return { total: bookings.length, inFlight, failed, parsed };
}

// Only meaningful when the timeline has no day groups to render.
export function emptyTimelineReason(summary: BookingStatusSummary): TimelineEmptyReason {
  if (summary.total === 0) return 'no-bookings';
  if (summary.inFlight > 0) return 'parsing';
  if (summary.failed > 0 && summary.parsed === 0) return 'all-failed';
  return 'no-bookings';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/itinerary/__tests__/booking-status.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Typecheck, lint, and commit**

```bash
npm run typecheck && npm run lint
git add lib/itinerary/booking-status.ts lib/itinerary/__tests__/booking-status.test.ts
git commit -m "feat: add pure booking status summarization for the itinerary

Extracts the counting logic the parsing banner and timeline empty state both
need. ParsingBanner currently filters for uploading|parsing only, so a failed
booking drops its count to zero and the banner silently disappears. Putting
the rule in one tested function stops the two consumers from disagreeing."
```

---

### Task 2: Repository functions for deleting a booking

**Files:**
- Modify: `lib/db/repositories/bookings.ts`
- Modify: `lib/db/repositories/segments.ts`

**Interfaces:**
- Produces:
  - `deleteBookingById(id: string): Promise<void>`
  - `deleteSegmentsByBookingId(bookingId: string): Promise<void>`

No unit tests — these are one-line Drizzle wrappers with no logic, and there is no DB test harness. They are exercised manually in Task 4.

- [ ] **Step 1: Add `deleteBookingById`**

Append to `lib/db/repositories/bookings.ts`:

```typescript
export async function deleteBookingById(id: string): Promise<void> {
  await db.delete(bookings).where(eq(bookings.id, id));
}
```

- [ ] **Step 2: Add `deleteSegmentsByBookingId`**

Append to `lib/db/repositories/segments.ts`:

```typescript
export async function deleteSegmentsByBookingId(bookingId: string): Promise<void> {
  await db.delete(segments).where(eq(segments.bookingId, bookingId));
}
```

- [ ] **Step 3: Typecheck, lint, and commit**

```bash
npm run typecheck && npm run lint
git add lib/db/repositories/bookings.ts lib/db/repositories/segments.ts
git commit -m "feat: add repository functions to delete a booking and its segments"
```

---

### Task 3: Retry and delete server actions

**Files:**
- Modify: `app/(app)/trips/[tripId]/actions.ts`

**Interfaces:**
- Consumes: `deleteBookingById`, `deleteSegmentsByBookingId` from Task 2; existing `getBookingById`, `updateBookingStatus`, `getTripById`, `deleteObject`, `inngest`.
- Produces:
  - `deleteBookingAction(bookingId: string): Promise<{ ok: true } | { ok: false; error: string }>`
  - `retryBookingParseAction(bookingId: string): Promise<{ ok: true } | { ok: false; error: string }>`

- [ ] **Step 1: Extend the imports**

In `app/(app)/trips/[tripId]/actions.ts`, update the existing bookings-repository import and add the segments one:

```typescript
import {
  createBooking,
  getBookingById,
  updateBookingStatus,
  deleteBookingById,
} from '@/lib/db/repositories/bookings';
import { deleteSegmentsByBookingId } from '@/lib/db/repositories/segments';
import { getPresignedUploadUrl, deleteObject } from '@/lib/r2';
```

Note `getPresignedUploadUrl` is already imported from `@/lib/r2` — add `deleteObject` to that existing import rather than writing a second import line.

- [ ] **Step 2: Add `deleteBookingAction`**

Append to `app/(app)/trips/[tripId]/actions.ts`:

```typescript
export async function deleteBookingAction(
  bookingId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return { ok: false, error: 'Unauthorized' };

    const booking = await getBookingById(bookingId);
    if (!booking) return { ok: false, error: 'Booking not found' };

    const trip = await getTripById(booking.tripId);
    if (!trip || trip.userId !== user.id) return { ok: false, error: 'Forbidden' };

    // Best-effort: a missing R2 object shouldn't block deleting the row.
    if (booking.fileKey !== '') {
      await Promise.allSettled([deleteObject(booking.fileKey)]);
    }

    await deleteBookingById(bookingId);
    return { ok: true };
  } catch {
    return { ok: false, error: 'Something went wrong' };
  }
}
```

Segments cascade via the `onDelete: 'cascade'` foreign key, so they need no explicit cleanup here.

- [ ] **Step 3: Add `retryBookingParseAction`**

Append to `app/(app)/trips/[tripId]/actions.ts`:

```typescript
export async function retryBookingParseAction(
  bookingId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return { ok: false, error: 'Unauthorized' };

    const booking = await getBookingById(bookingId);
    if (!booking) return { ok: false, error: 'Booking not found' };

    const trip = await getTripById(booking.tripId);
    if (!trip || trip.userId !== user.id) return { ok: false, error: 'Forbidden' };

    if (booking.status !== 'parsing_failed') {
      return { ok: false, error: 'Only failed bookings can be retried' };
    }

    // parse-booking's write step short-circuits when a segment already exists
    // (it guards Inngest's own retries). Clear them so a manual retry actually
    // re-writes instead of silently no-opping.
    await deleteSegmentsByBookingId(bookingId);

    // updateBookingStatus resets parseError to null when no extra is passed.
    await updateBookingStatus(bookingId, 'parsing');

    try {
      await inngest.send({ name: 'booking/uploaded', data: { bookingId } });
    } catch {
      await updateBookingStatus(bookingId, 'parsing_failed', {
        parseError: 'We could not queue this document for another attempt.',
      });
      return { ok: false, error: 'Failed to queue document for parsing' };
    }

    return { ok: true };
  } catch {
    return { ok: false, error: 'Something went wrong' };
  }
}
```

- [ ] **Step 4: Typecheck, lint, and commit**

```bash
npm run typecheck && npm run lint
git add "app/(app)/trips/[tripId]/actions.ts"
git commit -m "feat: add retry and delete server actions for bookings

A failed parse was previously unrecoverable — the only escape was deleting the
whole trip. Retry reuses the file already in R2, and clears any existing
segments first because parse-booking's write step short-circuits when one
exists, which would otherwise make retry a silent no-op."
```

---

### Task 4: Booking actions UI

**Files:**
- Create: `components/trips/BookingActions.tsx`
- Modify: `components/trips/BookingCard.tsx`

**Interfaces:**
- Consumes: `deleteBookingAction`, `retryBookingParseAction` from Task 3.
- Produces: `<BookingActions bookingId={string} status={BookingStatus} />`; `BookingCard` gains an optional `actions?: ReactNode` prop.

Follows the pattern already established by `components/trips/DeleteTripButton.tsx` — `useTransition`, `router.refresh()`, sonner toasts, `confirm()` for the destructive path, and the `Button` component's `render` prop.

- [ ] **Step 1: Create `BookingActions`**

```tsx
'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { BookingStatus } from '@/lib/db/schema';
import {
  deleteBookingAction,
  retryBookingParseAction,
} from '@/app/(app)/trips/[tripId]/actions';

export function BookingActions({
  bookingId,
  status,
}: {
  bookingId: string;
  status: BookingStatus;
}) {
  const [isPending, startAction] = useTransition();
  const router = useRouter();

  function handleRetry() {
    startAction(async () => {
      const result = await retryBookingParseAction(bookingId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success('Trying again…');
      router.refresh();
    });
  }

  function handleDelete() {
    if (!confirm('Remove this booking? This cannot be undone.')) return;
    startAction(async () => {
      const result = await deleteBookingAction(bookingId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-shrink-0 items-center gap-1">
      {status === 'parsing_failed' && (
        <Button
          render={<button type="button" />}
          variant="ghost"
          onClick={handleRetry}
          disabled={isPending}
          className="h-auto px-2 py-1 text-xs"
        >
          Try again
        </Button>
      )}
      <Button
        render={<button type="button" />}
        variant="ghost"
        onClick={handleDelete}
        disabled={isPending}
        className="h-auto px-2 py-1 text-xs text-muted-foreground hover:text-destructive"
      >
        Remove
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Give `BookingCard` an actions slot**

In `components/trips/BookingCard.tsx`, add the import and extend `Props`:

```tsx
import type { ReactNode } from 'react';

type Props = {
  booking: Booking;
  segment?: Segment;
  actions?: ReactNode;
};
```

Then update the component signature and render the slot. Replace the existing `export function BookingCard({ booking, segment }: Props) {` line with `export function BookingCard({ booking, segment, actions }: Props) {`, and add `{actions}` as the last child of the outer `div`, immediately after the closing tag of the `<div className="flex-1 min-w-0">` block:

```tsx
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{booking.fileName}</p>
        <StatusLine booking={booking} segment={segment} />
      </div>

      {actions}
    </div>
  );
}
```

`BookingCard` stays a Server Component — only `BookingActions` is a client component, passed in as a prop.

- [ ] **Step 3: Typecheck, lint, and commit**

```bash
npm run typecheck && npm run lint
git add components/trips/BookingActions.tsx components/trips/BookingCard.tsx
git commit -m "feat: add retry and remove controls for individual bookings"
```

---

### Task 5: Bookings panel on the trip page

**Files:**
- Create: `components/trips/BookingsPanel.tsx`
- Modify: `app/(app)/trips/[tripId]/page.tsx`

**Interfaces:**
- Consumes: `BookingCard`, `BookingActions`, and `TripWithBookings['bookings']`.
- Produces: `<BookingsPanel bookings={TripWithBookings['bookings']} />`

This is what makes `BookingCard` reachable at all — it is currently imported nowhere.

- [ ] **Step 1: Create `BookingsPanel`**

```tsx
import type { TripWithBookings } from '@/lib/db/repositories/trips';
import { BookingCard } from './BookingCard';
import { BookingActions } from './BookingActions';

export function BookingsPanel({
  bookings,
}: {
  bookings: TripWithBookings['bookings'];
}) {
  if (bookings.length === 0) return null;

  return (
    <section id="bookings" className="mt-8">
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Uploaded documents
      </h2>
      <div className="space-y-2">
        {bookings.map((booking) => (
          <BookingCard
            key={booking.id}
            booking={booking}
            segment={booking.segments[0]}
            actions={<BookingActions bookingId={booking.id} status={booking.status} />}
          />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Render it on the trip page**

In `app/(app)/trips/[tripId]/page.tsx`, add the import:

```tsx
import { BookingsPanel } from '@/components/trips/BookingsPanel';
```

Then insert the panel after the itinerary/map grid — immediately before the closing `</div>` of the page's outer wrapper:

```tsx
      <BookingsPanel bookings={trip.bookings} />
    </div>
  );
}
```

- [ ] **Step 3: Verify manually**

Run `npm run dev`, open a trip, and confirm every uploaded document appears in the panel with its status, and that a failed booking shows its error text and a "Try again" button.

Then exercise both actions against a real failed booking: click "Try again" and confirm the status returns to parsing and the Inngest job re-runs; click "Remove" on another and confirm the row disappears and does not return after a refresh.

- [ ] **Step 4: Typecheck, lint, and commit**

```bash
npm run typecheck && npm run lint
git add components/trips/BookingsPanel.tsx "app/(app)/trips/[tripId]/page.tsx"
git commit -m "feat: show uploaded documents and their status on the trip page

BookingCard was written in Phase 2 and never rendered anywhere, so parseError
was written by the Inngest job in four places and displayed in zero. This gives
failures somewhere to live."
```

---

### Task 6: Parsing banner reports failures

**Files:**
- Modify: `components/itinerary/ParsingBanner.tsx`

**Interfaces:**
- Consumes: `summarizeBookingStatuses` from Task 1.

The bug: the banner filters for `uploading | parsing`, so when a job fails the count drops to zero and the banner unmounts, leaving the user with a spinner that simply vanishes.

- [ ] **Step 1: Rewrite the component**

```tsx
// components/itinerary/ParsingBanner.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Booking } from '@/lib/db/schema';
import { summarizeBookingStatuses } from '@/lib/itinerary/booking-status';

export function ParsingBanner({ bookings }: { bookings: Booking[] }) {
  const router = useRouter();
  const { inFlight, failed } = summarizeBookingStatuses(bookings);

  useEffect(() => {
    if (inFlight === 0) return;
    const interval = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(interval);
  }, [inFlight, router]);

  if (inFlight > 0) {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
        <span className="block h-3 w-3 flex-shrink-0 animate-spin rounded-full border-2 border-amber-500/30 border-t-amber-500" />
        Parsing {inFlight} booking{inFlight > 1 ? 's' : ''}… results will appear
        automatically
      </div>
    );
  }

  if (failed > 0) {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        <span aria-hidden="true">⚠</span>
        <span>
          {failed} booking{failed > 1 ? 's' : ''} couldn&apos;t be read.{' '}
          <a href="#bookings" className="underline underline-offset-2">
            See what went wrong
          </a>
        </span>
      </div>
    );
  }

  return null;
}
```

The `#bookings` anchor matches the `id` on the `<section>` from Task 5.

- [ ] **Step 2: Verify manually**

Upload a file that cannot parse — a random non-booking PDF works. Confirm the amber parsing banner is replaced by the red failure banner rather than disappearing, and that the link scrolls to the bookings panel.

- [ ] **Step 3: Typecheck, lint, and commit**

```bash
npm run typecheck && npm run lint
git add components/itinerary/ParsingBanner.tsx
git commit -m "fix: surface failed parses in the parsing banner

The banner counted only uploading|parsing bookings, so a failed job dropped the
count to zero and the banner unmounted — the user watched a spinner vanish and
was never told anything had gone wrong."
```

---

### Task 7: Status-aware timeline empty state

**Files:**
- Modify: `components/itinerary/ItineraryTimeline.tsx`
- Modify: `app/(app)/trips/[tripId]/page.tsx`

**Interfaces:**
- Consumes: `summarizeBookingStatuses` and `emptyTimelineReason` from Task 1.
- Produces: `ItineraryTimeline` gains a required `bookings: { status: BookingStatus }[]` prop.

Today, when every booking fails, the timeline falls through to "No bookings yet — upload a flight or hotel confirmation PDF", telling the user they haven't uploaded the file they just uploaded.

- [ ] **Step 1: Make the empty state depend on booking status**

Replace the contents of `components/itinerary/ItineraryTimeline.tsx`:

```tsx
// components/itinerary/ItineraryTimeline.tsx
import type { DayGroup } from '@/lib/itinerary/types';
import type { BookingStatus } from '@/lib/db/schema';
import { DaySection } from './DaySection';
import { AddBookingDialog } from '@/components/trips/AddBookingDialog';
import {
  summarizeBookingStatuses,
  emptyTimelineReason,
} from '@/lib/itinerary/booking-status';

const EMPTY_STATE_COPY = {
  'no-bookings': {
    icon: '🗺',
    title: 'No bookings yet',
    body: 'Upload a flight or hotel confirmation PDF to build your itinerary',
  },
  parsing: {
    icon: '⏳',
    title: 'Reading your bookings',
    body: 'This usually takes a few seconds — your itinerary will appear here',
  },
  'all-failed': {
    icon: '⚠',
    title: "We couldn't read your bookings",
    body: 'Check the uploaded documents below — you can try again or remove them',
  },
} as const;

export function ItineraryTimeline({
  dayGroups,
  tripId,
  bookings,
}: {
  dayGroups: DayGroup[];
  tripId: string;
  bookings: { status: BookingStatus }[];
}) {
  if (dayGroups.length === 0) {
    const reason = emptyTimelineReason(summarizeBookingStatuses(bookings));
    const copy = EMPTY_STATE_COPY[reason];

    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border p-8 text-center">
        <span className="text-4xl opacity-20" aria-hidden="true">
          {copy.icon}
        </span>
        <div>
          <p className="text-sm font-medium">{copy.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{copy.body}</p>
        </div>
        {reason === 'no-bookings' && <AddBookingDialog tripId={tripId} />}
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

- [ ] **Step 2: Pass bookings from the trip page**

In `app/(app)/trips/[tripId]/page.tsx`, update the timeline usage:

```tsx
<ItineraryTimeline dayGroups={dayGroups} tripId={tripId} bookings={trip.bookings} />
```

- [ ] **Step 3: Pass bookings from the demo page**

`ItineraryTimeline` has a second consumer: `app/demo/page.tsx:64`. Adding a required prop breaks it, so update that call site too — it already has `trip.bookings` in scope (used at line 29 to build `segments`):

```tsx
<ItineraryTimeline dayGroups={dayGroups} tripId={trip.id} bookings={trip.bookings} />
```

The demo trip is pre-seeded and fully parsed, so it never renders an empty state — this is purely to keep the build green.

- [ ] **Step 4: Verify manually**

Three states to check on a real trip: a trip with no bookings shows "No bookings yet" with the upload button; a trip mid-parse shows "Reading your bookings"; a trip where the only booking failed shows "We couldn't read your bookings" and no upload button.

- [ ] **Step 5: Typecheck, lint, and commit**

```bash
npm run typecheck && npm run lint
git add components/itinerary/ItineraryTimeline.tsx "app/(app)/trips/[tripId]/page.tsx" app/demo/page.tsx
git commit -m "fix: make the timeline empty state aware of booking status

A trip whose bookings all failed to parse rendered the 'No bookings yet' empty
state, telling the user to upload the file they had just uploaded."
```

---

## Final verification

- [ ] `npm run typecheck` — clean
- [ ] `npm run lint` — clean
- [ ] `npx vitest run` — all pass, including the 8 new tests from Task 1
- [ ] End-to-end on a real trip: upload a non-booking PDF, confirm the red banner appears, the bookings panel shows the error, "Try again" re-queues the job, and "Remove" deletes the booking and its R2 object.
- [ ] Confirm a successful upload still parses and lands on the timeline — the retry path touches `updateBookingStatus` and segment deletion, so the happy path needs a regression check.
