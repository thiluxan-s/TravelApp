'use server';

import { auth } from '@clerk/nextjs/server';
import { getUserByClerkId } from '@/lib/db/repositories/users';
import { getTripById, getTripWithBookings, type TripWithBookings } from '@/lib/db/repositories/trips';
import { createBooking, getBookingById, updateBookingStatus } from '@/lib/db/repositories/bookings';
import { inngest } from '@/lib/inngest/client';
import { getPresignedUploadUrl } from '@/lib/r2';
import { db } from '@/lib/db';
import { bookings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
]);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

async function getAuthenticatedUser() {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return null;
  return getUserByClerkId(clerkUserId);
}

export async function getTripAction(
  tripId: string,
): Promise<{ ok: true; data: TripWithBookings } | { ok: false; error: string }> {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return { ok: false, error: 'Unauthorized' };

    const trip = await getTripWithBookings(tripId);
    if (!trip) return { ok: false, error: 'Trip not found' };
    if (trip.userId !== user.id) return { ok: false, error: 'Forbidden' };

    return { ok: true, data: trip };
  } catch {
    return { ok: false, error: 'Something went wrong' };
  }
}

export async function requestBookingUploadAction(input: {
  tripId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}): Promise<
  { ok: true; data: { uploadUrl: string; bookingId: string } } | { ok: false; error: string }
> {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return { ok: false, error: 'Unauthorized' };

    const trip = await getTripById(input.tripId);
    if (!trip) return { ok: false, error: 'Trip not found' };
    if (trip.userId !== user.id) return { ok: false, error: 'Forbidden' };

    if (!ALLOWED_MIME_TYPES.has(input.mimeType)) {
      return { ok: false, error: 'Only PDF, JPEG, PNG, WEBP, and HEIC files are supported' };
    }
    if (input.fileSize > MAX_FILE_SIZE) {
      return { ok: false, error: 'File must be 10 MB or smaller' };
    }

    // Create booking first to get its UUID, then build the R2 key using that UUID
    const booking = await createBooking({
      tripId: input.tripId,
      status: 'uploading',
      fileKey: '',
      fileName: input.fileName,
      fileSizeBytes: input.fileSize,
      mimeType: input.mimeType,
    });

    const fileKey = `${user.id}/${input.tripId}/${booking.id}/${input.fileName}`;

    await db.update(bookings).set({ fileKey }).where(eq(bookings.id, booking.id));

    let uploadUrl: string;
    try {
      uploadUrl = await getPresignedUploadUrl(fileKey, input.mimeType);
    } catch {
      // Clean up the orphaned booking row
      await db.delete(bookings).where(eq(bookings.id, booking.id));
      return { ok: false, error: 'Failed to generate upload URL' };
    }

    return { ok: true, data: { uploadUrl, bookingId: booking.id } };
  } catch {
    return { ok: false, error: 'Something went wrong' };
  }
}

export async function confirmBookingUploadedAction(
  bookingId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return { ok: false, error: 'Unauthorized' };

    const booking = await getBookingById(bookingId);
    if (!booking) return { ok: false, error: 'Booking not found' };

    const trip = await getTripById(booking.tripId);
    if (!trip || trip.userId !== user.id) return { ok: false, error: 'Forbidden' };

    if (booking.status !== 'uploading') {
      return { ok: false, error: 'Booking is not awaiting upload confirmation' };
    }

    await updateBookingStatus(bookingId, 'parsing');
    await inngest.send({ name: 'booking/uploaded', data: { bookingId } });

    return { ok: true };
  } catch {
    return { ok: false, error: 'Something went wrong' };
  }
}
