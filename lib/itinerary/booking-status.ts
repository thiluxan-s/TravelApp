import type { BookingStatus } from '@/lib/db/schema';

export type BookingStatusSummary = {
  total: number;
  inFlight: number;
  failed: number;
  parsed: number;
};

export type TimelineEmptyReason = 'no-bookings' | 'parsing' | 'all-failed';

export function summarizeBookingStatuses(
  bookings: { status: BookingStatus }[],
): BookingStatusSummary {
  let inFlight = 0;
  let failed = 0;
  let parsed = 0;

  for (const booking of bookings) {
    if (booking.status === 'uploading' || booking.status === 'parsing') inFlight++;
    else if (booking.status === 'parsing_failed') failed++;
    else if (booking.status === 'parsed') parsed++;
  }

  return { total: bookings.length, inFlight, failed, parsed };
}

// Only meaningful when the timeline has no day groups to render.
export function emptyTimelineReason(summary: BookingStatusSummary): TimelineEmptyReason {
  if (summary.total === 0) return 'no-bookings';
  if (summary.inFlight > 0) return 'parsing';
  if (summary.failed > 0 && summary.parsed === 0) return 'all-failed';
  return 'no-bookings';
}
