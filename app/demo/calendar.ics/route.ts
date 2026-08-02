import { getTripWithBookings } from '@/lib/db/repositories/trips';
import { env } from '@/lib/env.server';
import { icsResponse } from '@/lib/itinerary/ics-response';

// Public on purpose: this serves the one trip /demo already renders in full, so
// it exposes nothing that was not already public. No token, no share surface.
//
// The demo trip only changes on a deliberate re-seed, so an hourly window is
// plenty fresh — this deliberately differs from the authenticated route
// (app/(app)/trips/[tripId]/calendar.ics), where a user's trip changes
// whenever they add a booking.
export const revalidate = 3600;

export async function GET() {
  const trip = await getTripWithBookings(env.DEMO_TRIP_ID);
  if (!trip) return new Response('Not found', { status: 404 });

  return icsResponse(trip.title, trip.bookings.flatMap((b) => b.segments));
}
