import { describe, it, expect } from 'vitest';
import {
  summarizeBookingStatuses,
  emptyTimelineReason,
} from '../booking-status';

describe('summarizeBookingStatuses', () => {
  it('returns all zeros for no bookings', () => {
    expect(summarizeBookingStatuses([])).toEqual({
      total: 0,
      inFlight: 0,
      failed: 0,
      parsed: 0,
    });
  });

  it('counts uploading and parsing together as in-flight', () => {
    const summary = summarizeBookingStatuses([
      { status: 'uploading' },
      { status: 'parsing' },
    ]);
    expect(summary.inFlight).toBe(2);
  });

  it('counts failed bookings separately from in-flight ones', () => {
    const summary = summarizeBookingStatuses([
      { status: 'parsing' },
      { status: 'parsing_failed' },
      { status: 'parsing_failed' },
    ]);
    expect(summary.inFlight).toBe(1);
    expect(summary.failed).toBe(2);
    expect(summary.total).toBe(3);
  });

  it('counts parsed bookings', () => {
    const summary = summarizeBookingStatuses([
      { status: 'parsed' },
      { status: 'parsed' },
      { status: 'parsing_failed' },
    ]);
    expect(summary.parsed).toBe(2);
  });
});

describe('emptyTimelineReason', () => {
  it('reports no-bookings when nothing has been uploaded', () => {
    const summary = summarizeBookingStatuses([]);
    expect(emptyTimelineReason(summary)).toBe('no-bookings');
  });

  it('reports parsing while work is still in flight', () => {
    const summary = summarizeBookingStatuses([
      { status: 'parsing' },
      { status: 'parsing_failed' },
    ]);
    expect(emptyTimelineReason(summary)).toBe('parsing');
  });

  it('reports all-failed when every booking failed to parse', () => {
    const summary = summarizeBookingStatuses([
      { status: 'parsing_failed' },
      { status: 'parsing_failed' },
    ]);
    expect(emptyTimelineReason(summary)).toBe('all-failed');
  });

  it('reports no-bookings when something parsed but produced no segments', () => {
    const summary = summarizeBookingStatuses([{ status: 'parsed' }]);
    expect(emptyTimelineReason(summary)).toBe('no-bookings');
  });
});
