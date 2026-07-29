# Backlog

Known work that is deliberately not scheduled yet. Add to this rather than letting things live only in a PR comment or a chat log.

Phase work itself lives in `docs/phases/` and `docs/superpowers/`. This file is for the things that fall between phases.

---

## Blocking-ish

### Runtime verification of Phase 7A has not happened

Phase 7A (failure surface + recovery) shipped verified by typecheck, lint, and unit tests on its pure logic — but the browser pass was never run. It needs Clerk credentials, a live Neon database, and a genuinely failed parse, so it was deliberately left to a human rather than faked.

Still to confirm:

- Upload a non-booking PDF → red banner appears, bookings panel shows the error
- "Try again" → status returns to `parsing`, the Inngest job re-runs
- "Remove" → the row disappears and stays gone after a refresh
- A **successful** upload still lands on the timeline — retry touches segment deletion, so the happy path needs a regression check

### `parsing_failed` is written before Inngest has finished retrying

`lib/inngest/functions/parse-booking.ts` writes `status: 'parsing_failed'` in its outer catch and **then rethrows** — and the rethrow is what schedules the retry. So on a transient error (Anthropic 429, Mapbox timeout) the row reads "failed" while attempts are still queued.

Phase 7A's UI makes this user-visible and it now has a plausible bad path: the red banner asserts a permanent failure, polling stops because `parsing_failed` isn't in-flight, and a later successful retry never reaches the user without a manual reload.

Not a regression Phase 7A introduced — but Phase 7A is what surfaced it. Fix by moving terminal bookkeeping into Inngest's `onFailure` handler and wrapping non-retriable errors in `NonRetriableError`.

Full write-up, plus the smaller deferred items from the same review: `docs/superpowers/plans/2026-07-29-phase-7a-follow-ups.md`. Slot into Phase 7B, which rewrites those step bodies anyway.

---

## Portfolio-facing

### The README is stale

`README.md` still lists Phases 2–5 under "Roadmap / Phases remaining" — all six shipped — and the live demo link is the placeholder `https://wayfare-xxx.vercel.app`.

`docs/PRD.md` names the README as the most-read artifact in the project and makes "The README sells it" a success criterion: architecture diagram, screenshots, design decisions, a "what I'd build next" roadmap, and a working demo link. None of that is true today.

Cheapest high-impact fix on this list. It is documentation rather than a feature, which is why it keeps getting deferred — but it is now three phases out of date.

### Demo video

`docs/phases/phase-6-polish.md` deliverable 7 — a 60–90 second screen recording of sign-in → upload → itinerary, embedded in the README. Never made.

---

## Engineering health

### No DB test harness

`vitest.config.ts` is `environment: 'node'` with no jsdom, no testing-library, and no database harness, so only pure functions are unit tested today.

The ownership checks in the server actions are the highest-consequence logic in the app and are currently verified only by reading them. A Neon branch or pglite instance plus a helper that seeds two users and asserts user B gets `Forbidden` on every action would be roughly 60 lines and would cover the class of bug that actually hurts.

Worth more than component testing (jsdom + testing-library, three new dev dependencies), which buys the least per unit of setup. Wanted before Phase 7C; Phase 7B needs no new infrastructure.

### The booking status machine is undocumented

Four writers to `bookings.status` — `confirmBookingUploadedAction`, `retryBookingParseAction`, `parse-booking.ts` (five places), and implicitly deletion — plus two readers deriving UI from it. It composes correctly, but verifying that takes reading four files, and the next person adding a status will not. A transition diagram in `docs/ARCHITECTURE.md` would pay for itself.

### Dead code: `getTripAction`

`app/(app)/trips/[tripId]/actions.ts` — zero callers. It is an exported server action, so Next.js still ships an action ID and a live POST endpoint for it. Harmless (it does verify ownership), but unnecessary.
