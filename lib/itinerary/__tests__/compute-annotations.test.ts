import { describe, it, expect } from 'vitest';
import { computeAnnotations } from '../compute-annotations';
import { makeSegment } from './helpers';

describe('computeAnnotations', () => {
  it('returns a gap annotation for a normal time gap', () => {
    // 8h 45m gap
    const prev = makeSegment({ endTime: new Date('2026-03-11T06:15:00Z') });
    const next = makeSegment({ startTime: new Date('2026-03-11T15:00:00Z') });
    const result = computeAnnotations(prev, next);
    expect(result.kind).toBe('gap');
    expect(result.gapMinutes).toBe(525);
    expect(result.message).toContain('8h');
    expect(result.message).toContain('45m');
  });

  it('includes distance in message when both segments have coordinates', () => {
    const prev = makeSegment({
      endTime: new Date('2026-03-11T06:15:00Z'),
      endLat: '35.765',
      endLng: '140.386',
    });
    const next = makeSegment({
      startTime: new Date('2026-03-11T15:00:00Z'),
      startLat: '35.689',
      startLng: '139.691',
    });
    const result = computeAnnotations(prev, next);
    expect(result.distanceKm).not.toBeNull();
    expect(result.message).toContain('km');
  });

  it('omits distance when coordinates are missing', () => {
    const prev = makeSegment({ endTime: new Date('2026-03-11T06:15:00Z') });
    const next = makeSegment({ startTime: new Date('2026-03-11T15:00:00Z') });
    const result = computeAnnotations(prev, next);
    expect(result.distanceKm).toBeNull();
    expect(result.message).not.toContain('km');
  });

  it('detects overlap conflict', () => {
    // next starts before prev ends
    const prev = makeSegment({ endTime: new Date('2026-03-11T10:00:00Z') });
    const next = makeSegment({ startTime: new Date('2026-03-11T09:00:00Z') });
    const result = computeAnnotations(prev, next);
    expect(result.kind).toBe('conflict');
    expect(result.message).toContain('overlap');
  });

  it('detects flight-lands-after-check-in-closes conflict', () => {
    // Flight lands at 23:15 JST (14:15 UTC), hotel check-in closes at 22:00
    const prev = makeSegment({
      type: 'flight',
      endTime: new Date('2026-03-11T14:15:00Z'),
      endTimezone: 'Asia/Tokyo',
    });
    const next = makeSegment({
      type: 'hotel_stay',
      startTime: new Date('2026-03-11T15:00:00Z'),
      startTimezone: 'Asia/Tokyo',
      details: {
        hotel_name: 'Test Hotel',
        address: '1-1 Test, Tokyo',
        confirmation_code: null,
        room_type: null,
        guests: null,
        check_in_time: '22:00',
        check_out_time: '11:00',
        phone: '+81-3-1234-5678',
      },
    });
    const result = computeAnnotations(prev, next);
    expect(result.kind).toBe('conflict');
    expect(result.message).toContain('Check-in closes');
    expect(result.conflictDetail).toContain('+81-3-1234-5678');
  });

  it('does not flag check-in conflict when flight lands before check-in closes', () => {
    // Flight lands at 18:00 JST (09:00 UTC), hotel check-in closes at 22:00
    const prev = makeSegment({
      type: 'flight',
      endTime: new Date('2026-03-11T09:00:00Z'),
      endTimezone: 'Asia/Tokyo',
    });
    const next = makeSegment({
      type: 'hotel_stay',
      startTime: new Date('2026-03-11T15:00:00Z'),
      startTimezone: 'Asia/Tokyo',
      details: {
        hotel_name: 'Test Hotel',
        address: '1-1 Test, Tokyo',
        confirmation_code: null,
        room_type: null,
        guests: null,
        check_in_time: '22:00',
        check_out_time: '11:00',
        phone: null,
      },
    });
    const result = computeAnnotations(prev, next);
    expect(result.kind).toBe('gap');
  });

  it('detects tight hotel-checkout-to-flight conflict (under 90 min)', () => {
    // 60 min gap between checkout and flight
    const prev = makeSegment({
      type: 'hotel_stay',
      endTime: new Date('2026-03-15T02:00:00Z'),
    });
    const next = makeSegment({
      type: 'flight',
      startTime: new Date('2026-03-15T03:00:00Z'),
    });
    const result = computeAnnotations(prev, next);
    expect(result.kind).toBe('conflict');
    expect(result.gapMinutes).toBe(60);
    expect(result.message).toContain('60 min');
  });

  it('does not flag checkout conflict when gap is 90 min or more', () => {
    const prev = makeSegment({
      type: 'hotel_stay',
      endTime: new Date('2026-03-15T02:00:00Z'),
    });
    const next = makeSegment({
      type: 'flight',
      startTime: new Date('2026-03-15T03:30:00Z'), // exactly 90 min
    });
    const result = computeAnnotations(prev, next);
    expect(result.kind).toBe('gap');
  });

  it('does not flag a fabricated overlap for a hotel_stay followed by a same-day reservation', () => {
    // Check-in Mar 11 18:00, checkout Mar 14 11:00 — checkout is days later,
    // not when the traveller stops occupying the hotel that evening.
    const prev = makeSegment({
      type: 'hotel_stay',
      startTime: new Date('2026-03-11T18:00:00Z'),
      endTime: new Date('2026-03-14T11:00:00Z'),
    });
    const next = makeSegment({
      type: 'reservation',
      startTime: new Date('2026-03-11T19:00:00Z'),
      details: {
        name: 'Dinner',
        category: 'restaurant',
        confirmation_code: null,
        party_size: 2,
        address: '1 Test St',
        phone: null,
        notes: null,
        end_is_estimated: false,
      },
    });
    const result = computeAnnotations(prev, next);
    expect(result.kind).toBe('gap');
  });

  it('does not flag an overlap when prev is a reservation with an estimated end time', () => {
    // Dinner at 19:00, estimated end 20:30 (not authoritative) — a 20:00 show
    // starting before that guessed end should not be reported as a conflict.
    const prev = makeSegment({
      type: 'reservation',
      startTime: new Date('2026-03-11T19:00:00Z'),
      endTime: new Date('2026-03-11T20:30:00Z'),
      details: {
        name: 'Dinner',
        category: 'restaurant',
        confirmation_code: null,
        party_size: 2,
        address: '1 Test St',
        phone: null,
        notes: null,
        end_is_estimated: true,
      },
    });
    const next = makeSegment({
      type: 'reservation',
      startTime: new Date('2026-03-11T20:00:00Z'),
    });
    const result = computeAnnotations(prev, next);
    expect(result.kind).toBe('gap');
  });

  it('still flags an overlap when prev is a reservation with a stated (non-estimated) end time', () => {
    const prev = makeSegment({
      type: 'reservation',
      startTime: new Date('2026-03-11T19:00:00Z'),
      endTime: new Date('2026-03-11T20:30:00Z'),
      details: {
        name: 'Dinner',
        category: 'restaurant',
        confirmation_code: null,
        party_size: 2,
        address: '1 Test St',
        phone: null,
        notes: null,
        end_is_estimated: false,
      },
    });
    const next = makeSegment({
      type: 'reservation',
      startTime: new Date('2026-03-11T20:00:00Z'),
    });
    const result = computeAnnotations(prev, next);
    expect(result.kind).toBe('conflict');
  });
});
