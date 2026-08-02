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
