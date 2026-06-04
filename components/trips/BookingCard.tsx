import type { Booking, Segment } from '@/lib/db/schema';
import type { FlightDetails } from '@/lib/ai/schemas/flight';
import type { HotelDetails } from '@/lib/ai/schemas/hotel';

type Props = {
  booking: Booking;
  segment?: Segment;
};

const typeIcon: Record<string, string> = {
  flight: '✈',
  hotel: '🏨',
  unknown: '📄',
};

function formatLocalDate(utcDate: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(utcDate);
}

function formatLocalTime(utcDate: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(utcDate);
}

export function BookingCard({ booking, segment }: Props) {
  const icon = typeIcon[booking.type] ?? '📄';

  return (
    <div className="flex items-start gap-3 bg-card border border-border rounded-md px-3 py-2.5">
      <div className="w-8 h-8 rounded bg-muted flex items-center justify-center flex-shrink-0 text-base mt-0.5">
        {booking.status === 'uploading' ? (
          <span className="block w-4 h-4 border-2 border-muted-foreground/30 border-t-foreground rounded-full animate-spin" />
        ) : (
          icon
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{booking.fileName}</p>
        <StatusLine booking={booking} segment={segment} />
      </div>
    </div>
  );
}

function StatusLine({ booking, segment }: { booking: Booking; segment?: Segment }) {
  switch (booking.status) {
    case 'uploading':
      return <p className="text-xs text-muted-foreground">Uploading…</p>;
    case 'parsing':
      return <p className="text-xs text-amber-500">Parsing with AI…</p>;
    case 'parsed':
      return <ParsedLine segment={segment} />;
    case 'parsing_failed':
      return (
        <p className="text-xs text-destructive">
          {booking.parseError ?? "Couldn't parse this file"}
        </p>
      );
    default:
      return null;
  }
}

function ParsedLine({ segment }: { segment?: Segment }) {
  if (!segment) return <p className="text-xs text-emerald-500">✓ Parsed</p>;

  if (segment.type === 'flight') {
    const details = segment.details as FlightDetails;
    const depTime = formatLocalTime(new Date(segment.startTime), segment.startTimezone);
    const arrTime = formatLocalTime(new Date(segment.endTime), segment.endTimezone);
    return (
      <div className="text-xs text-muted-foreground space-y-0.5 mt-0.5">
        <p className="font-medium text-foreground">
          {details.departure_airport_code} → {details.arrival_airport_code}
        </p>
        <p>
          {details.flight_number} · {details.airline}
        </p>
        <p>
          {depTime} → {arrTime}
        </p>
      </div>
    );
  }

  if (segment.type === 'hotel_stay') {
    const details = segment.details as HotelDetails;
    const checkIn = formatLocalDate(new Date(segment.startTime), segment.startTimezone);
    const checkOut = formatLocalDate(new Date(segment.endTime), segment.endTimezone);
    return (
      <div className="text-xs text-muted-foreground space-y-0.5 mt-0.5">
        <p className="font-medium text-foreground">{details.hotel_name}</p>
        <p>
          {checkIn} → {checkOut}
        </p>
        <p className="truncate">{details.address}</p>
      </div>
    );
  }

  return <p className="text-xs text-emerald-500">✓ Parsed</p>;
}
