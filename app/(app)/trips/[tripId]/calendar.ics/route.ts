import { auth } from '@clerk/nextjs/server';
import { getUserByClerkId } from '@/lib/db/repositories/users';
import { getTripWithBookings } from '@/lib/db/repositories/trips';
import { icsResponse } from '@/lib/itinerary/ics-response';

// Without this, a handler that only reads the database can be statically
// generated at build time and would then serve a stale calendar after a booking
// is added — the export exists to be current.
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const { tripId } = await params;

  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return new Response('Not found', { status: 404 });

  const user = await getUserByClerkId(clerkUserId);
  if (!user) return new Response('Not found', { status: 404 });

  const trip = await getTripWithBookings(tripId);
  // 404 for a missing trip and for someone else's alike, so the response never
  // reveals which trip ids exist. Matches the pages' use of notFound() for both.
  if (!trip || trip.userId !== user.id) return new Response('Not found', { status: 404 });

  return icsResponse(trip.title, trip.bookings.flatMap((b) => b.segments));
}
