import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getUserByClerkId } from '@/lib/db/repositories/users';
import { listTripsByUser } from '@/lib/db/repositories/trips';
import { TripCard } from '@/components/trips/TripCard';
import { NewTripDialog } from '@/components/trips/NewTripDialog';

export default async function TripsPage() {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) redirect('/sign-in');

  const user = await getUserByClerkId(clerkUserId);
  if (!user) redirect('/sign-in');

  const trips = await listTripsByUser(user.id);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Your trips</h1>
        <NewTripDialog />
      </div>

      {trips.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 text-center">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">No trips yet</h2>
            <p className="text-sm text-muted-foreground">
              Create a trip and upload your booking confirmations.
            </p>
          </div>
          <NewTripDialog />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {trips.map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </div>
      )}
    </div>
  );
}
