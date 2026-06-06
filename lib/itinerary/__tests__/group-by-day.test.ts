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
});
