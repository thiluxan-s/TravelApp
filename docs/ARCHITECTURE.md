# Architecture

## System diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                     Next.js 15 App (Vercel)                      │
│                                                                  │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│   │   Server     │    │   Server     │    │  API Route   │       │
│   │  Components  │    │   Actions    │    │   Handlers   │       │
│   │  (read DB)   │    │  (mutations) │    │  (webhooks)  │       │
│   └──────┬───────┘    └──────┬───────┘    └──────┬───────┘       │
│          │                   │                   │               │
│          └───────────────────┴───────────────────┘               │
│                              │                                   │
│                  ┌───────────┴────────────┐                      │
│                  │   Clerk middleware     │                      │
│                  │  (auth on all (app)/)  │                      │
│                  └────────────────────────┘                      │
└──────────────────────────────────────────────────────────────────┘
       │              │              │              │
       ▼              ▼              ▼              ▼
  ┌─────────┐   ┌──────────┐  ┌──────────┐  ┌──────────────┐
  │  Neon   │   │ Cloudflare│  │ Inngest  │  │  Anthropic   │
  │Postgres │   │     R2    │  │(jobs)    │  │   API        │
  │+Drizzle │   │  (PDFs)   │  │          │  │  (vision)    │
  └─────────┘   └──────────┘  └────┬─────┘  └──────────────┘
                                   │
                                   ▼
                          ┌────────────────┐
                          │ Mapbox APIs    │
                          │ (geocoding,    │
                          │  maps frontend)│
                          └────────────────┘
```

## The booking upload flow — the critical path

This is the most important flow in the app. Get this right and everything else follows.

```
1. USER drops PDF in upload component
                │
                ▼
2. CLIENT requests presigned R2 upload URL via Server Action
                │
                ▼
3. SERVER ACTION
   - Verifies user owns the trip
   - Creates a Booking row: status='uploading', trip_id, file_key
   - Generates presigned R2 PUT URL
   - Returns { uploadUrl, bookingId }
                │
                ▼
4. CLIENT uploads file directly to R2 via presigned URL
                │
                ▼
5. CLIENT calls Server Action: bookingUploaded(bookingId)
                │
                ▼
6. SERVER ACTION
   - Flips booking status to 'parsing'
   - Triggers Inngest event: booking.uploaded { bookingId }
   - Returns immediately to client (optimistic UI continues)
                │
                ▼
7. INNGEST JOB picks up the event
   - Fetches the PDF from R2
   - Determines booking type (flight vs hotel) via a classifier prompt
   - Calls Anthropic with vision + the type-specific Zod schema
   - Validates AI output with Zod
   - Geocodes addresses via Mapbox
   - Writes Booking.status='parsed', creates Segment rows
   - On failure: marks status='parsing_failed', stores error
                │
                ▼
8. UI revalidates (Server Action triggered by job completion via Inngest event,
   OR client polls bookings list every 3s while any are still 'parsing')
                │
                ▼
9. USER sees the booking pop into the itinerary
```

### Why this shape

- **Direct-to-R2 upload (presigned URL)** keeps large files off the Vercel function (Vercel functions have payload limits and we'd waste bandwidth).
- **Background job, not inline parsing** — PDF vision parsing takes 5–15 seconds. Doing that inline would block the request, time out on Vercel, and feel terrible. The "parsing..." card is a feature, not a workaround.
- **Two-stage status (uploading → parsing → parsed/failed)** lets the UI show distinct states. "Uploading" can fail fast on network issues. "Parsing" can show a friendly "this is the AI step, hang tight" message.
- **Classifier prompt then type-specific prompt** keeps each prompt focused. A single mega-prompt that handles all booking types is worse at every one.

## Daily itinerary — how the "wow" feature works

The itinerary view is *derived*, not stored. When the page loads:

```
1. Query all segments for the trip, joined with their booking.
2. Group segments by local date (using each segment's IANA timezone).
3. Sort within each day chronologically.
4. For each adjacent pair of segments within a day, compute annotations:
   - Time gap between end of A and start of B
   - Geographic distance (haversine on lat/lng)
   - Conflict flags (e.g. flight lands after hotel check-in window closes)
5. Render the timeline (left pane) and map (right pane).
6. Map shows pins for the currently selected day; hovering a timeline event
   highlights the corresponding pin.
```

**Annotations are computed deterministically, no AI.** This is intentional. AI parses the unstructured PDF; structured code does the reasoning. Faster, cheaper, more reliable, easier to test.

## Layers

### Presentation layer
- React Server Components for reads (no client-side data fetching needed for initial loads).
- Server Actions for mutations.
- shadcn/ui as the component primitives, Tailwind for layout.
- Mapbox GL JS for the map (it's the only thing in the itinerary that genuinely needs to be a client component).

### Application layer
- Server Actions in `app/(app)/.../actions.ts` colocated with routes.
- Shared business logic in `lib/` — pure functions where possible.
- Inngest functions in `lib/inngest/functions/`.

### Data layer
- Drizzle ORM as the only thing that talks to Postgres.
- All queries go through repository functions in `lib/db/repositories/`. No raw Drizzle calls in components or actions.

### Integration layer (external services)
- One client wrapper per external service: `lib/r2/`, `lib/mapbox/`, `lib/ai/`, `lib/inngest/`.
- Each wrapper exports a small typed surface. Tests can mock at the wrapper level.

## Authentication and authorization

- Clerk handles auth (sign in, sign up, sessions, user data).
- `middleware.ts` enforces auth for all routes under `app/(app)/`.
- We store `clerk_user_id` on the User row in Postgres and use it as the foreign key for trips.
- **Every** server action and query that touches user data must check `auth().userId` and verify the resource belongs to that user. This is a class of bug that's easy to introduce — treat it as a checklist item on every PR.

## Environment configuration

All env vars validated by Zod at startup in `lib/env.ts`. If anything is missing or malformed, the app refuses to boot. The schema lives alongside the app — no separate config service.

Required env vars (will end up in `.env.example`):
- `DATABASE_URL` — Neon connection string
- `CLERK_SECRET_KEY` / `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `ANTHROPIC_API_KEY`
- `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` / `R2_PUBLIC_URL`
- `NEXT_PUBLIC_MAPBOX_TOKEN` / `MAPBOX_SECRET_TOKEN`
- `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY`

## What we are *not* building (and why)

- **No Redis / no caching layer.** Premature. Next.js + Server Component caching is enough.
- **No vector DB / no embeddings.** The Q&A feature is v2.
- **No queue beyond Inngest.** Inngest is the queue.
- **No separate API service.** Next.js Server Actions are the API.
- **No GraphQL.** Server Actions and direct Drizzle queries are simpler.
- **No state management library** (Redux, Zustand, MobX). Server state lives on the server. Local UI state uses `useState`. If we genuinely need shared client state, we'll add it then.
- **No testing framework over-configured up front.** Vitest gets added when the TDD skill needs it (likely Phase 3 for parsing logic and conflict detection). Don't pre-build a testing harness for code that doesn't exist yet.

## Risks and how we mitigate

| Risk | Mitigation |
|------|------------|
| PDF parsing fails on edge cases (scanned, low quality, multi-language) | Surface failure clearly; don't crash. Manual edit/delete always available. |
| Vercel function timeout on heavy operations | Move anything >5s to Inngest. Itinerary view is a SQL query, not a computation. |
| User uploads a non-booking PDF (random doc) | Classifier prompt returns 'unknown'; we mark `parsing_failed` with a friendly message. |
| Mapbox monthly limit | Cache geocoded coordinates on the Segment row. Geocode once, never again for the same address. |
| Free tier limits hit during demo | Pre-warm a demo trip on the deployed app so a recruiter doesn't have to upload to see value. |
| Costs balloon from Anthropic API during dev | Use the smallest capable vision model. Limit retries. Don't re-parse on every dev save — cache parsed output to a fixture file during development. |
