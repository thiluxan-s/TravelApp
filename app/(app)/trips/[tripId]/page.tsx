// app/(app)/trips/[tripId]/page.tsx
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { getUserByClerkId } from '@/lib/db/repositories/users';
import { getTripWithBookings } from '@/lib/db/repositories/trips';
import { groupSegmentsByDay } from '@/lib/itinerary/group-by-day';
import { ItineraryTimeline } from '@/components/itinerary/ItineraryTimeline';
import { ParsingBanner } from '@/components/itinerary/ParsingBanner';
import { MapPanel } from '@/components/itinerary/MapPanel';
import { AddBookingDialog } from '@/components/trips/AddBookingDialog';
import { DeleteTripButton } from '@/components/trips/DeleteTripButton';

export default async function TripDetailPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;

  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) redirect('/sign-in');

  const user = await getUserByClerkId(clerkUserId);
  if (!user) redirect('/sign-in');

  const trip = await getTripWithBookings(tripId);
  if (!trip) notFound();
  if (trip.userId !== user.id) notFound();

  const segments = trip.bookings.flatMap((b) => b.segments);
  const dayGroups = groupSegmentsByDay(segments);
  const days = dayGroups.map((d) => ({ date: d.date, label: d.label }));

  return (
    <div>
      {/* Page header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <Link
            href="/trips"
            className="mb-1 block text-xs text-muted-foreground hover:text-foreground"
          >
            ← Your trips
          </Link>
          <h1 className="text-xl font-semibold">{trip.title}</h1>
          {trip.destination && (
            <p className="mt-0.5 text-sm text-muted-foreground">{trip.destination}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <AddBookingDialog tripId={tripId} />
          <DeleteTripButton tripId={tripId} />
        </div>
      </div>

      {/* Parsing banner */}
      <ParsingBanner bookings={trip.bookings} />

      {/* Itinerary + Map */}
      <div className="lg:grid lg:grid-cols-[3fr_2fr] lg:gap-6">
        <div>
          <ItineraryTimeline dayGroups={dayGroups} tripId={tripId} />
        </div>
        {segments.length > 0 && days.length > 0 && (
          <div className="mt-6 lg:sticky lg:top-6 lg:mt-0 lg:h-[calc(100vh-8rem)]">
            <MapPanel segments={segments} days={days} />
          </div>
        )}
      </div>
    </div>
  );
}
