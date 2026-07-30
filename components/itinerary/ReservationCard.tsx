import { DateTime } from 'luxon';
import { ReservationDetailsSchema, type ReservationCategory } from '@/lib/ai/schemas/reservation';
import type { Segment } from '@/lib/db/schema';

const CATEGORY_LABEL: Record<ReservationCategory, string> = {
  restaurant: '🍽 Restaurant',
  activity: '🎟 Activity',
  tour: '🧭 Tour',
  attraction: '🎫 Attraction',
  other: '📌 Reservation',
};

export function ReservationCard({ segment }: { segment: Segment }) {
  const details = ReservationDetailsSchema.safeParse(segment.details);
  const start = DateTime.fromJSDate(segment.startTime, { zone: segment.startTimezone });
  const end = DateTime.fromJSDate(segment.endTime, { zone: segment.endTimezone });

  if (!details.success) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
          📌 Reservation
        </p>
        <p className="text-sm text-muted-foreground">Parsed</p>
      </div>
    );
  }

  const d = details.data;
  const label = CATEGORY_LABEL[d.category] ?? CATEGORY_LABEL.other;

  // Only show a range when the document actually gave us an end time.
  const timeStr = d.end_is_estimated
    ? start.isValid
      ? start.toFormat('HH:mm')
      : '—'
    : start.isValid && end.isValid
      ? `${start.toFormat('HH:mm')} – ${end.toFormat('HH:mm')}`
      : '—';

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
        {d.confirmation_code && (
          <span className="text-xs text-muted-foreground">Conf: {d.confirmation_code}</span>
        )}
      </div>

      <div className="mb-1 text-xl font-semibold">{d.name}</div>
      <div className="mb-3 text-sm font-medium">
        {timeStr}
        {d.party_size != null && (
          <span className="text-muted-foreground">
            {' '}
            · {d.party_size} {d.party_size === 1 ? 'guest' : 'guests'}
          </span>
        )}
      </div>

      {d.notes && <p className="mb-3 text-xs text-muted-foreground">{d.notes}</p>}

      <div className="flex flex-wrap gap-3 border-t border-border pt-3 text-xs text-muted-foreground">
        <span className="truncate">{d.address}</span>
        {d.phone && <span className="whitespace-nowrap">{d.phone}</span>}
      </div>
    </div>
  );
}
