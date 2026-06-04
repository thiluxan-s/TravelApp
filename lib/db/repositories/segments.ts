import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { segments, type Segment, type NewSegment } from '@/lib/db/schema';

export async function createSegment(data: NewSegment): Promise<Segment> {
  const result = await db.insert(segments).values(data).returning();
  const segment = result[0];
  if (!segment) throw new Error('INSERT into segments returned no rows');
  return segment;
}

export async function getSegmentsByBookingId(bookingId: string): Promise<Segment[]> {
  return db.query.segments.findMany({
    where: eq(segments.bookingId, bookingId),
  });
}

export async function segmentExistsForBooking(bookingId: string): Promise<boolean> {
  const result = await db.query.segments.findFirst({
    where: eq(segments.bookingId, bookingId),
    columns: { id: true },
  });
  return result !== undefined;
}
