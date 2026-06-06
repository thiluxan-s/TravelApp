import { DateTime } from 'luxon';
import { HotelDetailsSchema } from '@/lib/ai/schemas/hotel';
import type { Segment } from '@/lib/db/schema';

export function HotelCard({ segment }: { segment: Segment }) {
  const details = HotelDetailsSchema.safeParse(segment.details);
  const checkIn = DateTime.fromJSDate(segment.startTime, { zone: segment.startTimezone });
  const checkOut = DateTime.fromJSDate(segment.endTime, { zone: segment.endTimezone });
  const nights = Math.round(checkOut.diff(checkIn, 'days').days);

  if (!details.success) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">🏨 Hotel</p>
        <p className="text-sm text-muted-foreground">Parsed</p>
      </div>
    );
  }

  const d = details.data;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">🏨 Hotel</span>
        {d.confirmation_code && (
          <span className="text-xs text-muted-foreground">Conf: {d.confirmation_code}</span>
        )}
      </div>

      {/* Hotel name */}
      <div className="mb-3 text-xl font-semibold">{d.hotel_name}</div>

      {/* Check-in / check-out / nights */}
      <div className="mb-3 flex gap-4">
        <div>
          <div className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
            Check-in
          </div>
          <div className="text-sm font-medium">
            {checkIn.toFormat('MMM d')}
            {d.check_in_time && (
              <span className="text-muted-foreground"> · {d.check_in_time}</span>
            )}
          </div>
        </div>
        <div className="w-px bg-border" />
        <div>
          <div className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
            Check-out
          </div>
          <div className="text-sm font-medium">
            {checkOut.toFormat('MMM d')}
            {d.check_out_time && (
              <span className="text-muted-foreground"> · {d.check_out_time}</span>
            )}
          </div>
        </div>
        <div className="w-px bg-border" />
        <div>
          <div className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">Nights</div>
          <div className="text-sm font-medium">{nights}</div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex flex-wrap gap-3 border-t border-border pt-3 text-xs text-muted-foreground">
        {d.room_type && <span>{d.room_type}</span>}
        <span className="truncate">{d.address}</span>
      </div>
    </div>
  );
}
