import type Anthropic from '@anthropic-ai/sdk';
import {
  ReservationExtractionSchema,
  ReservationDetailsSchema,
  CATEGORY_DEFAULT_DURATION_MINUTES,
} from '@/lib/ai/schemas/reservation';
import { reservationSystemPrompt, reservationUserPrompt } from '@/lib/ai/prompts/reservation';
import type { BookingTypeHandler, Coords, GeocodeTargets, SegmentFields } from './types';

export const reservationHandler: BookingTypeHandler = {
  bookingType: 'reservation',
  toolName: 'record_reservation_booking',
  toolDescription: 'Record reservation details',
  classifierDescription:
    'a reservation confirmation for a restaurant, tour, activity, or attraction',
  pluralLabel: 'reservations',
  systemPrompt: reservationSystemPrompt,
  userPrompt: reservationUserPrompt,

  inputJsonSchema: () =>
    ReservationExtractionSchema.toJSONSchema() as Anthropic.Tool['input_schema'],

  validateExtraction: (raw: unknown) => {
    const parsed = ReservationExtractionSchema.safeParse(raw);
    return parsed.success ? { ok: true } : { ok: false, error: parsed.error.message };
  },

  // A reservation has one location. The job geocodes once when start === end.
  geocodeTargets: (raw: unknown): GeocodeTargets | null => {
    const parsed = ReservationExtractionSchema.safeParse(raw);
    if (!parsed.success) return null;
    return { start: parsed.data.address, end: parsed.data.address };
  },

  toSegmentFields: (raw: unknown, coords: Coords): SegmentFields | null => {
    const parsed = ReservationExtractionSchema.safeParse(raw);
    if (!parsed.success) return null;
    const data = parsed.data;

    const startTime = new Date(data.start_iso);
    // The document rarely states an end. Derive one so gap and distance
    // annotations have something honest to measure from, and record that we did.
    const endIsEstimated = data.end_iso === null;
    const endTime =
      data.end_iso === null
        ? new Date(
            startTime.getTime() + CATEGORY_DEFAULT_DURATION_MINUTES[data.category] * 60_000,
          )
        : new Date(data.end_iso);

    return {
      type: 'reservation',
      startTime,
      startTimezone: data.timezone,
      endTime,
      endTimezone: data.timezone,
      startLocation: data.address,
      startLat: coords.startLat,
      startLng: coords.startLng,
      endLocation: data.address,
      endLat: coords.endLat,
      endLng: coords.endLng,
      details: ReservationDetailsSchema.parse({ ...data, end_is_estimated: endIsEstimated }),
    };
  },
};
