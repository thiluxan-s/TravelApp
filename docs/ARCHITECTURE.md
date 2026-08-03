# Architecture

## System diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                     Next.js 16 App (Vercel)                      │
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
│                  │  proxy.ts (Clerk auth) │                      │
│                  │ non-public routes only │                      │
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
   - Classifies the booking type, then looks up its handler in the registry
   - Calls Anthropic with vision + the handler's Zod schema
   - Validates AI output with Zod
   - Geocodes the handler's geocode targets via Mapbox
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

### The booking-type registry

The parse job is **type-agnostic**. It classifies, looks up one handler, and runs the same four steps — extract, geocode, write — for every booking type, with no branching.

```
lib/ai/booking-types/
  index.ts        // the registry: Record<HandledBookingType, BookingTypeHandler>
  flight.ts       // prompts, schemas, geocode targets, segment mapper
  hotel.ts
  train.ts
  reservation.ts
```

Each handler owns its prompts, tool name, JSON schema, geocode targets, and segment mapper. `lib/ai/prompts/` and `lib/ai/schemas/` stay where they are — the handlers *compose* them rather than absorbing them, because the details schemas are also used for rendering well outside the parsing pipeline.

**Adding a booking type is one handler file plus one registry entry.** The job needs no structural change.

The registry is `Record<HandledBookingType, BookingTypeHandler>` where `HandledBookingType = Exclude<BookingType, 'unknown'>` derives from the pgEnum, so **adding an enum value without a handler is a compile error**. A booking type cannot be half-landed. The classifier's system prompt and every user-facing list of supported types are generated from the registry, so they cannot drift from the handlers.

Note the parallel on the render side: `DaySection` has `CARD_BY_SEGMENT_TYPE` and the calendar export has `EVENT_BY_SEGMENT_TYPE`, both `Record<SegmentType, …>`. These are deliberately *separate* registries — the parse-side one is keyed by booking type and its methods take `unknown` (raw extraction JSON rehydrated across an Inngest step boundary), while the render-side ones are keyed by segment type and take a typed `Segment` row. Same exhaustiveness guarantee, different key and lifecycle.

## Daily itinerary — how the "wow" feature works

The itinerary view is *derived*, not stored. When the page loads:

```
1. Query all segments for the trip, joined with their booking.
2. Group segments by local date (using each segment's IANA timezone).
3. Sort within each day chronologically.
4. Resolve lodging per night, and create day groups for covered nights that
   have no segments of their own.
5. For each adjacent pair of segments within a day, compute annotations:
   - Time gap between end of A and start of B
   - Geographic distance (haversine on lat/lng)
   - Conflict flags (e.g. flight lands after hotel check-in window closes)
6. Render the timeline (left pane) and map (right pane).
7. Map shows pins for the currently selected day; hovering a timeline event
   highlights the corresponding pin.
```

**Annotations are computed deterministically, no AI.** This is intentional. AI parses the unstructured PDF; structured code does the reasoning. Faster, cheaper, more reliable, easier to test.

**Step 3 is load-bearing, not cosmetic.** Callers build the segment list with `trip.bookings.flatMap((b) => b.segments)`, and bookings come back ordered by `created_at` — so the input is ordered by *upload* time, not itinerary time. Without the sort, a hotel uploaded before an earlier flight on the same day renders backwards and `computeAnnotations` pairs them in reverse, reporting a confident "these bookings overlap in time" on two events that don't. The sort lives in `groupSegmentsByDay` rather than at the call sites so the guarantee holds for every caller.

**Lodging (step 4) is derived per night and kept OUT of the `segments` array.** A three-night stay is keyed only to its check-in day, so without this the middle nights show nothing about where you are sleeping — and a night whose only content is the stay produces no day group at all. `DayGroup` therefore carries `lodging: Segment | null`, populated for every night from check-in through the night *before* checkout (you are not staying somewhere the morning you leave).

Keeping it out of `segments` is the load-bearing part: as a regular member it would pair with the day's real events and report a gap measured from a hotel that started two days ago. A separate field makes that impossible rather than merely unlikely, which is why `computeAnnotations` needed no change.

## Calendar export

```
lib/itinerary/ics-format.ts   RFC 5545 text mechanics: escaping, folding, UTC stamps
lib/itinerary/to-ics.ts       segment → event mapping, VCALENDAR assembly
lib/itinerary/ics-response.ts the shared Response both routes return
```

Two route handlers: `/trips/[tripId]/calendar.ics` (Clerk-authed, ownership-checked, `force-dynamic`) and `/demo/calendar.ics` (public, `revalidate = 3600`). The asymmetry is deliberate — a user's trip changes whenever they add a booking, while the demo trip only changes on a deliberate re-seed, and `/demo` is itself a build-time snapshot.

Download, not a subscribable feed: a live `webcal://` feed needs a token column, an unauthenticated per-trip endpoint, and revocation UI, which is most of the deferred share-link feature. Times are emitted in UTC rather than hand-rolled `VTIMEZONE` blocks — we store `timestamptz`, so UTC is exact and clients render in the viewer's local time. Hotels emit two point events (check-in, check-out) rather than one multi-day block that would sit on top of everything else in a phone's day view.

**Note for anyone adding a public route under an existing public path:** `proxy.ts`'s `isPublicRoute` uses exact-match patterns. `'/demo'` does *not* match `/demo/calendar.ics` — the export shipped unreachable behind `auth.protect()` until an explicit entry was added. Enumerate each public path rather than opening a namespace with `'/demo(.*)'`.

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

## Testing

Vitest, `environment: 'node'`. Two kinds of test, and nothing else:

**Pure functions**, unit tested directly — itinerary grouping, annotations, the `.ics` serializer, booking-type handlers. Most of the suite.

**Server actions**, run for real against an in-process Postgres. `lib/db/__tests__/harness.ts` boots `@electric-sql/pglite`, applies the **committed migrations** from `drizzle/`, and exposes `createTestDb` / `resetTables` / `seedTwoUsers` / `seedBooking` / `seedSegment`. A test mocks `@/lib/db` to point at it; Drizzle query building, foreign keys, and cascades are all real.

Three things about this that are easy to get wrong:

- **The `@/lib/db` mock must use a getter** — `get db() { return h.db }` inside `vi.hoisted`. The mock factory is evaluated before `beforeAll` creates the database, so a plain value captures `undefined` forever.
- **Migrations, not `db:push`.** Applying the real migration files is what makes a broken migration fail the suite. Pushing from `schema.ts` would conceal exactly that.
- **Assert the specific error string.** Every action wraps its body in `try/catch` returning `'Something went wrong'`, so asserting only `ok === false` passes just as readily when the action *crashed* as when it correctly refused.

Migrations cost ~3s per test file, which is why the database is created once in `beforeAll` and reset by truncation between tests.

**What is not tested:** components, the Inngest parse job, and route handlers other than `.ics`. Production runs `neon-http` while tests run pglite — currently harmless, since nothing uses transactions, but `neon-http` has no transaction support at all and pglite does, so the first `db.transaction(...)` anyone writes will pass tests and throw in production.

## Authentication and authorization

- Clerk handles auth (sign in, sign up, sessions, user data).
- **`proxy.ts`** — Next 16's rename of `middleware.ts` — enforces auth for everything outside its `isPublicRoute` allowlist. Note it does **not** gate Server Actions, which are POST endpoints reachable regardless; the `auth()` call inside each action is the real gate.
- We store `clerk_user_id` on the User row in Postgres and use it as the foreign key for trips. `trips.user_id` is the **local** user id, not the Clerk id — resolve one to the other with `getUserByClerkId` before comparing.
- **Every** server action and query that touches user data must check `auth().userId` and verify the resource belongs to that user. This is a class of bug that's easy to introduce — treat it as a checklist item on every PR.
- These checks are now **tested**, not just reviewed: `lib/db/__tests__/harness.ts` runs the real actions against in-process pglite Postgres, seeds two users, and asserts the non-owner gets `Forbidden` and the row is left unchanged. Add a test there whenever you add an action that takes a resource id. Ownership is also duplicated in `app/(app)/trips/[tripId]/page.tsx` and the `.ics` route — the route's copy is covered, the page's is not.

## Environment configuration

All env vars validated by Zod at startup, split into **`lib/env.server.ts`** and **`lib/env.client.ts`** — the split exists because a single module would drag server-only secrets into the client bundle. If anything is missing or malformed, the app refuses to boot. The schema lives alongside the app — no separate config service.

`env.server.ts` parses at import, which matters under test: Vitest loads no `.env` files, so anything reaching an `env.server` importer throws a twelve-field `ZodError` at import time. `vitest.setup.ts` seeds syntactically valid dummies to keep that failure legible.

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
- **No component testing.** Vitest runs `environment: 'node'` — no jsdom, no testing-library. Pure functions are unit tested, and server actions are tested against a real database (see below). Components are verified by hand. Three dev dependencies for the least value per unit of setup remains the wrong trade.
- **No mocking library beyond Vitest's built-in `vi`.** The DB tests mock exactly four modules — `@/lib/db`, `@clerk/nextjs/server`, `@/lib/r2`, `@/lib/inngest/client` — which is the process boundary, not a convenience.

## Risks and how we mitigate

| Risk | Mitigation |
|------|------------|
| PDF parsing fails on edge cases (scanned, low quality, multi-language) | Surface failure clearly; don't crash. Manual edit/delete always available. |
| Vercel function timeout on heavy operations | Move anything >5s to Inngest. Itinerary view is a SQL query, not a computation. |
| User uploads a non-booking PDF (random doc) | Classifier prompt returns 'unknown'; we mark `parsing_failed` with a friendly message. |
| Mapbox monthly limit | Cache geocoded coordinates on the Segment row. Geocode once, never again for the same address. |
| Free tier limits hit during demo | Pre-warm a demo trip on the deployed app so a recruiter doesn't have to upload to see value. |
| Costs balloon from Anthropic API during dev | Use the smallest capable vision model. Limit retries. Don't re-parse on every dev save — cache parsed output to a fixture file during development. |
