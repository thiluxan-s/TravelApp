import type { DayGroup } from '@/lib/itinerary/types';
import { FlightCard } from './FlightCard';
import { HotelCard } from './HotelCard';
import { AnnotationPill } from './AnnotationPill';

export function DaySection({ day }: { day: DayGroup }) {
  return (
    <div className="space-y-2">
      <h2 className="pt-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {day.label}
      </h2>
      {day.segments.map((segment, i) => (
        <div key={segment.id}>
          {segment.type === 'flight' ? (
            <FlightCard segment={segment} />
          ) : (
            <HotelCard segment={segment} />
          )}
          {day.annotations[i] && <AnnotationPill annotation={day.annotations[i]!} />}
        </div>
      ))}
    </div>
  );
}
