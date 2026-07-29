import type { TripWithBookings } from '@/lib/db/repositories/trips';
import { BookingCard } from './BookingCard';
import { BookingActions } from './BookingActions';

export function BookingsPanel({
  bookings,
}: {
  bookings: TripWithBookings['bookings'];
}) {
  if (bookings.length === 0) return null;

  return (
    <section id="bookings" className="mt-8">
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Uploaded documents
      </h2>
      <div className="space-y-2">
        {bookings.map((booking) => (
          <BookingCard
            key={booking.id}
            booking={booking}
            segment={booking.segments[0]}
            actions={<BookingActions bookingId={booking.id} status={booking.status} />}
          />
        ))}
      </div>
    </section>
  );
}
