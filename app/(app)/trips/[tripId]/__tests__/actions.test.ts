import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { bookings, segments } from '@/lib/db/schema';
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
  getTripAction,
  requestBookingUploadAction,
  confirmBookingUploadedAction,
  deleteBookingAction,
  retryBookingParseAction,
} from '@/app/(app)/trips/[tripId]/actions';
import { deleteObject } from '@/lib/r2';
import { inngest } from '@/lib/inngest/client';

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
