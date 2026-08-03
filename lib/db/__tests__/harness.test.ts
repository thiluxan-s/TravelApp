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
    expect(await db.select().from(trips)).toHaveLength(2);
    expect(await db.select().from(bookings)).toHaveLength(1);
    expect(await db.select().from(segments)).toHaveLength(1);

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

    expect(await db.select().from(bookings)).toHaveLength(1);
    expect(await db.select().from(segments)).toHaveLength(1);

    await db.delete(trips).where(eq(trips.id, alice.trip.id));

    expect(await db.select().from(bookings)).toHaveLength(0);
    expect(await db.select().from(segments)).toHaveLength(0);
  });
});
