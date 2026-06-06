// app/(app)/trips/[tripId]/loading.tsx
import { ItinerarySkeleton } from '@/components/itinerary/ItinerarySkeleton';

export default function TripDetailLoading() {
  return (
    <div>
      <div className="mb-6 flex animate-pulse items-start justify-between">
        <div className="space-y-1.5">
          <div className="h-3 w-16 rounded bg-muted" />
          <div className="h-6 w-48 rounded bg-muted" />
        </div>
      </div>
      <ItinerarySkeleton />
    </div>
  );
}
