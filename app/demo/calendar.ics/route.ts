import { getTripWithBookings } from '@/lib/db/repositories/trips';
import { env } from '@/lib/env.server';
import { icsResponse } from '@/lib/itinerary/ics-response';

// Public on purpose: this serves the one trip /demo already renders in full, so
// it exposes nothing that was not already public. No token, no share surface.
export const dynamic = 'force-dynamic';

export async function GET() {
  const trip = await getTripWithBookings(env.DEMO_TRIP_ID);
  if (!trip) return new Response('Not found', { status: 404 });

  return icsResponse(trip.title, trip.bookings.flatMap((b) => b.segments));
}
