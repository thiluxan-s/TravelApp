import Link from 'next/link';
import type { TripListItem } from '@/lib/db/repositories/trips';

export function TripCard({ trip }: { trip: TripListItem }) {
  const bookingCount = trip.bookings.length;
  const parsingCount = trip.bookings.filter((b) => b.status === 'parsing').length;

  const statusSummary =
    bookingCount === 0
      ? 'No bookings yet'
      : parsingCount > 0
        ? `${bookingCount} booking${bookingCount !== 1 ? 's' : ''} · ${parsingCount} parsing`
        : `${bookingCount} booking${bookingCount !== 1 ? 's' : ''}`;

  return (
    <Link
      href={`/trips/${trip.id}`}
      className="block bg-card border border-border rounded-lg p-4 hover:border-border/80 hover:bg-card/80 transition-colors"
    >
      {trip.destination && (
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
          {trip.destination}
        </p>
      )}
      <h2 className="font-semibold text-sm mb-1">{trip.title}</h2>
      <p className="text-xs text-muted-foreground">{statusSummary}</p>
    </Link>
  );
}
