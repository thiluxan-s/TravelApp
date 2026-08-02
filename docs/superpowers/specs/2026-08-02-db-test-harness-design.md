# Database Test Harness: Design Spec

**Date:** 2026-08-02
**Status:** Approved
**Backlog item:** `docs/BACKLOG.md` → Engineering health → "No DB test harness"

---

## Goal

Make the ownership checks in the server actions provable instead of merely readable.

They are the highest-consequence logic in the app — the only thing standing between one user's trips and another's — and today they are verified by reading them. Every phase from 1 through 7E shipped that way. Nothing else in the backlog covers a class of bug that is both this likely and this damaging.

This is deliberately not "add testing to the project." It is one harness and the first batch of tests that harness makes possible.

---

## Decisions

### pglite, not a Neon branch

Tests run against `@electric-sql/pglite` — real Postgres compiled to WASM, in-process.

**This adds one devDependency**, which the project's conventions require asking about. It was agreed on the following trade:

- `npm test` stays hermetic: no credentials, no network, no Docker. A fresh clone can run the suite, which matters for a portfolio repo someone else opens.
- Drizzle 0.45.2 already ships `drizzle-orm/pglite` and `drizzle-orm/pglite/migrator`, declaring `@electric-sql/pglite >=0.2.0` as an **optional** peer. Current pglite is 0.5.4, so it satisfies the range and adds nothing to the production bundle.

Rejected: **a Neon branch.** It runs the exact `neon-http` driver production uses, so no driver divergence could hide — but it makes the suite require credentials and a network round trip per query, and a fresh clone cannot run it at all. Rejected: **Docker via testcontainers** — closest to production, but several devDependencies and container startup for a codebase this size.

**The honest limitation:** production runs `neon-http`; tests run pglite. Drizzle builds the same SQL for both, so the divergence is thin, but anything Neon-specific — connection pooling, HTTP-mode transaction behaviour — stays untested. These tests prove the authorization logic and the data model. They do not prove the driver.

### Mock the module, don't refactor the code

Every repository imports `{ db } from '@/lib/db'`, the actions import the repositories, and `requestBookingUploadAction` additionally uses `db` directly. So a single `vi.mock('@/lib/db')` returning a pglite-backed Drizzle instance redirects the entire data layer.

**No shipped code changes for testability.** Dependency injection through `lib/db/index.ts` was rejected: it would rewrite the data access path of every file in the app to serve the tests, against a project convention of minimal targeted changes.

### Exactly four mocked modules

| Mocked | Reason |
|---|---|
| `@/lib/db` | swaps `neon-http` for pglite |
| `@clerk/nextjs/server` | `auth()` must be controllable to switch between users |
| `@/lib/r2` | no S3 calls from a unit test |
| `@/lib/inngest/client` | `send` becomes a spy |

Everything else is real: real Drizzle query building, real Postgres constraints, real foreign keys, real cascades. The mocks are the process boundary, not a convenience.

### Migrations, not schema push

The harness applies the committed `drizzle/*.sql` files through `drizzle-orm/pglite/migrator`, rather than pushing from `schema.ts`.

The suite therefore exercises the same migrations production runs, and a broken migration fails the tests. Pushing from the schema would paper over precisely that failure — the schema would be right while the migration that produces it was wrong.

### Isolation by truncation

One in-memory pglite instance per test file, migrated once in `beforeAll`. `TRUNCATE ... RESTART IDENTITY CASCADE` across all four tables in `beforeEach`.

Rejected: a fresh instance per test — correct but pays migration cost on every case. Rejected: transaction rollback per test — the cleanest isolation in principle, but the code under test manages its own statements and nesting them inside an outer transaction changes the behaviour being tested.

---

## Architecture

```
vitest.setup.ts                              stubs process.env before env.server parses
lib/db/__tests__/harness.ts                  createTestDb, resetTables, seedTwoUsers
app/(app)/trips/__tests__/actions.test.ts            trip-level actions
app/(app)/trips/[tripId]/__tests__/actions.test.ts   booking-level actions
```

`vitest.config.ts` gains one line: `setupFiles: ['./vitest.setup.ts']`. `environment: 'node'` is unchanged — this harness needs no jsdom and adds no browser-side testing.

### The setup file is insurance, not a requirement

`lib/env.server.ts` ends with `export const env = envSchema.parse(process.env)`, which runs at import and throws when the variables are absent — and `process.env` is empty under Vitest, which loads no `.env` files.

**A spike proved the action tests do not actually need the setup file.** Seven modules import `env.server`, but the only two reachable from the server actions are `lib/db/index.ts` and `lib/r2/index.ts`, and both are mocked — so `env.server` is never evaluated and the action modules import cleanly with `process.env` untouched.

It is included anyway, with its cost stated plainly: three lines and one config entry. The remaining five importers include `lib/ai/client.ts` and `lib/mapbox/client.ts`, which the Inngest parse job and the route handlers reach — both named in "Out of scope" as the likely next things to test. Whoever writes those tests without this file gets an eleven-field `ZodError` at import time that names none of the actual cause. This is a named, specific trigger rather than speculative generality.

The file sets every variable in the schema to a syntactically valid dummy — `DATABASE_URL` a well-formed URL, `DEMO_TRIP_ID` a well-formed UUID — and never a real credential.

### The harness API

```ts
createTestDb(): Promise<TestDb>          // pglite + drizzle + migrations applied
resetTables(db: TestDb): Promise<void>   // TRUNCATE all four, CASCADE
seedTwoUsers(db: TestDb): Promise<{
  alice: { user: User; trip: Trip };
  bob:   { user: User; trip: Trip };
}>
```

Two users each owning one trip is the shape every ownership test needs: act as Bob, reach for Alice's resource, expect `Forbidden`. Seeding bookings and segments stays in the individual tests, because their required states differ per case.

---

## Coverage

### Ownership

Every action that accepts a resource id must reject a non-owner:

- `getTripAction`, `deleteTripAction`, `requestBookingUploadAction`, `confirmBookingUploadedAction`, `deleteBookingAction`, `retryBookingParseAction` → `Forbidden` when Bob passes Alice's id
- `listTripsAction` returns only the caller's trips
- `createTripAction` attributes the new trip to the caller
- Every action returns `Unauthorized` when `auth()` yields no user

A `Forbidden` result is necessary but not sufficient: where an action mutates, the test also asserts **the target row is unchanged**. An action that returned `Forbidden` after already deleting the row would pass a return-value-only assertion.

### Data integrity

The behaviours that would corrupt data silently rather than visibly:

- Deleting a trip cascades to its bookings and their segments
- Deleting a booking removes its segments and leaves sibling bookings intact
- `retryBookingParseAction` deletes existing segments before flipping status — the guard that makes retry actually re-run instead of silently no-opping, added in Phase 7A
- `retryBookingParseAction` refuses a booking whose status is not `parsing_failed`
- `updateBookingStatus(id, 'parsing')` clears `parseError`
- `deleteBookingAction` still deletes the row when the R2 delete rejects — the `Promise.allSettled` contract, and the most likely of these to regress unnoticed

---

## Error handling and honesty about what fails

Every action wraps its body in `try/catch` returning `{ ok: false, error: 'Something went wrong' }`. That means a test asserting only `ok === false` passes when the action *crashed* just as readily as when it correctly refused.

**Every negative assertion checks the specific error string**, not just the falsy `ok`. A test that cannot distinguish "correctly denied" from "threw on line 3" is not testing authorization.

---

## Out of scope

- **Component tests** (jsdom + testing-library). Three more devDependencies for the least value per unit of setup; the project has repeatedly deferred this and this spec does not reopen it.
- **Route handler tests.** They need a request/response harness, and the two `.ics` routes are thin wrappers over already-tested pure functions.
- **The Inngest parse job.** It crosses step boundaries and calls Anthropic, Mapbox, and R2; it needs a different kind of harness than this one.
- **Repository unit tests.** Repositories are thin Drizzle wrappers; testing them directly mostly asserts that Drizzle works. They are covered transitively through the actions.
- **Fixing the non-UUID `tripId` → 500 bug** recorded in `BACKLOG.md`. It is pre-existing and lives in `page.tsx` too; per project convention incidental bugfixes get their own branch off `main`. This harness makes it easy to write the regression test when that branch happens.
