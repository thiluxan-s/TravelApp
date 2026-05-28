import { eq, asc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bookings, type Booking, type NewBooking, type BookingStatus } from '@/lib/db/schema';

export async function createBooking(
  data: Pick<
    NewBooking,
    'tripId' | 'status' | 'fileKey' | 'fileName' | 'fileSizeBytes' | 'mimeType'
  >,
): Promise<Booking> {
  const result = await db.insert(bookings).values(data).returning();
  const booking = result[0];
  if (!booking) throw new Error('INSERT into bookings returned no rows');
  return booking;
}

export async function getBookingById(id: string): Promise<Booking | undefined> {
  return db.query.bookings.findFirst({
    where: eq(bookings.id, id),
  });
}

export async function updateBookingStatus(
  id: string,
  status: BookingStatus,
  extra?: { parseError?: string },
): Promise<void> {
  await db
    .update(bookings)
    .set({
      status,
      parseError: extra?.parseError ?? null,
      updatedAt: new Date(),
    })
    .where(eq(bookings.id, id));
}

export async function getBookingsByTripId(tripId: string): Promise<Booking[]> {
  return db.query.bookings.findMany({
    where: eq(bookings.tripId, tripId),
    orderBy: asc(bookings.createdAt),
  });
}
