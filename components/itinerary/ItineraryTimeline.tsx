// components/itinerary/ItineraryTimeline.tsx
import type { DayGroup } from '@/lib/itinerary/types';
import { DaySection } from './DaySection';
import { AddBookingDialog } from '@/components/trips/AddBookingDialog';

export function ItineraryTimeline({
  dayGroups,
  tripId,
}: {
  dayGroups: DayGroup[];
  tripId: string;
}) {
  if (dayGroups.length === 0) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border p-8 text-center">
        <span className="text-4xl opacity-20">🗺</span>
        <div>
          <p className="text-sm font-medium">No bookings yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Upload a flight or hotel confirmation PDF to build your itinerary
          </p>
        </div>
        <AddBookingDialog tripId={tripId} />
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
