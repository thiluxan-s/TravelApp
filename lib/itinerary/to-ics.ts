import type { Segment, SegmentType } from '@/lib/db/schema';
import { FlightDetailsSchema } from '@/lib/ai/schemas/flight';
import { HotelDetailsSchema } from '@/lib/ai/schemas/hotel';
import { TrainDetailsSchema } from '@/lib/ai/schemas/train';
import { ReservationDetailsSchema } from '@/lib/ai/schemas/reservation';

/**
 * One calendar event, before serialization. The mappers produce this shape and a
 * single serializer handles escaping and folding for all of them — escaping in
 * one place rather than four is what keeps it correct.
 */
export type IcsEvent = {
  uid: string;
  start: Date;
  end: Date;
  stamp: Date;
  summary: string;
  description: string | null;
  location: string | null;
  geo: { lat: number; lng: number } | null;
};

/**
 * Check-in and check-out are moments, not blocks, but a zero-length event
 * renders inconsistently across clients. Thirty minutes is unambiguous without
 * dominating the day view — which is why a multi-day block was rejected.
 */
const HOTEL_POINT_EVENT_MINUTES = 30;

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

/** Drizzle returns numeric columns as strings. */
function geoFrom(segment: Segment): IcsEvent['geo'] {
  if (segment.startLat == null || segment.startLng == null) return null;
  const lat = parseFloat(segment.startLat);
  const lng = parseFloat(segment.startLng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

/** Joins the lines worth printing, or null when there is nothing to say. */
function buildDescription(lines: (string | null)[]): string | null {
  const kept = lines.filter((line): line is string => line !== null && line.length > 0);
  return kept.length > 0 ? kept.join('\n') : null;
}

/** UID, stamp, location and coordinates are the same for every event a segment produces. */
function shared(segment: Segment, uidSuffix = ''): Pick<IcsEvent, 'uid' | 'stamp' | 'location' | 'geo'> {
  return {
    uid: `${segment.id}${uidSuffix}@wayfare.app`,
    stamp: segment.updatedAt,
    location: segment.startLocation,
    geo: geoFrom(segment),
  };
}

function flightEvents(segment: Segment): IcsEvent[] {
  const parsed = FlightDetailsSchema.safeParse(segment.details);
  const d = parsed.success ? parsed.data : null;

  return [
    {
      ...shared(segment),
      start: segment.startTime,
      end: segment.endTime,
      summary: d
        ? `${d.airline} ${d.flight_number} → ${d.arrival_airport_code}`
        : `Flight to ${segment.endLocation}`,
      description: d
        ? buildDescription([
            d.confirmation_code ? `Confirmation: ${d.confirmation_code}` : null,
            d.seat ? `Seat: ${d.seat}` : null,
            d.cabin_class ? `Cabin: ${d.cabin_class}` : null,
            d.departure_terminal ? `Departure terminal: ${d.departure_terminal}` : null,
            d.arrival_terminal ? `Arrival terminal: ${d.arrival_terminal}` : null,
          ])
        : null,
    },
  ];
}

function trainEvents(segment: Segment): IcsEvent[] {
  const parsed = TrainDetailsSchema.safeParse(segment.details);
  const d = parsed.success ? parsed.data : null;

  return [
    {
      ...shared(segment),
      start: segment.startTime,
      end: segment.endTime,
      summary: d
        ? `${d.operator} ${d.train_number} → ${d.arrival_station}`
        : `Train to ${segment.endLocation}`,
      description: d
        ? buildDescription([
            d.confirmation_code ? `Confirmation: ${d.confirmation_code}` : null,
            d.coach ? `Coach: ${d.coach}` : null,
            d.seat ? `Seat: ${d.seat}` : null,
            d.travel_class ? `Class: ${d.travel_class}` : null,
          ])
        : null,
    },
  ];
}

function hotelEvents(segment: Segment): IcsEvent[] {
  const parsed = HotelDetailsSchema.safeParse(segment.details);
  const d = parsed.success ? parsed.data : null;
  const name = d ? d.hotel_name : segment.startLocation;
  const description = d
    ? buildDescription([
        d.confirmation_code ? `Confirmation: ${d.confirmation_code}` : null,
        d.room_type ? `Room: ${d.room_type}` : null,
        d.phone ? `Phone: ${d.phone}` : null,
      ])
    : null;

  return [
    {
      ...shared(segment, '-checkin'),
      start: segment.startTime,
      end: addMinutes(segment.startTime, HOTEL_POINT_EVENT_MINUTES),
      summary: `Check in: ${name}`,
      description,
    },
    {
      ...shared(segment, '-checkout'),
      start: segment.endTime,
      end: addMinutes(segment.endTime, HOTEL_POINT_EVENT_MINUTES),
      summary: `Check out: ${name}`,
      description,
    },
  ];
}

function reservationEvents(segment: Segment): IcsEvent[] {
  const parsed = ReservationDetailsSchema.safeParse(segment.details);
  const d = parsed.success ? parsed.data : null;

  return [
    {
      ...shared(segment),
      start: segment.startTime,
      end: segment.endTime,
      summary: d ? d.name : segment.startLocation,
      description: d
        ? buildDescription([
            d.party_size !== null ? `Party of ${d.party_size}` : null,
            d.confirmation_code ? `Confirmation: ${d.confirmation_code}` : null,
            d.phone ? `Phone: ${d.phone}` : null,
            d.notes,
            // The card refuses to render a fabricated time range; the calendar
            // needs a duration, so it discloses the estimate instead of hiding it.
            d.end_is_estimated
              ? 'End time is estimated — the confirmation did not state one.'
              : null,
          ])
        : null,
    },
  ];
}

/**
 * Render-side dispatch, keyed by segment type. Mirrors DaySection's
 * CARD_BY_SEGMENT_TYPE rather than extending BookingTypeHandler, which is keyed
 * by booking type and takes raw extraction JSON. Being a Record over SegmentType
 * makes a new segment type a compile error here until it is mapped.
 */
const EVENT_BY_SEGMENT_TYPE: Record<SegmentType, (segment: Segment) => IcsEvent[]> = {
  flight: flightEvents,
  train_ride: trainEvents,
  hotel_stay: hotelEvents,
  reservation: reservationEvents,
};

export function segmentToEvents(segment: Segment): IcsEvent[] {
  return EVENT_BY_SEGMENT_TYPE[segment.type](segment);
}
