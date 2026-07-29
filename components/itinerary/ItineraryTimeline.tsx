// components/itinerary/ItineraryTimeline.tsx
import type { DayGroup } from '@/lib/itinerary/types';
import type { BookingStatus } from '@/lib/db/schema';
import { DaySection } from './DaySection';
import { AddBookingDialog } from '@/components/trips/AddBookingDialog';
import {
  summarizeBookingStatuses,
  emptyTimelineReason,
} from '@/lib/itinerary/booking-status';

const EMPTY_STATE_COPY = {
  'no-bookings': {
    icon: '🗺',
    title: 'No bookings yet',
    body: 'Upload a flight or hotel confirmation PDF to build your itinerary',
  },
  parsing: {
    icon: '⏳',
    title: 'Reading your bookings',
    body: 'This usually takes a few seconds — your itinerary will appear here',
  },
  'all-failed': {
    icon: '⚠',
    title: "We couldn't read your bookings",
    body: 'Check the uploaded documents below — you can try again or remove them',
  },
} as const;

export function ItineraryTimeline({
  dayGroups,
  tripId,
  bookings,
}: {
  dayGroups: DayGroup[];
  tripId: string;
  bookings: { status: BookingStatus }[];
}) {
  if (dayGroups.length === 0) {
    const reason = emptyTimelineReason(summarizeBookingStatuses(bookings));
    const copy = EMPTY_STATE_COPY[reason];

    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border p-8 text-center">
        <span className="text-4xl opacity-20" aria-hidden="true">
          {copy.icon}
        </span>
        <div>
          <p className="text-sm font-medium">{copy.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{copy.body}</p>
        </div>
        {reason === 'no-bookings' && <AddBookingDialog tripId={tripId} />}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {dayGroups.map((day) => (
        <DaySection key={day.date} day={day} />
      ))}
    </div>
  );
}
