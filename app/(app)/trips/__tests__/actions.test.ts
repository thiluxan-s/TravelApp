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
