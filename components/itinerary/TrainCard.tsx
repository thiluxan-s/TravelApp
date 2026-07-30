import { DateTime } from 'luxon';
import { TrainDetailsSchema } from '@/lib/ai/schemas/train';
import type { Segment } from '@/lib/db/schema';

function fmt(dt: DateTime, pattern: string): string {
  return dt.isValid ? dt.toFormat(pattern) : '—';
}

export function TrainCard({ segment }: { segment: Segment }) {
  const details = TrainDetailsSchema.safeParse(segment.details);
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
        <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">🚄 Train</p>
        <p className="text-sm text-muted-foreground">Parsed</p>
      </div>
    );
  }

  const d = details.data;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">🚄 Train</span>
        {d.confirmation_code && (
          <span className="text-xs text-muted-foreground">Conf: {d.confirmation_code}</span>
        )}
      </div>

      <div className="mb-3 flex items-center">
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-semibold tracking-tight">
            {d.departure_station}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">{fmt(dep, 'HH:mm')}</div>
          <div className="text-xs text-muted-foreground">{fmt(dep, 'EEE MMM d')}</div>
        </div>
        <div className="flex flex-col items-center px-3">
          <div className="mb-1 whitespace-nowrap text-xs text-muted-foreground">
            {durationStr}
          </div>
          <div className="relative w-12">
            <div className="h-px w-full bg-border" />
            <span className="absolute -right-1 -top-[5px] text-xs text-muted-foreground">▶</span>
          </div>
        </div>
        <div className="min-w-0 flex-1 text-right">
          <div className="truncate text-lg font-semibold tracking-tight">{d.arrival_station}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{fmt(arr, 'HH:mm')}</div>
          <div className="text-xs text-muted-foreground">{fmt(arr, 'EEE MMM d')}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 border-t border-border pt-3 text-xs text-muted-foreground">
        <span>{d.operator}</span>
        <span>{d.train_number}</span>
        {d.coach && <span>Coach {d.coach}</span>}
        {d.seat && <span>Seat {d.seat}</span>}
        {d.travel_class && <span>{d.travel_class}</span>}
      </div>
    </div>
  );
}
