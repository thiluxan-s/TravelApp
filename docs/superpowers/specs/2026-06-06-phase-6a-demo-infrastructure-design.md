# Phase 6A — Demo Infrastructure: Design Spec

**Date:** 2026-06-06
**Status:** Approved
**Phase doc:** `docs/phases/phase-6-polish.md`

---

## Goal

Let a recruiter see the full Wayfare itinerary experience — map, day tabs, flight and hotel cards — without signing up or uploading any PDFs. Authenticated users who haven't uploaded anything yet also get a clear, helpful experience instead of a blank page.

---

## What we're building

### 1. Public demo route (`/demo`)

A new Next.js page at `app/demo/page.tsx`, publicly accessible (no Clerk auth required). The Clerk middleware's public routes list gains `/demo`.

The page reads `DEMO_TRIP_ID` from env, calls `getTripWithBookings(demoTripId)`, and renders the same `ItineraryTimeline` + `MapPanel` components the real trip page uses — no duplication of rendering logic.

**Page layout (top to bottom):**
- Minimal nav bar: Wayfare wordmark (links to `/`) + "Sign up free →" button (links to `/sign-up`)
- Trip header with `DEMO` pill badge + trip name ("Tokyo · March 2026")
- Two-column itinerary + map grid (same layout as real trip page: `lg:grid lg:grid-cols-[3fr_2fr]`)
- Bottom CTA strip: "Like what you see? Create your own trip →" linking to `/sign-up`

**No top-nav bar with auth links** — the nav is minimal and scoped to the demo page only. The demo pill badge sits in the trip header, not a full-width banner.

### 2. Landing page CTA

`app/page.tsx` gains a third button in the hero CTA group: **"See a live demo →"** linking to `/demo`, styled as `lp-btn-ghost`. Sits between/after the existing "Start for free" and "Sign in →" buttons.

### 3. Seed script (`scripts/seed-demo.ts`)

A standalone TypeScript script run via `npx tsx scripts/seed-demo.ts`. Idempotent — checks for an existing trip with the demo ID before inserting. Uses Drizzle directly; no Inngest, no AI API calls.

**Inserted data:**

The trip uses a hardcoded UUID so `DEMO_TRIP_ID` can be committed in `.env.example` and does not require a copy-paste step after running the script. The UUID is defined as a constant at the top of the seed script.

| Row | Key fields |
|---|---|
| `users` | `clerk_id = 'user_demo'`, name "Demo User" |
| `trips` | id = `DEMO_TRIP_ID` constant, name "Tokyo · March 2026", userId = 'user_demo' |
| `bookings[0]` | type flight, status 'parsed', fileName 'outbound-flight.pdf' |
| `bookings[1]` | type hotel, status 'parsed', fileName 'hotel.pdf' |
| `bookings[2]` | type flight, status 'parsed', fileName 'return-flight.pdf' |
| `segments[0]` | YYZ→NRT, depart `2026-03-10T14:00:00-04:00` (EDT), arrive `2026-03-11T18:00:00+09:00` (JST), ~14h, Air Canada AC001 |
| `segments[1]` | Park Hyatt Tokyo, check-in `2026-03-11T18:00:00+09:00`, check-out `2026-03-14T11:00:00+09:00`, 3 nights |
| `segments[2]` | NRT→YYZ, depart `2026-03-14T14:00:00+09:00` (JST), arrive `2026-03-14T10:00:00-04:00` (EDT), ~11h, Air Canada AC002 |

**Timezones:** departure/arrival use `"America/Toronto"` and `"Asia/Tokyo"` respectively.

**Coordinates:**
- YYZ: lat 43.6777, lng -79.6248
- NRT: lat 35.7720, lng 140.3929
- Park Hyatt Tokyo (Shinjuku): lat 35.6896, lng 139.6917

The hardcoded UUID is also committed to `.env.example` as the default value for `DEMO_TRIP_ID`.

**`DEMO_TRIP_ID`** is added to `.env.example` and validated in `lib/env.server.ts`.

### 4. Empty state — trips list

`app/(app)/trips/page.tsx`: when the user has no trips, render a centred empty state instead of a blank page:
- Heading: "No trips yet"
- Subtext: "Create a trip, then upload your booking confirmations."
- Button: "Create your first trip →" (triggers the existing create-trip flow)

### 5. Empty state — trip with no bookings

`app/(app)/trips/[tripId]/page.tsx`: when the trip has no bookings, render a prompt card below the upload zone:
- Text: "Upload a flight or hotel confirmation to see your itinerary here."
- No action button needed — the upload zone is directly above.

### 6. Booking auto-refresh

A new client component `components/trips/BookingPoller.tsx`. Rendered in `app/(app)/trips/[tripId]/page.tsx` whenever any booking has `status === 'processing'`. Uses `useEffect` + `setInterval` (3 s interval) to call `router.refresh()`. Stops polling when no bookings with `status === 'processing'` remain in the current render.

`BookingPoller` receives `hasProcessing: boolean` as its only prop — the server component computes this from the fetched bookings array and passes it down.

---

## New files

| File | Purpose |
|---|---|
| `app/demo/page.tsx` | Public demo route |
| `scripts/seed-demo.ts` | Idempotent demo data seed script |
| `components/trips/BookingPoller.tsx` | Client polling component |

## Modified files

| File | Change |
|---|---|
| `middleware.ts` | Add `/demo` to public routes |
| `app/page.tsx` | Add "See a live demo →" button |
| `app/(app)/trips/page.tsx` | Add empty state |
| `app/(app)/trips/[tripId]/page.tsx` | Add booking empty state + render BookingPoller |
| `lib/env.server.ts` | Add `DEMO_TRIP_ID` validation |
| `.env.example` | Add `DEMO_TRIP_ID` placeholder |

---

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `DEMO_TRIP_ID` | `lib/env.server.ts` | UUID of the seeded demo trip |

---

## Error handling

| Scenario | Behaviour |
|---|---|
| `DEMO_TRIP_ID` not set | App refuses to boot (Zod env validation) |
| Demo trip not found in DB (seed not run) | `/demo` renders a "Demo unavailable" message rather than crashing |
| Seed script run twice | Skips insertion if trip with demo ID already exists |
| BookingPoller — `router.refresh()` fails | Silent — interval fires again in 3 s |

---

## Out of scope for 6A

- OG image, favicon (6B)
- Accessibility pass, mobile pass, failure mode UX (6C)
- Demo user Clerk account (not needed — the public page fetches by trip ID only)
- Nightly reset of demo data (overkill for a portfolio project; seed script can be re-run manually)
