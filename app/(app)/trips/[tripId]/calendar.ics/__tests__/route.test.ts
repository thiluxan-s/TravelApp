import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
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
import { GET } from '@/app/(app)/trips/[tripId]/calendar.ics/route';

// See the note in app/(app)/trips/[tripId]/__tests__/actions.test.ts: vi.mock is
// hoisted per-module and cannot be shared across files.
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
});

// Deliberately not a UUID that seedTwoUsers could ever produce.
const NONEXISTENT_TRIP_ID = '00000000-0000-4000-8000-00000000dead';

describe('GET /trips/[tripId]/calendar.ics', () => {
  it('returns 200 with the calendar body for the owner', async () => {
    const { alice } = await seedTwoUsers(h.db);
    const booking = await seedBooking(h.db, alice.trip.id);
    await seedSegment(h.db, booking.id, alice.trip.id);
    h.clerkUserId = CLERK_ALICE;

    const response = await GET(new Request('http://test/'), {
      params: Promise.resolve({ tripId: alice.trip.id }),
    });

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('BEGIN:VCALENDAR');
    expect(body).toContain('BEGIN:VEVENT');
    // seedSegment defaults to a flight with empty `details`, so the flight
    // mapper falls back to the segment's endLocation for its summary. Asserting
    // on segment-derived text is what proves the booking reached the response —
    // BEGIN:VCALENDAR alone is emitted even for a trip with no bookings.
    expect(body).toContain('Flight to Tokyo Narita (NRT)');
  });

  it('returns 404 without a calendar body when another signed-in user requests it', async () => {
    const { alice } = await seedTwoUsers(h.db);
    const booking = await seedBooking(h.db, alice.trip.id);
    await seedSegment(h.db, booking.id, alice.trip.id);
    h.clerkUserId = CLERK_BOB;

    const response = await GET(new Request('http://test/'), {
      params: Promise.resolve({ tripId: alice.trip.id }),
    });

    expect(response.status).toBe(404);
    // A future regression must not be able to return a calendar alongside an
    // error status.
    expect(await response.text()).not.toContain('BEGIN:VCALENDAR');
  });

  it('returns 404 for an unauthenticated caller', async () => {
    const { alice } = await seedTwoUsers(h.db);
    h.clerkUserId = null;

    const response = await GET(new Request('http://test/'), {
      params: Promise.resolve({ tripId: alice.trip.id }),
    });

    expect(response.status).toBe(404);
  });

  it('responds identically for a nonexistent trip id and a forbidden one', async () => {
    const { alice } = await seedTwoUsers(h.db);
    const booking = await seedBooking(h.db, alice.trip.id);
    await seedSegment(h.db, booking.id, alice.trip.id);
    h.clerkUserId = CLERK_BOB;

    const forbidden = await GET(new Request('http://test/'), {
      params: Promise.resolve({ tripId: alice.trip.id }),
    });
    const missing = await GET(new Request('http://test/'), {
      params: Promise.resolve({ tripId: NONEXISTENT_TRIP_ID }),
    });

    // The response must not reveal which trip ids exist: same status, same body.
    expect(missing.status).toBe(forbidden.status);
    expect(await missing.text()).toBe(await forbidden.text());
  });
});
