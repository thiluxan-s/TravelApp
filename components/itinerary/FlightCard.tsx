import { DateTime } from 'luxon';
import { FlightDetailsSchema } from '@/lib/ai/schemas/flight';
import type { Segment } from '@/lib/db/schema';

function fmt(dt: DateTime, pattern: string): string {
  return dt.isValid ? dt.toFormat(pattern) : '—';
}

export function FlightCard({ segment }: { segment: Segment }) {
  const details = FlightDetailsSchema.safeParse(segment.details);
  const dep = DateTime.fromJSDate(segment.startTime, { zone: segment.startTimezone });
  const arr = DateTime.fromJSDate(segment.endTime, { zone: segment.endTimezone });
  const durationMins =
    dep.isValid && arr.isValid ? Math.round(arr.diff(dep, 'minutes').minutes) : null;
  const durationStr =
    durationMins != null
      ? durationMins % 60 > 0
        ? `${Math.floor(durationMins / 60)}h ${durationMins % 60}m`
        : `${Math.floor(durationMins / 60)}h`
      : '—';

  if (!details.success) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">✈ Flight</p>
        <p className="text-sm text-muted-foreground">Parsed</p>
      </div>
    );
  }

  const d = details.data;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">✈ Flight</span>
        {d.confirmation_code && (
          <span className="text-xs text-muted-foreground">Conf: {d.confirmation_code}</span>
        )}
      </div>

      {/* Route */}
      <div className="mb-3 flex items-center">
        <div className="text-center">
          <div className="text-3xl font-bold tracking-tight">{d.departure_airport_code}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{fmt(dep, 'HH:mm')}</div>
          <div className="text-xs text-muted-foreground">{fmt(dep, 'EEE MMM d')}</div>
        </div>
        <div className="relative flex flex-1 flex-col items-center px-3">
          <div className="mb-1 text-xs text-muted-foreground">{durationStr}</div>
          <div className="relative w-full">
            <div className="h-px w-full bg-border" />
            <span className="absolute -right-1 -top-[5px] text-xs text-muted-foreground">▶</span>
          </div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold tracking-tight">{d.arrival_airport_code}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{fmt(arr, 'HH:mm')}</div>
          <div className="text-xs text-muted-foreground">{fmt(arr, 'EEE MMM d')}</div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex flex-wrap gap-3 border-t border-border pt-3 text-xs text-muted-foreground">
        <span>{d.airline}</span>
        <span>{d.flight_number}</span>
        {d.seat && <span>Seat {d.seat}</span>}
        {d.cabin_class && <span>{d.cabin_class}</span>}
      </div>
    </div>
  );
}
