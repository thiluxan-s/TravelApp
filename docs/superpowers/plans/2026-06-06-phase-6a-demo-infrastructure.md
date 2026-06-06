# Phase 6A — Demo Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a public `/demo` route showing a pre-seeded Tokyo itinerary so a recruiter can see the full app experience without signing up.

**Architecture:** A seed script inserts demo data using a hardcoded trip UUID and a minimal Drizzle connection (DATABASE_URL only — bypasses the full env validation in `lib/env.server.ts`). The `/demo` page lives outside the `(app)` route group so it skips the layout-level auth check naturally. All existing rendering components (`ItineraryTimeline`, `MapPanel`) are reused without modification. Note: trips-list empty state, trip-detail empty state, and booking auto-refresh are **already implemented** — no work needed for those.

**Tech Stack:** Next.js App Router (Server Components), Drizzle ORM (neon-http), tsx (transitively available at `node_modules/.bin/tsx`), Neon Postgres

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `lib/env.server.ts` | Modify | Add `DEMO_TRIP_ID` to Zod schema |
| `.env.example` | Modify | Document `DEMO_TRIP_ID` with the hardcoded UUID |
| `scripts/seed-demo.ts` | Create | Idempotent seed script — inserts demo user, trip, bookings, segments |
| `package.json` | Modify | Add `seed:demo` npm script |
| `app/demo/page.tsx` | Create | Public demo route — renders trip without auth |
| `app/page.tsx` | Modify | Add "See a live demo →" CTA button |

---

## Hardcoded constants (used across tasks — do not change)

```
DEMO_TRIP_ID  = '3a4b5c6d-7e8f-4a1b-8c2d-9e0f1a2b3c4d'
DEMO_CLERK_ID = 'user_demo'
DEMO_EMAIL    = 'demo@wayfare.app'
```

---

## Task 1: Add DEMO_TRIP_ID env var

**Files:**
- Modify: `lib/env.server.ts`
- Modify: `.env.example`

- [ ] **Step 1: Add to env schema**

Open `lib/env.server.ts`. The current file:

```ts
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  CLERK_SECRET_KEY: z.string().min(1),
  CLERK_WEBHOOK_SECRET: z.string().min(1),
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET_NAME: z.string().min(1),
  R2_PUBLIC_URL: z.string().url(),
  ANTHROPIC_API_KEY: z.string().min(1),
  MAPBOX_SECRET_TOKEN: z.string().min(1),
  INNGEST_EVENT_KEY: z.string().min(1),
  INNGEST_SIGNING_KEY: z.string().optional(),
});

export const env = envSchema.parse(process.env);
```

Replace with:

```ts
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  CLERK_SECRET_KEY: z.string().min(1),
  CLERK_WEBHOOK_SECRET: z.string().min(1),
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET_NAME: z.string().min(1),
  R2_PUBLIC_URL: z.string().url(),
  ANTHROPIC_API_KEY: z.string().min(1),
  MAPBOX_SECRET_TOKEN: z.string().min(1),
  INNGEST_EVENT_KEY: z.string().min(1),
  INNGEST_SIGNING_KEY: z.string().optional(),
  DEMO_TRIP_ID: z.string().uuid(),
});

export const env = envSchema.parse(process.env);
```

- [ ] **Step 2: Add to .env.example**

Append to `.env.example`:

```
# Demo trip — hardcoded UUID for the public /demo route seed data
DEMO_TRIP_ID=3a4b5c6d-7e8f-4a1b-8c2d-9e0f1a2b3c4d
```

- [ ] **Step 3: Add to your local .env.local**

Add the same line to `.env.local`:

```
DEMO_TRIP_ID=3a4b5c6d-7e8f-4a1b-8c2d-9e0f1a2b3c4d
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/env.server.ts .env.example
git commit -m "feat: add DEMO_TRIP_ID env var for public demo route"
```

---

## Task 2: Create seed script

**Files:**
- Create: `scripts/seed-demo.ts`
- Modify: `package.json`

The seed script uses a minimal Drizzle connection directly (no `lib/env.server.ts`) so it only needs `DATABASE_URL`. It is fully idempotent — safe to run multiple times.

- [ ] **Step 1: Create `scripts/` directory and the seed file**

Create `scripts/seed-demo.ts` with this content:

```ts
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { eq } from 'drizzle-orm';
import {
  users,
  trips,
  bookings,
  segments,
} from '../lib/db/schema';
import * as schema from '../lib/db/schema';

const DEMO_TRIP_ID = '3a4b5c6d-7e8f-4a1b-8c2d-9e0f1a2b3c4d';
const DEMO_CLERK_ID = 'user_demo';

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

async function seed() {
  // ── 1. Upsert demo user ─────────────────────────────────────────────────────
  await db
    .insert(users)
    .values({ clerkUserId: DEMO_CLERK_ID, email: 'demo@wayfare.app' })
    .onConflictDoNothing();

  const demoUser = await db.query.users.findFirst({
    where: eq(users.clerkUserId, DEMO_CLERK_ID),
  });
  if (!demoUser) throw new Error('Failed to get/create demo user');

  // ── 2. Skip if already seeded ───────────────────────────────────────────────
  const existingTrip = await db.query.trips.findFirst({
    where: eq(trips.id, DEMO_TRIP_ID),
  });
  if (existingTrip) {
    console.log('✓ Demo data already seeded. Trip ID:', DEMO_TRIP_ID);
    process.exit(0);
  }

  // ── 3. Trip ──────────────────────────────────────────────────────────────────
  await db.insert(trips).values({
    id: DEMO_TRIP_ID,
    userId: demoUser.id,
    title: 'Tokyo · March 2026',
    destination: 'Tokyo, Japan',
  });

  // ── 4. Outbound flight YYZ → NRT ─────────────────────────────────────────────
  const [outboundBooking] = await db
    .insert(bookings)
    .values({
      tripId: DEMO_TRIP_ID,
      type: 'flight',
      status: 'parsed',
      fileKey: 'demo/outbound-flight.pdf',
      fileName: 'outbound-flight.pdf',
      fileSizeBytes: 102400,
      mimeType: 'application/pdf',
    })
    .returning();

  if (!outboundBooking) throw new Error('Failed to insert outbound flight booking');

  await db.insert(segments).values({
    bookingId: outboundBooking.id,
    tripId: DEMO_TRIP_ID,
    type: 'flight',
    startTime: new Date('2026-03-10T14:00:00-04:00'),
    startTimezone: 'America/Toronto',
    endTime: new Date('2026-03-11T18:00:00+09:00'),
    endTimezone: 'Asia/Tokyo',
    startLocation: 'Toronto Pearson (YYZ)',
    startLat: '43.677700',
    startLng: '-79.624800',
    endLocation: 'Tokyo Narita (NRT)',
    endLat: '35.772000',
    endLng: '140.392900',
    details: {
      flight_number: 'AC001',
      airline: 'Air Canada',
      confirmation_code: 'ABC123',
      departure_airport_code: 'YYZ',
      arrival_airport_code: 'NRT',
      departure_terminal: '1',
      arrival_terminal: '3',
      seat: '42A',
      cabin_class: 'Economy',
    },
  });

  // ── 5. Hotel ──────────────────────────────────────────────────────────────────
  const [hotelBooking] = await db
    .insert(bookings)
    .values({
      tripId: DEMO_TRIP_ID,
      type: 'hotel',
      status: 'parsed',
      fileKey: 'demo/hotel.pdf',
      fileName: 'hotel.pdf',
      fileSizeBytes: 89600,
      mimeType: 'application/pdf',
    })
    .returning();

  if (!hotelBooking) throw new Error('Failed to insert hotel booking');

  await db.insert(segments).values({
    bookingId: hotelBooking.id,
    tripId: DEMO_TRIP_ID,
    type: 'hotel_stay',
    startTime: new Date('2026-03-11T18:00:00+09:00'),
    startTimezone: 'Asia/Tokyo',
    endTime: new Date('2026-03-14T11:00:00+09:00'),
    endTimezone: 'Asia/Tokyo',
    startLocation: 'Park Hyatt Tokyo',
    startLat: '35.689600',
    startLng: '139.691700',
    endLocation: 'Park Hyatt Tokyo',
    endLat: '35.689600',
    endLng: '139.691700',
    details: {
      hotel_name: 'Park Hyatt Tokyo',
      address: '3-7-1-2 Nishi Shinjuku, Shinjuku-ku, Tokyo 163-1055',
      confirmation_code: 'HTL456789',
      room_type: 'Park Deluxe Room',
      guests: 1,
      check_in_time: '15:00',
      check_out_time: '12:00',
      phone: '+81-3-5322-1234',
    },
  });

  // ── 6. Return flight NRT → YYZ ────────────────────────────────────────────────
  const [returnBooking] = await db
    .insert(bookings)
    .values({
      tripId: DEMO_TRIP_ID,
      type: 'flight',
      status: 'parsed',
      fileKey: 'demo/return-flight.pdf',
      fileName: 'return-flight.pdf',
      fileSizeBytes: 98304,
      mimeType: 'application/pdf',
    })
    .returning();

  if (!returnBooking) throw new Error('Failed to insert return flight booking');

  await db.insert(segments).values({
    bookingId: returnBooking.id,
    tripId: DEMO_TRIP_ID,
    type: 'flight',
    startTime: new Date('2026-03-14T17:00:00+09:00'),
    startTimezone: 'Asia/Tokyo',
    endTime: new Date('2026-03-14T15:00:00-04:00'),
    endTimezone: 'America/Toronto',
    startLocation: 'Tokyo Narita (NRT)',
    startLat: '35.772000',
    startLng: '140.392900',
    endLocation: 'Toronto Pearson (YYZ)',
    endLat: '43.677700',
    endLng: '-79.624800',
    details: {
      flight_number: 'AC002',
      airline: 'Air Canada',
      confirmation_code: 'DEF456',
      departure_airport_code: 'NRT',
      arrival_airport_code: 'YYZ',
      departure_terminal: '1',
      arrival_terminal: '1',
      seat: '38C',
      cabin_class: 'Economy',
    },
  });

  console.log('✓ Demo data seeded successfully!');
  console.log('  Trip ID:', DEMO_TRIP_ID);
  console.log('  Set DEMO_TRIP_ID=' + DEMO_TRIP_ID + ' in .env.local and Vercel.');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Add `seed:demo` script to package.json**

Open `package.json`. In the `"scripts"` block, add after the existing scripts:

```json
"seed:demo": "node --env-file=.env.local node_modules/.bin/tsx scripts/seed-demo.ts"
```

The full scripts block should look like:

```json
"scripts": {
  "dev": "next dev --turbopack",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate",
  "db:push": "drizzle-kit push",
  "seed:demo": "node --env-file=.env.local node_modules/.bin/tsx scripts/seed-demo.ts"
}
```

- [ ] **Step 3: Run the seed script**

```bash
npm run seed:demo
```

Expected output:
```
✓ Demo data seeded successfully!
  Trip ID: 3a4b5c6d-7e8f-4a1b-8c2d-9e0f1a2b3c4d
  Set DEMO_TRIP_ID=3a4b5c6d-7e8f-4a1b-8c2d-9e0f1a2b3c4d in .env.local and Vercel.
```

If you run it a second time, expected output:
```
✓ Demo data already seeded. Trip ID: 3a4b5c6d-7e8f-4a1b-8c2d-9e0f1a2b3c4d
```

- [ ] **Step 4: Verify data in Neon**

In your Neon dashboard (console.neon.tech), run:

```sql
SELECT id, title, destination FROM trips WHERE id = '3a4b5c6d-7e8f-4a1b-8c2d-9e0f1a2b3c4d';
SELECT type, status, file_name FROM bookings WHERE trip_id = '3a4b5c6d-7e8f-4a1b-8c2d-9e0f1a2b3c4d';
SELECT type, start_location, end_location, start_lat FROM segments WHERE trip_id = '3a4b5c6d-7e8f-4a1b-8c2d-9e0f1a2b3c4d';
```

Expected: 1 trip, 3 bookings, 3 segments with non-null coordinates.

- [ ] **Step 5: Commit**

```bash
git add scripts/seed-demo.ts package.json
git commit -m "feat: add demo data seed script for Tokyo trip"
```

---

## Task 3: Public demo page

**Files:**
- Create: `app/demo/page.tsx`

This page is outside the `(app)` route group so it uses the root layout (`app/layout.tsx` — ClerkProvider + body only) and skips the layout-level auth redirect in `app/(app)/layout.tsx`. No middleware changes needed.

- [ ] **Step 1: Create `app/demo/page.tsx`**

```tsx
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { getTripWithBookings } from '@/lib/db/repositories/trips';
import { groupSegmentsByDay } from '@/lib/itinerary/group-by-day';
import { ItineraryTimeline } from '@/components/itinerary/ItineraryTimeline';
import { MapPanel } from '@/components/itinerary/MapPanel';
import { env } from '@/lib/env.server';

export default async function DemoPage() {
  const trip = await getTripWithBookings(env.DEMO_TRIP_ID);

  if (!trip) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">
          Demo unavailable — please check back later.
        </p>
      </div>
    );
  }

  const segments = trip.bookings.flatMap((b) => b.segments);
  const dayGroups = groupSegmentsByDay(segments);
  const days = dayGroups.map((d) => ({ date: d.date, label: d.label }));

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Wayfare
          </Link>
          <Button asChild size="sm">
            <Link href="/sign-up">Sign up free</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {/* Trip header */}
        <div className="mb-6">
          <div className="mb-1 flex items-center gap-2">
            <h1 className="text-xl font-semibold">{trip.title}</h1>
            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-semibold tracking-wider text-amber-500">
              DEMO
            </span>
          </div>
          {trip.destination && (
            <p className="text-sm text-muted-foreground">{trip.destination}</p>
          )}
        </div>

        {/* Itinerary + Map */}
        <div className="lg:grid lg:grid-cols-[3fr_2fr] lg:gap-6">
          <div>
            <ItineraryTimeline dayGroups={dayGroups} tripId={trip.id} />
          </div>
          {segments.length > 0 && days.length > 0 && (
            <div className="mt-6 lg:sticky lg:top-6 lg:mt-0 lg:h-[calc(100vh-8rem)]">
              <MapPanel segments={segments} days={days} />
            </div>
          )}
        </div>

        {/* Bottom CTA */}
        <div className="mt-12 flex items-center justify-between rounded-lg border border-border bg-card p-6">
          <div>
            <p className="font-medium">Like what you see?</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload your own bookings and build your itinerary in minutes.
            </p>
          </div>
          <Button asChild>
            <Link href="/sign-up">Create your own trip →</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Smoke test locally**

Start the dev server (`npm run dev`). Visit `http://localhost:3000/demo` — you should see:
- Wayfare nav with "Sign up free" button
- "Tokyo · March 2026" heading with amber "DEMO" badge
- Three segments across three day tabs: Mar 10 (YYZ departure), Mar 11 (NRT arrival + hotel check-in), Mar 14 (return flight)
- Mapbox map with pins — Mar 10 tab shows two blue pins (YYZ and NRT with dashed line), Mar 11 tab shows two blue pins + one purple hotel pin, Mar 14 tab shows two blue pins (NRT→YYZ)
- Bottom CTA card: "Like what you see? Create your own trip →"

Verify there is NO auth redirect when visiting `/demo` without being signed in (open in an incognito window).

- [ ] **Step 4: Commit**

```bash
git add app/demo/page.tsx
git commit -m "feat: add public demo route showing pre-seeded Tokyo trip"
```

---

## Task 4: Add "See a live demo →" to landing page

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Add the button**

In `app/page.tsx`, find the CTA button group (around line 241):

```tsx
<div className="fu fu-5" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
  <Button render={<Link href="/sign-up" />} className="lp-btn-primary" size="lg">
    Start for free
  </Button>
  <Button render={<Link href="/sign-in" />} className="lp-btn-ghost" size="lg">
    Sign in →
  </Button>
</div>
```

Replace with:

```tsx
<div className="fu fu-5" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
  <Button render={<Link href="/sign-up" />} className="lp-btn-primary" size="lg">
    Start for free
  </Button>
  <Button render={<Link href="/demo" />} className="lp-btn-ghost" size="lg">
    See a live demo →
  </Button>
  <Button render={<Link href="/sign-in" />} className="lp-btn-ghost" size="lg">
    Sign in →
  </Button>
</div>
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Smoke test landing page**

Visit `http://localhost:3000`. Verify three buttons appear: "Start for free", "See a live demo →", "Sign in →". Click "See a live demo →" — it should navigate to `/demo`.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat: add 'See a live demo' CTA to landing page"
```

---

## Task 5: Deploy and set Vercel env var

- [ ] **Step 1: Push to Vercel**

```bash
git push
```

Wait for the Vercel deployment to complete.

- [ ] **Step 2: Add DEMO_TRIP_ID to Vercel**

In the Vercel dashboard → your project → Settings → Environment Variables, add:

```
Name:  DEMO_TRIP_ID
Value: 3a4b5c6d-7e8f-4a1b-8c2d-9e0f1a2b3c4d
```

Set it for Production (and Preview if you want). Trigger a redeploy after adding it.

- [ ] **Step 3: Verify production demo**

Visit `https://your-app.vercel.app/demo` in an incognito window (no auth). Confirm:
- The Tokyo trip renders with flight and hotel cards
- Mapbox map shows pins in Tokyo and Toronto
- Bottom CTA links to `/sign-up`
- No auth redirect

---

## Task 6: Final smoke test

- [ ] **Step 1: Verify existing empty states (already implemented)**

Sign in as a fresh user with no trips. Go to `/trips` — should show "No trips yet" with a "Create your first trip" button and a `NewTripDialog`.

Create a new trip (no bookings). The itinerary section should show the "No bookings yet" empty state with an upload prompt.

- [ ] **Step 2: Verify ParsingBanner auto-refresh (already implemented)**

Upload a booking PDF. Confirm the amber "Parsing 1 booking… results will appear automatically" banner appears and updates automatically when parsing completes (no manual page refresh needed).

- [ ] **Step 3: Confirm no regressions on authenticated trip pages**

Navigate to a real trip with parsed bookings. Confirm the itinerary + map renders correctly, day tabs work, and hover sync between cards and pins works.
