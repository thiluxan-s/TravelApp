# Backlog

Known work that is deliberately not scheduled yet. Add to this rather than letting things live only in a PR comment or a chat log.

Phase work itself lives in `docs/phases/` and `docs/superpowers/`. This file is for the things that fall between phases.

---

## Blocking-ish

### `/demo` is a build-time snapshot of the database — deploys publish seed changes

`app/demo/page.tsx` declares no `dynamic` or `revalidate`, and `getTripWithBookings` is a direct Drizzle query rather than a `fetch`, so Next renders the page **statically at build time**. Deliberate — it keeps the page fast and costs no function invocations, and the demo trip only changes when someone re-seeds on purpose.

The consequence to remember: **re-seeding changes nothing publicly until the next deploy.** Verified on 2026-07-30 — the database had seven segments while the live page still served the three-segment HTML from the previous build.

That makes deploy order matter whenever a seed change and a code change depend on each other. Merging a *different* branch first would rebuild `/demo` with new data against old code; segment types the deployed code doesn't know fall through to the wrong card and render as "Parsed" placeholders on the public link.

If this ever becomes annoying rather than merely surprising, `export const revalidate = 3600` is the cheap middle ground.

### Runtime verification of Phases 7A, 7B, and 7C has not happened

All three phases shipped verified by typecheck, lint, and unit tests on their pure logic, but none got a browser or end-to-end pass. All need Clerk credentials, a live Neon database, and the Inngest dev server, so they were deliberately left to a human rather than faked. One session covers all three.

Setup: `npm run dev` plus `npx inngest-cli@latest dev` (dashboard at `localhost:8288`).

**Phase 7C — the two new booking types.** The handlers are unit tested but the prompts have never seen a real document, and prompt tuning is expected work here rather than a defect:

- A real **train** confirmation classifies as `train`, extracts, geocodes both stations, and lands on the timeline with two map markers and a line between them
- A real **restaurant** confirmation classifies as `reservation` — watch for the model answering `restaurant` instead, which falls through to `unknown`
- The reservation card shows a start time with **no fabricated end** when the document states none
- On the demo trip after re-seeding: the dinner on the hotel check-in day shows a **gap** pill reading about `2h`, not a red "These bookings overlap in time" conflict. That pairing is the Critical bug 7C fixed; if a red pill appears, the fix regressed.

**Phase 7B — behavior preservation.** This is the one that matters most, because 7B's entire claim is that it changed nothing. Its unit tests cover the handlers, not the job that drives them, so this is the only proof:

- A real **flight** PDF still classifies, extracts, geocodes, and lands on the timeline
- A real **hotel** PDF does too — and check the Inngest dashboard shows **one** geocode call for it, not two. The hotel single-geocode behavior survived being made generic, but only a runtime check confirms it, and a regression there silently doubles Mapbox usage against a metered free tier.

**Phase 7A — failure surface and recovery:**

- Upload a non-booking PDF → red banner appears, bookings panel shows the error
- "Try again" → status returns to `parsing`, the Inngest job re-runs
- "Remove" → the row disappears and stays gone after a refresh
- A **successful** upload still lands on the timeline — retry touches segment deletion, so the happy path needs a regression check

Note while doing this: a transient failure will currently surface as a permanent one (see the next item), so if something reads "couldn't be read" mid-run, check the Inngest dashboard before concluding it actually failed.

### `parsing_failed` is written before Inngest has finished retrying

`lib/inngest/functions/parse-booking.ts` writes `status: 'parsing_failed'` in its outer catch and **then rethrows** — and the rethrow is what schedules the retry. So on a transient error (Anthropic 429, Mapbox timeout) the row reads "failed" while attempts are still queued.

Phase 7A's UI makes this user-visible and it now has a plausible bad path: the red banner asserts a permanent failure, polling stops because `parsing_failed` isn't in-flight, and a later successful retry never reaches the user without a manual reload.

Not a regression Phase 7A introduced — but Phase 7A is what surfaced it. Fix by moving terminal bookkeeping into Inngest's `onFailure` handler and wrapping non-retriable errors in `NonRetriableError`.

Full write-up, plus the smaller deferred items from the same review: `docs/superpowers/plans/2026-07-29-phase-7a-follow-ups.md`. Slot into Phase 7B, which rewrites those step bodies anyway.

### `.ics` re-import may duplicate rather than update in strict clients

Events carry stable UIDs derived from segment ids, but no `SEQUENCE` property, which RFC 5545 defaults to 0. A second import after a segment changed therefore never presents itself as a newer revision, so whether it updates or duplicates is client-specific leniency. Lenient importers such as Google Calendar generally update on a UID match; stricter ones may duplicate or prompt. A correct fix needs a real revision counter, which is out of scope for Phase 7E.

### A non-UUID `tripId` returns 500 rather than 404

`getTripWithBookings` passes the path segment straight into a `uuid` column comparison, so Postgres raises `invalid input syntax for type uuid` and the handler has no catch. This affects `app/(app)/trips/[tripId]/calendar.ics/route.ts` and, identically, the pre-existing `app/(app)/trips/[tripId]/page.tsx`.

Pre-existing, not introduced by Phase 7E. Per this project's convention, incidental bugfixes are pulled into their own branch off `main` rather than folded into a feature phase — so it is recorded here rather than fixed on this branch.

---

## Portfolio-facing

### README screenshots

The README has a Screenshots section holding only an HTML comment. `docs/PRD.md` makes "The README sells it" a success criterion and names screenshots as part of it — this is the last piece of that criterion still outstanding, and the only visual hook a recruiter gets in the first ninety seconds.

Three shots, to be dropped in `docs/images/` and the placeholder comment replaced with image tags:

1. `itinerary.png` — trip detail page, timeline and map side by side, with an annotation pill visible between two events. The money shot.
2. `parsing.png` — mid-upload: the amber parsing banner with a booking in flight.
3. `failure.png` — a failed parse: red banner plus the bookings panel showing the error and the Try again / Remove controls.

The seeded demo trip at `/demo` covers shot 1. Shots 2 and 3 need a real upload against a local dev server — 3 is easiest to stage by uploading any non-booking PDF, which the classifier rejects.

**Take these before Phase 7C.** 7B is a pure refactor with no visual change, but 7C adds train and reservation cards — screenshot after it and the itinerary looks richer, rather than needing a reshoot.

*(The rest of the README was rewritten 2026-07-29 and the demo link now points at the deployed app, so only the screenshots remain.)*

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
