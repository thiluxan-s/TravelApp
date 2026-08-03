import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { getTableName, is } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import * as schema from '@/lib/db/schema';
import type {
  Booking,
  NewBooking,
  NewSegment,
  Segment,
  Trip,
  User,
} from '@/lib/db/schema';

// Derived rather than hardcoded so a table added to schema.ts in a future
// migration is truncated automatically instead of silently leaking rows
// between tests. Drizzle's internal migrations-tracking table is not declared
// in schema.ts, so it is not a PgTable export here and is correctly excluded.
const TABLE_NAMES = (Object.values(schema) as unknown[])
  .filter((value): value is PgTable => is(value, PgTable))
  .map((table) => getTableName(table));

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
 * Empties every table. The table list is derived from schema.ts (see
 * TABLE_NAMES above), so a new table is covered automatically without this
 * comment or call site going stale. CASCADE handles the foreign keys; RESTART
 * IDENTITY is a no-op against uuid primary keys but keeps this correct if a
 * serial is added.
 */
export async function resetTables(db: TestDb): Promise<void> {
  await db.execute(`TRUNCATE ${TABLE_NAMES.join(', ')} RESTART IDENTITY CASCADE`);
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
      // Mirrors production's `${user.id}/${tripId}/${booking.id}/${fileName}`
      // shape (requestBookingUploadAction in
      // app/(app)/trips/[tripId]/actions.ts) so this doesn't mislead the next
      // reader into thinking fileKey is a flat "uploads/..." path. The real
      // booking id isn't known until after this insert, so it's a placeholder
      // segment here rather than the row's actual id.
      fileKey: `seed-user-id/${tripId}/seed-booking-id/confirmation.pdf`,
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
