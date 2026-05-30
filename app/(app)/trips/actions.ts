'use server';

import { auth } from '@clerk/nextjs/server';
import { getUserByClerkId } from '@/lib/db/repositories/users';
import {
  createTrip,
  listTripsByUser,
  getTripById,
  deleteTripById,
  type TripListItem,
} from '@/lib/db/repositories/trips';
import { getBookingsByTripId } from '@/lib/db/repositories/bookings';
import { deleteObject } from '@/lib/r2';

async function getAuthenticatedUser() {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return null;
  return getUserByClerkId(clerkUserId);
}

export async function createTripAction(input: {
  title: string;
  destination?: string;
}): Promise<{ ok: true; data: { tripId: string } } | { ok: false; error: string }> {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return { ok: false, error: 'Unauthorized' };

    const title = input.title.trim();
    if (!title) return { ok: false, error: 'Trip name is required' };

    const trip = await createTrip({
      userId: user.id,
      title,
      destination: input.destination?.trim() || null,
    });

    return { ok: true, data: { tripId: trip.id } };
  } catch {
    return { ok: false, error: 'Something went wrong' };
  }
}

export async function listTripsAction(): Promise<
  { ok: true; data: TripListItem[] } | { ok: false; error: string }
> {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return { ok: false, error: 'Unauthorized' };

    const trips = await listTripsByUser(user.id);
    return { ok: true, data: trips };
  } catch {
    return { ok: false, error: 'Something went wrong' };
  }
}

export async function deleteTripAction(
  tripId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return { ok: false, error: 'Unauthorized' };

    const trip = await getTripById(tripId);
    if (!trip) return { ok: false, error: 'Trip not found' };
    if (trip.userId !== user.id) return { ok: false, error: 'Forbidden' };

    // Delete R2 objects for all bookings that have a real file key set
    const bookings = await getBookingsByTripId(tripId);
    await Promise.allSettled(
      bookings
        .filter((b) => b.fileKey !== '')
        .map((b) => deleteObject(b.fileKey)),
    );

    await deleteTripById(tripId);
    return { ok: true };
  } catch {
    return { ok: false, error: 'Something went wrong' };
  }
}
