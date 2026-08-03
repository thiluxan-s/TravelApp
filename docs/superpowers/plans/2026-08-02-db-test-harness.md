# Database Test Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the ownership checks in the server actions provable, by running the real actions against a real Postgres inside the test process.

**Architecture:** An in-process pglite database with the committed migrations applied. `vi.mock('@/lib/db')` swaps the production `neon-http` client for it, so no shipped code changes for testability. Clerk, R2, and the Inngest client are mocked at the module boundary; everything else runs for real.

**Tech Stack:** TypeScript strict, Vitest, Drizzle ORM, `@electric-sql/pglite`, Postgres.

**Spec:** `docs/superpowers/specs/2026-08-02-db-test-harness-design.md`

## Global Constraints

- `strict: true`. **No `any`** — use `unknown` and narrow. (`as unknown as TestDb` inside `vi.hoisted` is the one sanctioned exception; it is the documented Vitest idiom for a value initialized in `beforeAll`.)
- Absolute imports via `@/`, including for the modules under test.
- Prefer `type` over `interface`.
- **One new devDependency only: `@electric-sql/pglite`.** Nothing else. No jsdom, no testing-library, no mocking library beyond Vitest's built-in `vi`.
- **No changes to any file under `lib/` or `app/` other than adding test files.** If a test seems to require production code to change, stop and report — that is a finding, not a licence.
- Conventional commits. `npm run typecheck` and `npm run lint` clean before every commit.
- Every negative assertion checks the **specific error string**, never just `ok === false`. Each action wraps its body in `try/catch` returning `'Something went wrong'`, so `ok === false` alone passes when the action crashed just as readily as when it correctly refused.
- Where an action mutates, a `Forbidden` test must **also assert the target row is unchanged**. An action that returned `Forbidden` after already deleting the row would pass a return-value-only assertion.

## Verified before writing this plan

Each of these was proven by a throwaway spike against this repo, not assumed:

- `drizzle(new PGlite(), { schema })` plus `migrate(db, { migrationsFolder: './drizzle' })` applies all four committed migrations to an in-memory pglite.
- `vi.hoisted` + a **getter** in the `vi.mock('@/lib/db')` factory correctly serves a database created later in `beforeAll`. A plain value does not — the factory is evaluated before `beforeAll` runs.
- **Static** `import { deleteTripAction } from '@/app/(app)/trips/actions'` receives the mocked dependencies. Dynamic `await import()` is not required.
- The `@/` alias resolves paths containing parentheses, so `@/app/(app)/trips/actions` works.
- `process.env` is empty under Vitest, and the action modules still import cleanly, because the only `env.server` importers they reach are `@/lib/db` and `@/lib/r2` — both mocked.
- `TRUNCATE users, trips, bookings, segments RESTART IDENTITY CASCADE` via `db.execute(...)` isolates tests.
- A full ownership round trip works: non-owner gets `Forbidden`, signed-out gets `Unauthorized`, owner succeeds, and the delete cascades.
- Cost: roughly **3.5 seconds per test file**, nearly all of it migrations in `beforeAll`. This is why the harness is created once per file rather than per test.

## File Structure

**Create:**
- `vitest.setup.ts` — dummy `process.env` values
- `lib/db/__tests__/harness.ts` — `createTestDb`, `resetTables`, `seedTwoUsers`, `seedBooking`, `seedSegment`
- `lib/db/__tests__/harness.test.ts` — proves the harness itself works
- `app/(app)/trips/__tests__/actions.test.ts` — trip-level actions
- `app/(app)/trips/[tripId]/__tests__/actions.test.ts` — booking-level actions

**Modify:**
- `package.json` — add the devDependency
- `vitest.config.ts` — add `setupFiles`

**On the repeated mock block.** Tasks 2–4 each open with the same ~20 lines of `vi.hoisted` + four `vi.mock` calls. This is **not** extractable: `vi.mock` is hoisted per-module by Vitest's transform and only affects the file it appears in. A reviewer should read it as a structural requirement of the tool, not copy-paste laziness. Everything that *can* be shared — database creation, reset, seeding — lives in `harness.ts`.

---

### Task 1: The harness

**Files:**
- Modify: `package.json`, `vitest.config.ts`
- Create: `vitest.setup.ts`, `lib/db/__tests__/harness.ts`
- Test: `lib/db/__tests__/harness.test.ts`

**Interfaces produced (later tasks depend on these exact names):**
- `type TestDb`
- `createTestDb(): Promise<TestDb>`
- `resetTables(db: TestDb): Promise<void>`
- `seedTwoUsers(db: TestDb): Promise<{ alice: SeededUser; bob: SeededUser }>` where `type SeededUser = { user: User; trip: Trip }`
- `seedBooking(db: TestDb, tripId: string, overrides?: Partial<NewBooking>): Promise<Booking>`
- `seedSegment(db: TestDb, bookingId: string, tripId: string, overrides?: Partial<NewSegment>): Promise<Segment>`
- `CLERK_ALICE`, `CLERK_BOB` — the Clerk ids the seeded users carry

- [ ] **Step 1: Install the dependency**

```bash
npm install -D @electric-sql/pglite
```

Confirm it landed in `devDependencies`, not `dependencies`:

```bash
node -p "require('./package.json').devDependencies['@electric-sql/pglite']"
```

Expected: a version string beginning `^0.5`. Drizzle 0.45.2 declares `@electric-sql/pglite >=0.2.0` as an *optional* peer, so this satisfies it and adds nothing to the production bundle.

- [ ] **Step 2: Add the environment setup file**

Create `vitest.setup.ts`:

```typescript
// lib/env.server.ts runs `envSchema.parse(process.env)` at import and throws
// when anything is missing. Vitest loads no .env files, so a test that reaches
// any env.server importer dies at import time with an eleven-field ZodError
// naming none of the actual cause.
//
// The action tests do not strictly need this — they mock the only two importers
// they can reach. It is here for the next batch: lib/ai/client.ts and
// lib/mapbox/client.ts are reachable from the Inngest job and the route
// handlers, and both parse env the same way.
//
// `??=` so a real environment is never clobbered. These are syntactically valid
// dummies, never credentials.
process.env.DATABASE_URL ??= 'postgres://user:pass@localhost:5432/wayfare_test';
process.env.CLERK_SECRET_KEY ??= 'sk_test_dummy';
process.env.CLERK_WEBHOOK_SECRET ??= 'whsec_dummy';
process.env.R2_ACCOUNT_ID ??= 'dummy-account';
process.env.R2_ACCESS_KEY_ID ??= 'dummy-key-id';
process.env.R2_SECRET_ACCESS_KEY ??= 'dummy-secret';
process.env.R2_BUCKET_NAME ??= 'dummy-bucket';
process.env.R2_PUBLIC_URL ??= 'https://r2.example.test';
process.env.ANTHROPIC_API_KEY ??= 'sk-ant-dummy';
process.env.MAPBOX_SECRET_TOKEN ??= 'dummy-mapbox-token';
process.env.INNGEST_EVENT_KEY ??= 'dummy-inngest-key';
process.env.DEMO_TRIP_ID ??= '00000000-0000-4000-8000-000000000000';
```

`INNGEST_SIGNING_KEY` is `.optional()` in the schema and is deliberately omitted.

- [ ] **Step 3: Register the setup file**

Replace `vitest.config.ts` with:

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
```

- [ ] **Step 4: Write the failing harness test**

Create `lib/db/__tests__/harness.test.ts`:

```typescript
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { users, trips, bookings, segments } from '@/lib/db/schema';
import {
  createTestDb,
  resetTables,
  seedTwoUsers,
  seedBooking,
  seedSegment,
  type TestDb,
} from './harness';

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});

beforeEach(async () => {
  await resetTables(db);
});

describe('the test harness', () => {
  it('applies the committed migrations so every table is queryable', async () => {
    // If a migration were broken this throws rather than returning [].
    expect(await db.select().from(users)).toEqual([]);
    expect(await db.select().from(trips)).toEqual([]);
    expect(await db.select().from(bookings)).toEqual([]);
    expect(await db.select().from(segments)).toEqual([]);
  });

  it('seeds two distinct users each owning one trip', async () => {
    const { alice, bob } = await seedTwoUsers(db);

    expect(alice.user.id).not.toBe(bob.user.id);
    expect(alice.trip.userId).toBe(alice.user.id);
    expect(bob.trip.userId).toBe(bob.user.id);
    expect(await db.select().from(trips)).toHaveLength(2);
  });

  it('empties every table when reset', async () => {
    // Self-contained on purpose: an assertion that relies on a previous test
    // having seeded would pass vacuously when this test is run on its own,
    // whether or not resetTables does anything.
    const { alice } = await seedTwoUsers(db);
    const booking = await seedBooking(db, alice.trip.id);
    await seedSegment(db, booking.id, alice.trip.id);

    expect(await db.select().from(users)).toHaveLength(2);

    await resetTables(db);

    expect(await db.select().from(users)).toHaveLength(0);
    expect(await db.select().from(trips)).toHaveLength(0);
    expect(await db.select().from(bookings)).toHaveLength(0);
    expect(await db.select().from(segments)).toHaveLength(0);
  });

  it('cascades a trip deletion through bookings to segments', async () => {
    const { alice } = await seedTwoUsers(db);
    const booking = await seedBooking(db, alice.trip.id);
    await seedSegment(db, booking.id, alice.trip.id);

    await db.delete(trips).where(eq(trips.id, alice.trip.id));

    expect(await db.select().from(bookings)).toHaveLength(0);
    expect(await db.select().from(segments)).toHaveLength(0);
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `npx vitest run lib/db/__tests__/harness.test.ts`
Expected: FAIL — `Cannot find module './harness'`.

- [ ] **Step 6: Implement the harness**

Create `lib/db/__tests__/harness.ts`:

```typescript
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '@/lib/db/schema';
import type {
  Booking,
  NewBooking,
  NewSegment,
  Segment,
  Trip,
  User,
} from '@/lib/db/schema';

export type TestDb = ReturnType<typeof drizzle<typeof schema>>;

/** The Clerk ids seedTwoUsers assigns. Tests set these on the mocked auth(). */
export const CLERK_ALICE = 'user_alice_clerk_id';
export const CLERK_BOB = 'user_bob_clerk_id';

/**
 * An in-process Postgres with the committed migrations applied.
 *
 * Migrations rather than a schema push on purpose: this runs the same SQL
 * production runs, so a broken migration fails the suite. Pushing from
 * schema.ts would paper over exactly that — the schema would come out right
 * while the migration meant to produce it was wrong.
 *
 * Costs roughly three seconds, nearly all of it migrations, so call this once
 * per file in beforeAll and use resetTables between tests.
 */
export async function createTestDb(): Promise<TestDb> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: './drizzle' });
  return db;
}

/**
 * Empties every table. CASCADE handles the foreign keys; RESTART IDENTITY is a
 * no-op against uuid primary keys but keeps this correct if a serial is added.
 */
export async function resetTables(db: TestDb): Promise<void> {
  await db.execute('TRUNCATE users, trips, bookings, segments RESTART IDENTITY CASCADE');
}

export type SeededUser = { user: User; trip: Trip };

/**
 * Two users, each owning one trip — the shape every ownership test needs:
 * act as Bob, reach for Alice's resource, expect Forbidden.
 *
 * Bookings and segments are left to individual tests, whose required states
 * differ too much to share.
 */
export async function seedTwoUsers(
  db: TestDb,
): Promise<{ alice: SeededUser; bob: SeededUser }> {
  const [alice] = await db
    .insert(schema.users)
    .values({ clerkUserId: CLERK_ALICE, email: 'alice@example.test' })
    .returning();
  const [bob] = await db
    .insert(schema.users)
    .values({ clerkUserId: CLERK_BOB, email: 'bob@example.test' })
    .returning();

  const [aliceTrip] = await db
    .insert(schema.trips)
    .values({ userId: alice.id, title: 'Alice — Tokyo' })
    .returning();
  const [bobTrip] = await db
    .insert(schema.trips)
    .values({ userId: bob.id, title: 'Bob — Lisbon' })
    .returning();

  return {
    alice: { user: alice, trip: aliceTrip },
    bob: { user: bob, trip: bobTrip },
  };
}

export async function seedBooking(
  db: TestDb,
  tripId: string,
  overrides: Partial<NewBooking> = {},
): Promise<Booking> {
  const [booking] = await db
    .insert(schema.bookings)
    .values({
      tripId,
      status: 'parsed',
      fileKey: `uploads/${tripId}/confirmation.pdf`,
      fileName: 'confirmation.pdf',
      fileSizeBytes: 1024,
      mimeType: 'application/pdf',
      ...overrides,
    })
    .returning();
  return booking;
}

export async function seedSegment(
  db: TestDb,
  bookingId: string,
  tripId: string,
  overrides: Partial<NewSegment> = {},
): Promise<Segment> {
  const [segment] = await db
    .insert(schema.segments)
    .values({
      bookingId,
      tripId,
      type: 'flight',
      startTime: new Date('2026-03-10T12:00:00Z'),
      startTimezone: 'UTC',
      endTime: new Date('2026-03-11T05:00:00Z'),
      endTimezone: 'UTC',
      startLocation: 'Toronto Pearson (YYZ)',
      endLocation: 'Tokyo Narita (NRT)',
      details: {},
      ...overrides,
    })
    .returning();
  return segment;
}
```

- [ ] **Step 7: Run it to verify it passes**

Run: `npx vitest run lib/db/__tests__/harness.test.ts`
Expected: PASS, 4 tests. The file takes roughly 4 seconds — that is the migration cost, not a hang.

- [ ] **Step 8: Confirm the whole suite still passes**

Run: `npx vitest run`
Expected: **134** (130 existing + 4). The setup file now runs before every test file, including the existing pure ones; confirm none of them broke.

- [ ] **Step 9: Typecheck, lint, and commit**

```bash
npm run typecheck && npm run lint
git add package.json package-lock.json vitest.config.ts vitest.setup.ts lib/db/__tests__/harness.ts lib/db/__tests__/harness.test.ts
git commit -m "test: add an in-process Postgres harness for database tests

The ownership checks in the server actions are the highest-consequence logic in
the app and have never been verified by anything but reading them.

pglite runs real Postgres in-process, so the suite stays hermetic — no
credentials, no network, a fresh clone can run it. Migrations are applied from
the committed drizzle/ files rather than pushed from schema.ts, so a broken
migration fails the tests instead of being papered over.

The harness costs about three seconds per file, nearly all of it migrations,
which is why it is created once in beforeAll and reset by truncation between
tests."
```

---

### Task 2: Trip-level action tests

**Files:**
- Test: `app/(app)/trips/__tests__/actions.test.ts`

**Interfaces:**
- Consumes: `createTestDb`, `resetTables`, `seedTwoUsers`, `seedBooking`, `seedSegment`, `CLERK_ALICE`, `CLERK_BOB`, `type TestDb` from `@/lib/db/__tests__/harness`
- Produces: nothing other tasks consume.

Covers `createTripAction`, `listTripsAction`, `deleteTripAction` from `app/(app)/trips/actions.ts`.

**These are characterization tests, not red-green TDD.** The code under test already exists and works, so they should pass on first run. There is deliberately no "verify it fails" step — a failure here means either the test is wrong or a real authorization defect exists, and both are findings to report rather than code to write.

- [ ] **Step 1: Write the tests**

Create `app/(app)/trips/__tests__/actions.test.ts`:

```typescript
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { trips, bookings, segments } from '@/lib/db/schema';
import {
  createTestDb,
  resetTables,
  seedTwoUsers,
  seedBooking,
  seedSegment,
  CLERK_ALICE,
  CLERK_BOB,
  type TestDb,
} from '@/lib/db/__tests__/harness';
import {
  createTripAction,
  listTripsAction,
  deleteTripAction,
} from '@/app/(app)/trips/actions';

// vi.mock is hoisted per-module by Vitest's transform, so this block cannot be
// shared across test files. A getter, not a value: the pglite database does not
// exist until beforeAll, and the mock factory is evaluated before that.
const h = vi.hoisted(() => ({
  db: undefined as unknown as TestDb,
  clerkUserId: null as string | null,
}));

vi.mock('@/lib/db', () => ({
  get db() {
    return h.db;
  },
}));
vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: h.clerkUserId }),
}));
vi.mock('@/lib/r2', () => ({
  getPresignedUploadUrl: vi.fn(async () => 'https://upload.example.test/signed'),
  deleteObject: vi.fn(async () => undefined),
}));
vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: vi.fn(async () => undefined) },
}));

beforeAll(async () => {
  h.db = await createTestDb();
});

beforeEach(async () => {
  await resetTables(h.db);
  h.clerkUserId = null;
  vi.clearAllMocks();
});

describe('createTripAction', () => {
  it('attributes the new trip to the calling user', async () => {
    const { alice } = await seedTwoUsers(h.db);
    h.clerkUserId = CLERK_ALICE;

    const result = await createTripAction({ title: 'Kyoto' });
    expect(result.ok).toBe(true);

    const created = await h.db.select().from(trips).where(eq(trips.title, 'Kyoto'));
    expect(created).toHaveLength(1);
    expect(created[0].userId).toBe(alice.user.id);
  });

  it('rejects a blank title without creating a row', async () => {
    await seedTwoUsers(h.db);
    h.clerkUserId = CLERK_ALICE;

    expect(await createTripAction({ title: '   ' })).toEqual({
      ok: false,
      error: 'Trip name is required',
    });
    expect(await h.db.select().from(trips)).toHaveLength(2);
  });

  it('refuses an unauthenticated caller', async () => {
    expect(await createTripAction({ title: 'Kyoto' })).toEqual({
      ok: false,
      error: 'Unauthorized',
    });
    expect(await h.db.select().from(trips)).toHaveLength(0);
  });
});

describe('listTripsAction', () => {
  it('returns only the calling user’s trips', async () => {
    const { alice } = await seedTwoUsers(h.db);
    h.clerkUserId = CLERK_ALICE;

    const result = await listTripsAction();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe(alice.trip.id);
  });

  it('refuses an unauthenticated caller', async () => {
    await seedTwoUsers(h.db);
    expect(await listTripsAction()).toEqual({ ok: false, error: 'Unauthorized' });
  });
});

describe('deleteTripAction', () => {
  it('deletes the caller’s own trip', async () => {
    const { alice } = await seedTwoUsers(h.db);
    h.clerkUserId = CLERK_ALICE;

    expect(await deleteTripAction(alice.trip.id)).toEqual({ ok: true });
    expect(await h.db.select().from(trips)).toHaveLength(1);
  });

  it('refuses another user’s trip and leaves it untouched', async () => {
    const { alice } = await seedTwoUsers(h.db);
    h.clerkUserId = CLERK_BOB;

    expect(await deleteTripAction(alice.trip.id)).toEqual({
      ok: false,
      error: 'Forbidden',
    });

    // Forbidden alone is not enough — the row must still be there.
    const remaining = await h.db.select().from(trips).where(eq(trips.id, alice.trip.id));
    expect(remaining).toHaveLength(1);
  });

  it('reports a missing trip distinctly from a forbidden one', async () => {
    await seedTwoUsers(h.db);
    h.clerkUserId = CLERK_ALICE;

    expect(await deleteTripAction('00000000-0000-4000-8000-00000000dead')).toEqual({
      ok: false,
      error: 'Trip not found',
    });
  });

  it('refuses an unauthenticated caller', async () => {
    const { alice } = await seedTwoUsers(h.db);

    expect(await deleteTripAction(alice.trip.id)).toEqual({
      ok: false,
      error: 'Unauthorized',
    });
    expect(await h.db.select().from(trips)).toHaveLength(2);
  });

  it('cascades to the trip’s bookings and segments', async () => {
    const { alice } = await seedTwoUsers(h.db);
    const booking = await seedBooking(h.db, alice.trip.id);
    await seedSegment(h.db, booking.id, alice.trip.id);
    h.clerkUserId = CLERK_ALICE;

    expect(await deleteTripAction(alice.trip.id)).toEqual({ ok: true });
    expect(await h.db.select().from(bookings)).toHaveLength(0);
    expect(await h.db.select().from(segments)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run them**

Run: `npx vitest run "app/(app)/trips/__tests__/actions.test.ts"`
Expected: PASS, 10 tests.

Note the quotes — the path contains parentheses, which an unquoted shell will try to interpret.

If the whole file fails at import with a `ZodError`, the setup file from Task 1 is not registered — fix that rather than working around it.

**If any individual test fails, do not change production code.** Work out whether the test or the action is wrong and report it. A genuine failure here is a real authorization defect, which is exactly what this task exists to surface.

- [ ] **Step 3: Typecheck, lint, and commit**

```bash
npm run typecheck && npm run lint && npx vitest run
git add "app/(app)/trips/__tests__/actions.test.ts"
git commit -m "test: cover trip-level action ownership and cascade

Asserts what reading the code could only suggest: a non-owner is refused, the
refusal leaves the row intact, and a missing trip is reported distinctly from a
forbidden one so the response cannot be used to probe which ids exist.

Every negative assertion checks the exact error string. The actions catch
everything and return 'Something went wrong', so asserting only ok === false
would pass just as happily when an action crashed."
```

---

### Task 3: Booking-level ownership tests

**Files:**
- Test: `app/(app)/trips/[tripId]/__tests__/actions.test.ts`

**Interfaces:**
- Consumes: the same harness exports as Task 2.
- Produces: this file; Task 4 appends to it.

Covers ownership for `getTripAction`, `requestBookingUploadAction`, `confirmBookingUploadedAction`, `deleteBookingAction`, `retryBookingParseAction`.

As in Task 2, these are characterization tests of existing working code and should pass on first run.

- [ ] **Step 1: Write the tests**

Create `app/(app)/trips/[tripId]/__tests__/actions.test.ts`:

```typescript
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { bookings } from '@/lib/db/schema';
import {
  createTestDb,
  resetTables,
  seedTwoUsers,
  seedBooking,
  CLERK_ALICE,
  CLERK_BOB,
  type TestDb,
} from '@/lib/db/__tests__/harness';
import {
  getTripAction,
  requestBookingUploadAction,
  confirmBookingUploadedAction,
  deleteBookingAction,
  retryBookingParseAction,
} from '@/app/(app)/trips/[tripId]/actions';

// See the note in app/(app)/trips/__tests__/actions.test.ts: vi.mock is hoisted
// per-module and cannot be shared across files.
const h = vi.hoisted(() => ({
  db: undefined as unknown as TestDb,
  clerkUserId: null as string | null,
}));

vi.mock('@/lib/db', () => ({
  get db() {
    return h.db;
  },
}));
vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: h.clerkUserId }),
}));
vi.mock('@/lib/r2', () => ({
  getPresignedUploadUrl: vi.fn(async () => 'https://upload.example.test/signed'),
  deleteObject: vi.fn(async () => undefined),
}));
vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: vi.fn(async () => undefined) },
}));

beforeAll(async () => {
  h.db = await createTestDb();
});

beforeEach(async () => {
  await resetTables(h.db);
  h.clerkUserId = null;
  vi.clearAllMocks();
});

const PDF = { fileName: 'c.pdf', fileSize: 1024, mimeType: 'application/pdf' };

describe('getTripAction', () => {
  it('returns the caller’s own trip', async () => {
    const { alice } = await seedTwoUsers(h.db);
    h.clerkUserId = CLERK_ALICE;

    const result = await getTripAction(alice.trip.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.id).toBe(alice.trip.id);
  });

  it('refuses another user’s trip', async () => {
    const { alice } = await seedTwoUsers(h.db);
    h.clerkUserId = CLERK_BOB;

    expect(await getTripAction(alice.trip.id)).toEqual({
      ok: false,
      error: 'Forbidden',
    });
  });
});

describe('requestBookingUploadAction', () => {
  it('refuses another user’s trip without creating a booking', async () => {
    const { alice } = await seedTwoUsers(h.db);
    h.clerkUserId = CLERK_BOB;

    expect(
      await requestBookingUploadAction({ tripId: alice.trip.id, ...PDF }),
    ).toEqual({ ok: false, error: 'Forbidden' });

    expect(await h.db.select().from(bookings)).toHaveLength(0);
  });

  it('rejects an unsupported mime type', async () => {
    const { alice } = await seedTwoUsers(h.db);
    h.clerkUserId = CLERK_ALICE;

    expect(
      await requestBookingUploadAction({
        tripId: alice.trip.id,
        fileName: 'notes.txt',
        fileSize: 10,
        mimeType: 'text/plain',
      }),
    ).toEqual({
      ok: false,
      error: 'Only PDF, JPEG, PNG, WEBP, and HEIC files are supported',
    });
    expect(await h.db.select().from(bookings)).toHaveLength(0);
  });

  it('rejects a file over 10 MB', async () => {
    const { alice } = await seedTwoUsers(h.db);
    h.clerkUserId = CLERK_ALICE;

    expect(
      await requestBookingUploadAction({
        tripId: alice.trip.id,
        fileName: 'huge.pdf',
        fileSize: 10 * 1024 * 1024 + 1,
        mimeType: 'application/pdf',
      }),
    ).toEqual({ ok: false, error: 'File must be 10 MB or smaller' });
    expect(await h.db.select().from(bookings)).toHaveLength(0);
  });
});

describe('confirmBookingUploadedAction', () => {
  it('refuses another user’s booking and leaves its status alone', async () => {
    const { alice } = await seedTwoUsers(h.db);
    const booking = await seedBooking(h.db, alice.trip.id, { status: 'uploading' });
    h.clerkUserId = CLERK_BOB;

    expect(await confirmBookingUploadedAction(booking.id)).toEqual({
      ok: false,
      error: 'Forbidden',
    });

    const [after] = await h.db.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(after.status).toBe('uploading');
  });
});

describe('deleteBookingAction', () => {
  it('refuses another user’s booking and leaves the row intact', async () => {
    const { alice } = await seedTwoUsers(h.db);
    const booking = await seedBooking(h.db, alice.trip.id);
    h.clerkUserId = CLERK_BOB;

    expect(await deleteBookingAction(booking.id)).toEqual({
      ok: false,
      error: 'Forbidden',
    });
    expect(await h.db.select().from(bookings)).toHaveLength(1);
  });
});

describe('retryBookingParseAction', () => {
  it('refuses another user’s booking and leaves its status alone', async () => {
    const { alice } = await seedTwoUsers(h.db);
    const booking = await seedBooking(h.db, alice.trip.id, {
      status: 'parsing_failed',
      parseError: 'could not read',
    });
    h.clerkUserId = CLERK_BOB;

    expect(await retryBookingParseAction(booking.id)).toEqual({
      ok: false,
      error: 'Forbidden',
    });

    const [after] = await h.db.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(after.status).toBe('parsing_failed');
    expect(after.parseError).toBe('could not read');
  });
});

describe('every booking-level action, unauthenticated', () => {
  it.each([
    ['getTripAction', (id: string) => getTripAction(id)],
    ['confirmBookingUploadedAction', (id: string) => confirmBookingUploadedAction(id)],
    ['deleteBookingAction', (id: string) => deleteBookingAction(id)],
    ['retryBookingParseAction', (id: string) => retryBookingParseAction(id)],
  ])('%s returns Unauthorized', async (_name, call) => {
    const { alice } = await seedTwoUsers(h.db);
    const booking = await seedBooking(h.db, alice.trip.id);
    h.clerkUserId = null;

    // getTripAction takes a trip id; the rest take a booking id. Both are
    // rejected before either is looked up, which is the point.
    expect(await call(booking.id)).toEqual({ ok: false, error: 'Unauthorized' });
  });

  it('requestBookingUploadAction returns Unauthorized', async () => {
    const { alice } = await seedTwoUsers(h.db);
    h.clerkUserId = null;

    expect(
      await requestBookingUploadAction({ tripId: alice.trip.id, ...PDF }),
    ).toEqual({ ok: false, error: 'Unauthorized' });
  });
});
```

- [ ] **Step 2: Run to verify**

Run: `npx vitest run "app/(app)/trips/[tripId]/__tests__/actions.test.ts"`
Expected: PASS, 13 tests. These exercise existing unmodified code, so there is no implementation step.

Note the quotes: the path contains both parentheses and square brackets, and an unquoted shell will glob them.

**If any test fails, do not change production code** — report it. A failure here is a real authorization defect.

- [ ] **Step 3: Typecheck, lint, and commit**

```bash
npm run typecheck && npm run lint && npx vitest run
git add "app/(app)/trips/[tripId]/__tests__/actions.test.ts"
git commit -m "test: cover booking-level action ownership

Each of the five actions is checked against a non-owner and against an
unauthenticated caller. Where an action mutates, the test also asserts the
target row is unchanged — a Forbidden returned after the write had already
happened would satisfy a return-value-only assertion.

requestBookingUploadAction additionally asserts no booking row is created on
refusal, since it creates the row before generating the upload URL."
```

---

### Task 4: Booking-level behaviour tests

**Files:**
- Modify: `app/(app)/trips/[tripId]/__tests__/actions.test.ts`

**Interfaces:**
- Consumes: the harness exports and the mock block Task 3 established in this file.

The behaviours that would corrupt data silently rather than visibly. Append these `describe` blocks to the end of the file Task 3 created; the mock block, `beforeAll`, and `beforeEach` are already in place and must not be duplicated.

- [ ] **Step 1: Extend the imports**

The file currently imports `bookings` from the schema and `seedBooking` from the harness. Add `segments` and `seedSegment`:

```typescript
import { bookings, segments } from '@/lib/db/schema';
```

```typescript
import {
  createTestDb,
  resetTables,
  seedTwoUsers,
  seedBooking,
  seedSegment,
  CLERK_ALICE,
  CLERK_BOB,
  type TestDb,
} from '@/lib/db/__tests__/harness';
```

Also import the R2 and Inngest mocks so their behaviour can be varied per test — add these beside the existing imports:

```typescript
import { deleteObject } from '@/lib/r2';
import { inngest } from '@/lib/inngest/client';
```

Both resolve to the mocked modules, so they are `vi.fn()` instances.

As in Tasks 2 and 3, these characterize existing behaviour and should pass on first run.

- [ ] **Step 2: Write the tests**

Append to `app/(app)/trips/[tripId]/__tests__/actions.test.ts`:

```typescript
describe('deleteBookingAction behaviour', () => {
  it('removes the booking and its segments, leaving siblings alone', async () => {
    const { alice } = await seedTwoUsers(h.db);
    const doomed = await seedBooking(h.db, alice.trip.id);
    const keeper = await seedBooking(h.db, alice.trip.id);
    await seedSegment(h.db, doomed.id, alice.trip.id);
    await seedSegment(h.db, keeper.id, alice.trip.id);
    h.clerkUserId = CLERK_ALICE;

    expect(await deleteBookingAction(doomed.id)).toEqual({ ok: true });

    const remainingBookings = await h.db.select().from(bookings);
    expect(remainingBookings).toHaveLength(1);
    expect(remainingBookings[0].id).toBe(keeper.id);

    const remainingSegments = await h.db.select().from(segments);
    expect(remainingSegments).toHaveLength(1);
    expect(remainingSegments[0].bookingId).toBe(keeper.id);
  });

  it('still deletes the row when the R2 object delete fails', async () => {
    // The action wraps deleteObject in Promise.allSettled precisely so a
    // missing or unreachable object cannot strand the database row.
    const { alice } = await seedTwoUsers(h.db);
    const booking = await seedBooking(h.db, alice.trip.id);
    h.clerkUserId = CLERK_ALICE;

    vi.mocked(deleteObject).mockRejectedValueOnce(new Error('R2 unreachable'));

    expect(await deleteBookingAction(booking.id)).toEqual({ ok: true });
    expect(await h.db.select().from(bookings)).toHaveLength(0);
  });
});

describe('retryBookingParseAction behaviour', () => {
  it('clears existing segments so the retry is not a silent no-op', async () => {
    // parse-booking's write step short-circuits when a segment already exists,
    // which guards Inngest's own retries. Without this deletion a manual retry
    // would re-run and write nothing.
    const { alice } = await seedTwoUsers(h.db);
    const booking = await seedBooking(h.db, alice.trip.id, {
      status: 'parsing_failed',
      parseError: 'could not read',
    });
    await seedSegment(h.db, booking.id, alice.trip.id);
    h.clerkUserId = CLERK_ALICE;

    expect(await retryBookingParseAction(booking.id)).toEqual({ ok: true });
    expect(await h.db.select().from(segments)).toHaveLength(0);
  });

  it('resets the status to parsing and clears the stored error', async () => {
    const { alice } = await seedTwoUsers(h.db);
    const booking = await seedBooking(h.db, alice.trip.id, {
      status: 'parsing_failed',
      parseError: 'could not read',
    });
    h.clerkUserId = CLERK_ALICE;

    expect(await retryBookingParseAction(booking.id)).toEqual({ ok: true });

    const [after] = await h.db.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(after.status).toBe('parsing');
    expect(after.parseError).toBeNull();
  });

  it('refuses a booking that has not failed', async () => {
    const { alice } = await seedTwoUsers(h.db);
    const booking = await seedBooking(h.db, alice.trip.id, { status: 'parsed' });
    h.clerkUserId = CLERK_ALICE;

    expect(await retryBookingParseAction(booking.id)).toEqual({
      ok: false,
      error: 'Only failed bookings can be retried',
    });

    const [after] = await h.db.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(after.status).toBe('parsed');
  });
});

describe('confirmBookingUploadedAction behaviour', () => {
  it('refuses a booking that is not awaiting upload confirmation', async () => {
    const { alice } = await seedTwoUsers(h.db);
    const booking = await seedBooking(h.db, alice.trip.id, { status: 'parsed' });
    h.clerkUserId = CLERK_ALICE;

    expect(await confirmBookingUploadedAction(booking.id)).toEqual({
      ok: false,
      error: 'Booking is not awaiting upload confirmation',
    });
  });

  it('marks the booking failed when the job cannot be queued', async () => {
    const { alice } = await seedTwoUsers(h.db);
    const booking = await seedBooking(h.db, alice.trip.id, { status: 'uploading' });
    h.clerkUserId = CLERK_ALICE;

    vi.mocked(inngest.send).mockRejectedValueOnce(new Error('Inngest down'));

    expect(await confirmBookingUploadedAction(booking.id)).toEqual({
      ok: false,
      error: 'Failed to queue document for parsing',
    });

    // A booking left in 'parsing' with no job queued would poll forever.
    const [after] = await h.db.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(after.status).toBe('parsing_failed');
  });
});
```

- [ ] **Step 3: Run to verify**

Run: `npx vitest run "app/(app)/trips/[tripId]/__tests__/actions.test.ts"`
Expected: PASS, 20 tests (13 from Task 3 + 7 here).

`vi.mocked(inngest.send)` requires `inngest.send` to be a `vi.fn()`, which the mock factory established in Task 3 provides. If TypeScript objects that `send` is not a mock, the factory in this file is wrong — fix the factory, not the assertion.

**If any test fails, do not change production code** — report it.

- [ ] **Step 4: Full suite, typecheck, lint, and commit**

```bash
npm run typecheck && npm run lint && npx vitest run
```

Expected suite total: **164** (130 before this plan + 4 harness + 10 trip-level + 20 booking-level). Reconcile any difference rather than adjusting the expectation.

```bash
git add "app/(app)/trips/[tripId]/__tests__/actions.test.ts"
git commit -m "test: cover the booking behaviours that fail silently

Each of these corrupts data without surfacing an error. Retry deleting segments
before re-queueing is what stops parse-booking's existing-segment guard from
turning a manual retry into a no-op. deleteBookingAction surviving an R2 failure
is the Promise.allSettled contract, which nothing else exercises. And a booking
left in 'parsing' after the queue call failed would poll forever.

The R2 and Inngest failure paths are driven with mockRejectedValueOnce, so the
error branches run rather than being reasoned about."
```

---

## Final verification

- [ ] `npm run typecheck` — clean
- [ ] `npm run lint` — clean
- [ ] `npx vitest run` — 164 passing (130 + 34); reconcile any difference rather than adjusting the expectation
- [ ] `npm run build` — clean. The new files are test-only, but `tsconfig.json` includes `**/*.ts`, so a type error in a test still breaks the build.
- [ ] `git diff main --stat` shows **no changes under `lib/` or `app/` other than new `__tests__` files.** The harness's entire premise is that production code needed no modification; a diff touching it means something went wrong.
- [ ] Suite runtime is roughly 12 seconds, up from under 2. Three test files each pay about 3.5 seconds of migration cost. If it is dramatically worse, check that `createTestDb` is in `beforeAll` and not `beforeEach`.
