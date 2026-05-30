import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getUserByClerkId } from '@/lib/db/repositories/users';
import { getTripWithBookings } from '@/lib/db/repositories/trips';
import { TripDetailClient } from '@/components/trips/TripDetailClient';

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

  return <TripDetailClient tripId={tripId} initialData={trip} />;
}
