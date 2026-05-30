import type { Booking } from '@/lib/db/schema';

type Props = {
  booking: Booking;
};

const typeIcon: Record<string, string> = {
  flight: '✈',
  hotel: '🏨',
  unknown: '📄',
};

export function BookingCard({ booking }: Props) {
  const icon = typeIcon[booking.type] ?? '📄';

  return (
    <div className="flex items-center gap-3 bg-card border border-border rounded-md px-3 py-2.5">
      <div className="w-8 h-8 rounded bg-muted flex items-center justify-center flex-shrink-0 text-base">
        {booking.status === 'uploading' ? (
          <span className="block w-4 h-4 border-2 border-muted-foreground/30 border-t-foreground rounded-full animate-spin" />
        ) : (
          icon
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{booking.fileName}</p>
        <StatusLine booking={booking} />
      </div>
    </div>
  );
}

function StatusLine({ booking }: { booking: Booking }) {
  switch (booking.status) {
    case 'uploading':
      return <p className="text-xs text-muted-foreground">Uploading…</p>;
    case 'parsing':
      return <p className="text-xs text-amber-500">Parsing with AI…</p>;
    case 'parsed':
      return <p className="text-xs text-emerald-500">✓ Parsed</p>;
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
