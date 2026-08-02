import type { ComponentType } from 'react';
import type { DayGroup } from '@/lib/itinerary/types';
import type { Segment, SegmentType } from '@/lib/db/schema';
import { HotelDetailsSchema } from '@/lib/ai/schemas/hotel';
import { FlightCard } from './FlightCard';
import { HotelCard } from './HotelCard';
import { TrainCard } from './TrainCard';
import { ReservationCard } from './ReservationCard';
import { AnnotationPill } from './AnnotationPill';
import { SegmentWrapper } from './SegmentWrapper';

const CARD_BY_SEGMENT_TYPE: Record<SegmentType, ComponentType<{ segment: Segment }>> = {
  flight: FlightCard,
  hotel_stay: HotelCard,
  train_ride: TrainCard,
  reservation: ReservationCard,
};

export function DaySection({ day }: { day: DayGroup }) {
  return (
    <div className="space-y-2">
      <h2 className="pt-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {day.label}
      </h2>
      {day.segments.map((segment, i) => {
        const Card = CARD_BY_SEGMENT_TYPE[segment.type];
        return (
          <div key={segment.id}>
            <SegmentWrapper segmentId={segment.id}>
              <Card segment={segment} />
            </SegmentWrapper>
            {day.annotations[i] && <AnnotationPill annotation={day.annotations[i]!} />}
          </div>
        );
      })}
      {day.lodging && <LodgingFooter segment={day.lodging} />}
    </div>
  );
}

function LodgingFooter({ segment }: { segment: Segment }) {
  const details = HotelDetailsSchema.safeParse(segment.details);
  const name = details.success ? details.data.hotel_name : segment.startLocation;

  return (
    <p className="pt-1 text-xs text-muted-foreground">
      <span aria-hidden="true">🏨</span> Staying at {name}
    </p>
  );
}
