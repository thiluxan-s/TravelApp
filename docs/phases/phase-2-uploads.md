# Phase 2 — Trip CRUD + Upload Pipeline

**Goal:** A user can create trips, view their list of trips, view a single trip, and upload PDF/image files for a trip. Files land in Cloudflare R2. No parsing yet — uploaded files just show as "parsing..." placeholders.

**Prerequisite:** Phase 1 complete.

## Deliverables (high level — fill in detail before starting)

1. Schema additions: `trips`, `bookings` tables.
2. Cloudflare R2 bucket provisioned, env vars added.
3. R2 client wrapper (`lib/r2/`) with `getPresignedUploadUrl(key)` and `getObject(key)`.
4. Server Actions:
   - `createTrip(input)` — creates a trip for the current user.
   - `listTrips()` — returns trips for the current user.
   - `getTrip(tripId)` — returns trip + bookings, with ownership check.
   - `deleteTrip(tripId)` — cascades through bookings/segments, deletes R2 files.
   - `requestBookingUpload({ tripId, fileName, fileSize, mimeType })` — returns presigned URL + booking ID.
   - `confirmBookingUploaded(bookingId)` — flips status to `parsing`. (Inngest trigger comes in phase 3.)
5. UI:
   - `/trips` — list of trips with "New trip" dialog.
   - `/trips/[tripId]` — trip detail page with title, dates, list of bookings, drag-and-drop upload zone.
   - Optimistic UI on upload: card appears immediately with "uploading..." then flips to "parsing..." (will stay "parsing..." until phase 3).
6. Empty states and loading states throughout.

## Notes for when we get here

- Limit upload to PDF + common image types (jpeg, png, webp, heic). Reject anything else client-side AND server-side.
- File size cap: 10 MB per file. Big enough for any real booking PDF, small enough to keep us inside free tiers.
- R2 keys: `{userId}/{tripId}/{bookingId}/{originalFileName}` — easy to navigate in the R2 console.
- Use shadcn's Dialog for "New trip", Sonner for toasts.

---

(More detail to be added before starting this phase.)
