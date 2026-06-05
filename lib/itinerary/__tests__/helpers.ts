import type { Segment } from '@/lib/db/schema';

export function makeSegment(overrides: Partial<Segment> = {}): Segment {
  return {
    id: 'seg-id',
    bookingId: 'booking-id',
    tripId: 'trip-id',
    type: 'flight',
    startTime: new Date('2026-03-10T09:00:00Z'),
    startTimezone: 'UTC',
    endTime: new Date('2026-03-10T11:00:00Z'),
    endTimezone: 'UTC',
    startLocation: 'Airport A',
    startLat: null,
    startLng: null,
    endLocation: 'Airport B',
    endLat: null,
    endLng: null,
    details: {},
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as Segment;
}
