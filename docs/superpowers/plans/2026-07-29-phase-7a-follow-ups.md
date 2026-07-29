# Phase 7A — Deferred Follow-Ups

Findings from the Phase 7A reviews that were deliberately not fixed in that branch. Recorded here so they survive; the review workspace was scratch.

---

## Fold into Phase 7B (registry refactor)

### 1. `parsing_failed` is written before Inngest has finished retrying — Important

`lib/inngest/functions/parse-booking.ts:225-231` writes `status: 'parsing_failed'` in the outer catch **and then rethrows**. The rethrow is what schedules the retry, and `inngest.createFunction` at `:22-23` sets no `retries`, so the default of 4 applies. On any thrown error — a Mapbox timeout, an Anthropic 429 or 5xx — the row flips to `parsing_failed` on attempt 0 while attempts 1–4 are still queued.

Phase 7A's new UI makes this actively misleading:

- The red banner and the "We couldn't read your bookings" timeline state assert a failure Inngest is in the middle of recovering from.
- **Polling stops at that moment.** `ParsingBanner` only sets its interval when `inFlight > 0`, and `parsing_failed` is not in flight. When a later attempt succeeds and sets `parsed`, nothing refreshes — the user sits on a red error for a booking that parsed fine, until they manually reload.
- "Try again" is live during that window. Clicking it queues a second run racing the pending auto-retry, paying for an extra Claude vision call. It converges — `segmentExistsForBooking` prevents duplicate segments and the server-side status check reads fresh state — but by luck of a guard rather than design.

The AI-content failures (unknown document, no tool block, schema mismatch) correctly `return` instead of throwing, so those are genuinely terminal and the UI is honest about them. Only the infrastructure-error path lies.

**Fix:** move terminal-failure bookkeeping out of the per-attempt catch and into Inngest's `onFailure` handler, which fires once after retries are exhausted. Wrap genuinely non-retriable errors in `NonRetriableError`. Then `parsing_failed` means what the UI already assumes: nothing more is coming.

This belongs in 7B because the registry refactor rewrites those step bodies and their error handling anyway.

### 2. Import grouping in `app/(app)/trips/[tripId]/actions.ts`

The import block is not grouped per CLAUDE.md (external → `@/` → relative). Pre-existing; Phase 7A extended it rather than causing it. 7B touches this file anyway.

---

## Smaller items, unscheduled

- **Orphaned R2 object on mid-upload delete.** `deleteBookingAction` has no status guard and the Remove button renders for every status. Remove a booking still in `uploading` and the presigned PUT (10-minute TTL) can land *after* `deleteObject`, recreating the object with no row pointing at it. `deleteTripAction` iterates bookings, so nothing reaps it. Low volume against R2's 10 GB, but unbounded. Offering Remove on stuck `uploading` rows is genuinely useful, so prefer documenting over removing the escape hatch.
- **Stranded `uploading` rows poll forever.** If the browser dies between `requestBookingUploadAction` and `confirmBookingUploadedAction`, the row sits in `uploading` permanently, and every open tab issues a `router.refresh()` every 3s indefinitely — roughly 1,200 renders per hour per tab against Vercel Hobby's 1M invocations. Consider a poll cap or a `createdAt`-based staleness cutoff.
- **`getTripAction` is dead code.** Zero callers. It is an exported server action, so Next.js still ships an action ID and a live POST endpoint for it. Harmless — it does verify ownership — but unnecessary.
- **Demo page copy coupling.** `ItineraryTimeline`'s `all-failed` copy says "Check the uploaded documents below", but `app/demo/page.tsx` renders no `BookingsPanel`. Unreachable today since the demo trip is seeded and fully parsed. Same class of issue for `no-bookings` rendering `AddBookingDialog` on a public page.
- **`deleteBookingAction` succeeds silently** while retry toasts. The row vanishing is arguably feedback enough, but the asymmetry within one component is noticeable.
- **No exhaustiveness guard in `booking-status.ts`.** A new `bookingStatusEnum` member would land in `total` but no sub-bucket. The status enum is not slated to change — Phase 7's later stages touch `bookingTypeEnum` and `segmentTypeEnum`. Degraded, not broken, if it ever does.

---

## Recommendation: a DB test harness before Phase 7C

The Phase 7A split between tested and untested code was drawn honestly — the counting rule was the actual bug and it is the thing that got extracted and tested. But the ownership checks in the server actions are the highest-consequence logic in the app and are currently verified only by reading them.

A single Neon branch or pglite instance plus a helper that seeds two users and asserts user B gets `Forbidden` on every action would be roughly 60 lines and would cover the class of bug that actually hurts. That is worth more than component testing (jsdom + testing-library, three new dev dependencies), which buys the least per unit of setup — `BookingActions` is 71 lines of glue and `ParsingBanner`'s only real logic already lives in a tested pure function.

Phase 7B needs no new infrastructure: the spec's "every `BookingType` resolves to a handler" test and `to-ics.ts` both run fine under the current `environment: 'node'` setup.

## Recommendation: document the booking status machine

There are now four writers to `bookings.status` — `confirmBookingUploadedAction`, `retryBookingParseAction`, `parse-booking.ts` (five places), and implicitly deletion — plus two readers deriving UI from it. It composes correctly today, but verifying that takes reading four files, and the next person adding a status will not. A transition diagram in `docs/ARCHITECTURE.md` would pay for itself.
