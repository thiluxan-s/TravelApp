# Phase 2 — Trip CRUD + Upload Pipeline: Design Spec

**Date:** 2026-05-27
**Goal:** A signed-in user can create trips, view their trip list, open a trip detail page, and upload PDF/image booking confirmations. Files land in Cloudflare R2. Uploaded bookings show as "Parsing with AI…" placeholders — no actual parsing until Phase 3.

---

## Decisions made

| Question | Decision |
|----------|----------|
| Trip detail layout | Side-by-side: bookings + upload zone left, map placeholder right |
| New trip dialog fields | Title (required) + destination (optional free text) |
| Upload concurrency | `useOptimistic` + fully parallel per-file pipelines |
| Trips list style | 2-column grid cards with destination label |
| Booking card states | uploading (spinner + progress %), parsing (amber), parsed (green), parsing_failed (red) |

---

## Section 1 — Schema & data layer

### Prerequisite: env split

Before any client component can be added, `lib/env.ts` must be split:

- **`lib/env.server.ts`** — server-only vars: `DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`. Imported only by server components, actions, and route handlers. Never imported by client components.
- **`lib/env.client.ts`** — `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` only. Safe to import from client components.

Update all existing `@/lib/env` imports to `@/lib/env.server` (they are all server-side today).

### New tables

**`trips`**
```ts
{
  id: uuid (pk, defaultRandom)
  userId: uuid (fk → users.id, onDelete: cascade, indexed)
  title: text (notNull)
  destination: text (nullable)
  startDate: date (nullable)
  endDate: date (nullable)
  createdAt: timestamptz (notNull, defaultNow)
  updatedAt: timestamptz (notNull, defaultNow)
}
```

**`bookings`**
```ts
{
  id: uuid (pk, defaultRandom)
  tripId: uuid (fk → trips.id, onDelete: cascade, indexed)
  type: enum('flight', 'hotel', 'unknown') (default 'unknown')
  status: enum('uploading', 'parsing', 'parsed', 'parsing_failed')
  fileKey: text (notNull)        // R2 object key
  fileName: text (notNull)       // original filename for display
  fileSizeBytes: integer (notNull)
  mimeType: text (notNull)
  parseError: text (nullable)    // user-facing error when parsing_failed
  rawAiOutput: jsonb (nullable)  // stored for debugging; not indexed
  createdAt: timestamptz (notNull, defaultNow)
  updatedAt: timestamptz (notNull, defaultNow)
}
```

Index `bookings.tripId`. Both tables added to `lib/db/schema.ts` alongside `users`. Migration generated and applied before any UI work.

### New repositories

- **`lib/db/repositories/trips.ts`** — `createTrip`, `listTripsByUser`, `getTripById`, `deleteTripById`
- **`lib/db/repositories/bookings.ts`** — `createBooking`, `getBookingById`, `updateBookingStatus`, `getBookingsByTripId`, `deleteBookingsByTripId`

All functions accept explicit typed params (no raw Drizzle calls outside repositories).

---

## Section 2 — R2 client & env

### New dependencies

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

### `lib/r2/index.ts`

Exports two functions:

- **`getPresignedUploadUrl(key, mimeType, fileSizeBytes)`** — returns a presigned PUT URL valid for 10 minutes. R2 endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`.
- **`deleteObject(key)`** — used by `deleteTrip` to clean up files before the DB row is removed.

### R2 key format

```
{userId}/{tripId}/{bookingId}/{originalFileName}
```

Easy to navigate in the R2 console and scoped so no user can guess another's keys.

### New env vars (server-only — added to `lib/env.server.ts` and `.env.example`)

```
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=
```

### Checkpoint A — R2 credentials

Stop before implementing the upload flow. Ask the user to:
1. Go to dash.cloudflare.com → R2 → Create bucket.
2. Create an API token with Object Read & Write on that bucket.
3. Add the five vars to `.env.local` and Vercel environment variables.

---

## Section 3 — Server Actions

All actions return `{ ok: true, data } | { ok: false, error: string }`. Never throw across the boundary.

### `app/(app)/trips/actions.ts`

**`createTrip({ title, destination? })`**
- Auth check via `auth()`.
- Validates title is non-empty.
- Inserts trip row.
- Returns `{ ok: true, data: { tripId } }`. Caller redirects to `/trips/[tripId]`.

**`listTrips()`**
- Auth check.
- Returns trips for current user ordered by `createdAt` desc, including booking count per trip (derived via join or count query).

**`deleteTrip(tripId)`**
- Auth + ownership check.
- Fetches all bookings for the trip to get their `fileKey`s.
- Calls `deleteObject(key)` for each in parallel.
- Deletes the trip row (cascade removes bookings).
- Returns `{ ok: true }`.

### `app/(app)/trips/[tripId]/actions.ts`

**`getTrip(tripId)`**
- Auth + ownership check.
- Returns trip row + all bookings, ordered by `createdAt`.
- Used by the polling loop on the client.

**`requestBookingUpload({ tripId, fileName, fileSize, mimeType })`**
- Auth + trip ownership check.
- **Server-side validation:** mimeType must be one of `application/pdf`, `image/jpeg`, `image/png`, `image/webp`, `image/heic`. fileSize must be ≤ 10,485,760 bytes (10 MB). Returns `{ ok: false, error }` if invalid.
- Generates R2 key: `{userId}/{tripId}/{newBookingId}/{fileName}`.
- Creates booking row with `status: 'uploading'`.
- Calls `getPresignedUploadUrl(key, mimeType, fileSize)`.
- Returns `{ ok: true, data: { uploadUrl, bookingId } }`.

**`confirmBookingUploaded(bookingId)`**
- Auth + ownership check (booking → trip → user).
- Flips booking status from `'uploading'` to `'parsing'`.
- Returns `{ ok: true }`.
- Note: Inngest trigger wired in Phase 3. For now, status stays `'parsing'` until Phase 3.

---

## Section 4 — UI: Trips list (`/trips`)

### Page structure

Server Component. Calls `listTrips()` to get trips with booking counts.

**Header row:** "Your trips" heading + "+ New trip" button (amber, triggers dialog).

**Grid:** 2-column CSS grid of trip cards. Each card shows:
- Destination as a small coloured label (if set)
- Trip title (bold)
- Booking count + status summary (e.g. "2 bookings · 1 parsing")
- "Created N days ago" footer

**Empty state:** Replaces grid when no trips. Headline "No trips yet" + subtext + enabled "+ New trip" button (was disabled in Phase 1 — now active).

### New trip dialog

shadcn `Dialog` component. Two fields:
- **Trip name** (required) — text input, autofocused on open
- **Destination** (optional) — text input with placeholder "e.g. Tokyo, Japan"

On submit: calls `createTrip(...)`, then `router.push('/trips/${tripId}')` on success. Sonner toast on error.

**File:** `components/trips/NewTripDialog.tsx` — `"use client"` (manages dialog open state and form submission).

---

## Section 5 — UI: Trip detail (`/trips/[tripId]`)

### Page structure

**`app/(app)/trips/[tripId]/page.tsx`** — Server Component. Fetches trip + bookings via `getTrip(tripId)`. Renders:
- Page header: back link, trip title, destination, delete button
- `<TripDetailClient tripId={tripId} initialData={trip} />` — client wrapper for polling

**`components/trips/TripDetailClient.tsx`** — `"use client"`. Receives initial server data, polls `getTrip` every 3 seconds while any booking has `status: 'parsing'`. Renders the two-column layout.

### Two-column layout

**Left pane — bookings + upload:**
- "Bookings" section label
- List of booking cards (see states below)
- `<BookingUploader tripId={tripId} />` drop zone pinned below the list

**Right pane — map placeholder:**
- Dark background, centred placeholder text: "Map view available once bookings are parsed"
- Phase 5 label. Replaced by live Mapbox map in Phase 5.

### Booking card states

| Status | Visual |
|--------|--------|
| `uploading` | Spinner + filename + "Uploading… N%" progress |
| `parsing` | Amber "Parsing with AI…" label + file type icon |
| `parsed` | Green "✓ Parsed" label + parsed name (e.g. "Park Hyatt Tokyo · Mar 13–22") |
| `parsing_failed` | Red "Couldn't parse this file" label + delete button |

---

## Section 6 — Upload flow & client state

### `components/trips/BookingUploader.tsx` (`"use client"`)

Renders the drag-and-drop zone (drop target + click-to-browse via hidden `<input type="file">`). Accepts multiple files.

**On drop/select:**
1. Filter files client-side: type in `['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']`, size ≤ 10 MB. Reject with Sonner toast for each invalid file.
2. `useOptimistic` adds a temporary booking card per valid file immediately (status: `uploading`, temp id).
3. For each valid file **in parallel**:
   a. Call `requestBookingUpload({ tripId, fileName, fileSize, mimeType })`.
   b. If `{ ok: false }`: update optimistic card to error state, show Sonner toast.
   c. If `{ ok: true }`: upload via `XMLHttpRequest` PUT to `uploadUrl` (XHR used instead of fetch because it exposes upload progress via `xhr.upload.onprogress`). Update optimistic card with live progress %.
   d. On XHR complete: call `confirmBookingUploaded(bookingId)`. Update optimistic card to `parsing` state.
   e. On XHR error: update optimistic card to error state.
4. `router.refresh()` after all uploads settle to replace optimistic state with server truth.

### Polling

`TripDetailClient` starts a `setInterval(3000)` when any booking has `status: 'parsing'`. Each tick calls `getTrip(tripId)` and updates local state. Clears the interval when no bookings remain in `parsing` state (all are `parsed` or `parsing_failed`).

---

## File map

```
lib/
  env.server.ts                          # renamed from env.ts (server-only vars)
  env.client.ts                          # NEXT_PUBLIC_ vars only
  db/
    schema.ts                            # + trips, bookings tables
    repositories/
      trips.ts                           # createTrip, listTripsByUser, getTripById, deleteTripById
      bookings.ts                        # createBooking, getBookingById, updateBookingStatus, etc.
  r2/
    index.ts                             # getPresignedUploadUrl, deleteObject
app/(app)/
  trips/
    page.tsx                             # trips list (server component)
    actions.ts                           # createTrip, listTrips, deleteTrip
    [tripId]/
      page.tsx                           # trip detail (server component, renders TripDetailClient)
      actions.ts                         # getTrip, requestBookingUpload, confirmBookingUploaded
components/
  trips/
    NewTripDialog.tsx                    # "use client" — new trip form in shadcn Dialog
    TripDetailClient.tsx                 # "use client" — polling wrapper + two-col layout
    BookingUploader.tsx                  # "use client" — drag-drop zone + useOptimistic upload
    BookingCard.tsx                      # renders one booking in correct state (can be server)
drizzle/
  000X_phase2_trips_bookings.sql        # generated migration
```

---

## Checkpoints

**Checkpoint A — R2 credentials** (before upload flow implementation): provision R2 bucket, create API token, add 5 env vars to `.env.local` and Vercel.

---

## Out of scope for Phase 2

- Actual AI parsing (Phase 3)
- Inngest job trigger (Phase 3) — `confirmBookingUploaded` sets status to `parsing` and stops there
- Live map (Phase 5)
- Trip editing (title/destination editable post-creation) — not in PRD for v1
- `segments` table — created in Phase 3 alongside parsing logic
