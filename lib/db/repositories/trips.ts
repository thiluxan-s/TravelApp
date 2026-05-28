import { eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { trips, type Trip, type NewTrip } from '@/lib/db/schema';

export async function createTrip(
  data: Pick<NewTrip, 'userId' | 'title' | 'destination'>,
): Promise<Trip> {
  const result = await db.insert(trips).values(data).returning();
  const trip = result[0];
  if (!trip) throw new Error('INSERT into trips returned no rows');
  return trip;
}

export async function listTripsByUser(userId: string) {
  return db.query.trips.findMany({
    where: eq(trips.userId, userId),
    orderBy: desc(trips.createdAt),
    with: {
      bookings: {
        columns: { id: true, status: true },
      },
    },
  });
}

export type TripListItem = Awaited<ReturnType<typeof listTripsByUser>>[number];

export async function getTripById(id: string): Promise<Trip | undefined> {
  return db.query.trips.findFirst({
    where: eq(trips.id, id),
  });
}

export async function getTripWithBookings(id: string) {
  return db.query.trips.findFirst({
    where: eq(trips.id, id),
    with: { bookings: { orderBy: (b, { asc }) => [asc(b.createdAt)] } },
  });
}

export type TripWithBookings = NonNullable<Awaited<ReturnType<typeof getTripWithBookings>>>;

export async function deleteTripById(id: string): Promise<void> {
  await db.delete(trips).where(eq(trips.id, id));
}
