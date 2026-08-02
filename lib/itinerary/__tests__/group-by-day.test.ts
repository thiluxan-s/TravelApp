import { describe, it, expect } from 'vitest';
import { groupSegmentsByDay } from '../group-by-day';
import { makeSegment } from './helpers';

describe('groupSegmentsByDay', () => {
  it('returns empty array for no segments', () => {
    expect(groupSegmentsByDay([])).toEqual([]);
  });

  it('groups two segments on the same local day into one DayGroup', () => {
    const seg1 = makeSegment({
      id: 'a',
      startTime: new Date('2026-03-10T09:00:00Z'),
      endTime: new Date('2026-03-10T11:00:00Z'),
      startTimezone: 'UTC',
    });
    const seg2 = makeSegment({
      id: 'b',
      startTime: new Date('2026-03-10T14:00:00Z'),
      endTime: new Date('2026-03-10T16:00:00Z'),
      startTimezone: 'UTC',
    });
    const result = groupSegmentsByDay([seg1, seg2]);
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe('2026-03-10');
    expect(result[0].segments).toHaveLength(2);
    expect(result[0].annotations).toHaveLength(1);
  });

  it('places segments on different days into separate DayGroups', () => {
    const seg1 = makeSegment({
      id: 'a',
      startTime: new Date('2026-03-10T09:00:00Z'),
      endTime: new Date('2026-03-10T11:00:00Z'),
      startTimezone: 'UTC',
    });
    const seg2 = makeSegment({
      id: 'b',
      startTime: new Date('2026-03-11T09:00:00Z'),
      endTime: new Date('2026-03-11T11:00:00Z'),
      startTimezone: 'UTC',
    });
    const result = groupSegmentsByDay([seg1, seg2]);
    expect(result).toHaveLength(2);
    expect(result[0].date).toBe('2026-03-10');
    expect(result[1].date).toBe('2026-03-11');
  });

  it('respects timezone when determining local date', () => {
    // 2026-03-10T23:00:00Z = Mar 10 in UTC, but Mar 11 in Asia/Tokyo (UTC+9)
    const seg = makeSegment({
      startTime: new Date('2026-03-10T23:00:00Z'),
      endTime: new Date('2026-03-10T23:30:00Z'),
      startTimezone: 'Asia/Tokyo',
    });
    const result = groupSegmentsByDay([seg]);
    expect(result[0].date).toBe('2026-03-11');
  });

  it('sorts day groups chronologically regardless of input order', () => {
    const seg1 = makeSegment({
      id: 'a',
      startTime: new Date('2026-03-12T09:00:00Z'),
      endTime: new Date('2026-03-12T10:00:00Z'),
      startTimezone: 'UTC',
    });
    const seg2 = makeSegment({
      id: 'b',
      startTime: new Date('2026-03-10T09:00:00Z'),
      endTime: new Date('2026-03-10T10:00:00Z'),
      startTimezone: 'UTC',
    });
    const result = groupSegmentsByDay([seg1, seg2]);
    expect(result[0].date).toBe('2026-03-10');
    expect(result[1].date).toBe('2026-03-12');
  });

  it('sorts segments within a day chronologically regardless of input order', () => {
    // Mirrors the real failure: a hotel uploaded first, then an earlier flight.
    // The page flattens segments in booking-creation order, not start-time order.
    const hotel = makeSegment({
      id: 'hotel',
      type: 'hotel_stay',
      startTime: new Date('2026-03-10T15:00:00Z'),
      endTime: new Date('2026-03-13T11:00:00Z'),
      startTimezone: 'UTC',
      endTimezone: 'UTC',
    });
    const flight = makeSegment({
      id: 'flight',
      type: 'flight',
      startTime: new Date('2026-03-10T08:00:00Z'),
      endTime: new Date('2026-03-10T12:00:00Z'),
      startTimezone: 'UTC',
      endTimezone: 'UTC',
    });

    const result = groupSegmentsByDay([hotel, flight]);

    expect(result[0].segments.map((s) => s.id)).toEqual(['flight', 'hotel']);
  });

  it('does not report a conflict for non-overlapping segments given out-of-order input', () => {
    const hotel = makeSegment({
      id: 'hotel',
      type: 'hotel_stay',
      startTime: new Date('2026-03-10T15:00:00Z'),
      endTime: new Date('2026-03-13T11:00:00Z'),
      startTimezone: 'UTC',
      endTimezone: 'UTC',
    });
    const flight = makeSegment({
      id: 'flight',
      type: 'flight',
      startTime: new Date('2026-03-10T08:00:00Z'),
      endTime: new Date('2026-03-10T12:00:00Z'),
      startTimezone: 'UTC',
      endTimezone: 'UTC',
    });

    const result = groupSegmentsByDay([hotel, flight]);

    expect(result[0].annotations[0].kind).toBe('gap');
  });

  it('formats the day label in the correct timezone', () => {
    // 2026-03-10 is a Tuesday
    const seg = makeSegment({
      startTime: new Date('2026-03-10T09:00:00Z'),
      endTime: new Date('2026-03-10T10:00:00Z'),
      startTimezone: 'UTC',
    });
    const result = groupSegmentsByDay([seg]);
    expect(result[0].label).toBe('Tuesday, March 10');
  });

  const hotel = () =>
    makeSegment({
      id: 'hotel',
      type: 'hotel_stay',
      startTime: new Date('2026-03-11T18:00:00Z'),
      endTime: new Date('2026-03-14T11:00:00Z'),
      startTimezone: 'UTC',
      endTimezone: 'UTC',
    });

  it('creates day groups for nights a stay covers that have no segments', () => {
    const result = groupSegmentsByDay([hotel()]);
    expect(result.map((d) => d.date)).toEqual(['2026-03-11', '2026-03-12', '2026-03-13']);
  });

  it('does not create a day group for the checkout day', () => {
    const result = groupSegmentsByDay([hotel()]);
    expect(result.map((d) => d.date)).not.toContain('2026-03-14');
  });

  it('sets lodging on covered nights after the check-in day', () => {
    const result = groupSegmentsByDay([hotel()]);
    const mar12 = result.find((d) => d.date === '2026-03-12');
    expect(mar12!.lodging?.id).toBe('hotel');
    expect(mar12!.segments).toHaveLength(0);
  });

  it('leaves lodging null on the check-in day, where the stay is already a card', () => {
    const result = groupSegmentsByDay([hotel()]);
    const mar11 = result.find((d) => d.date === '2026-03-11');
    expect(mar11!.lodging).toBeNull();
    expect(mar11!.segments.map((s) => s.id)).toEqual(['hotel']);
  });

  it('keeps lodging out of the segments array so it never becomes an annotation pair', () => {
    const dinner = makeSegment({
      id: 'dinner',
      type: 'reservation',
      startTime: new Date('2026-03-12T19:00:00Z'),
      endTime: new Date('2026-03-12T20:30:00Z'),
      startTimezone: 'UTC',
      endTimezone: 'UTC',
    });
    const result = groupSegmentsByDay([hotel(), dinner]);
    const mar12 = result.find((d) => d.date === '2026-03-12');
    expect(mar12!.segments.map((s) => s.id)).toEqual(['dinner']);
    expect(mar12!.lodging?.id).toBe('hotel');
    expect(mar12!.annotations).toHaveLength(0);
  });

  it('labels a lodging-only day using the stay timezone', () => {
    const result = groupSegmentsByDay([hotel()]);
    // 2026-03-12 is a Thursday
    expect(result.find((d) => d.date === '2026-03-12')!.label).toBe('Thursday, March 12');
  });

  it('covers no nights when check-in and checkout fall on the same local date', () => {
    const dayUse = makeSegment({
      id: 'dayuse',
      type: 'hotel_stay',
      startTime: new Date('2026-03-11T09:00:00Z'),
      endTime: new Date('2026-03-11T17:00:00Z'),
      startTimezone: 'UTC',
      endTimezone: 'UTC',
    });
    const result = groupSegmentsByDay([dayUse]);
    expect(result.map((d) => d.date)).toEqual(['2026-03-11']);
    expect(result[0].lodging).toBeNull();
  });

  it('leaves lodging null on days no stay covers', () => {
    const flight = makeSegment({
      id: 'flight',
      startTime: new Date('2026-03-20T09:00:00Z'),
      endTime: new Date('2026-03-20T11:00:00Z'),
      startTimezone: 'UTC',
    });
    const result = groupSegmentsByDay([flight]);
    expect(result[0].lodging).toBeNull();
  });

  it('prefers the most recent check-in when two stays cover the same night', () => {
    const first = makeSegment({
      id: 'first',
      type: 'hotel_stay',
      startTime: new Date('2026-03-11T15:00:00Z'),
      endTime: new Date('2026-03-14T11:00:00Z'),
      startTimezone: 'UTC',
      endTimezone: 'UTC',
    });
    const second = makeSegment({
      id: 'second',
      type: 'hotel_stay',
      startTime: new Date('2026-03-12T15:00:00Z'),
      endTime: new Date('2026-03-14T11:00:00Z'),
      startTimezone: 'UTC',
      endTimezone: 'UTC',
    });
    const result = groupSegmentsByDay([first, second]);
    expect(result.find((d) => d.date === '2026-03-13')!.lodging?.id).toBe('second');
  });
});
