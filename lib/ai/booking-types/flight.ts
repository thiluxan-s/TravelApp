import type Anthropic from '@anthropic-ai/sdk';
import { FlightExtractionSchema, FlightDetailsSchema } from '@/lib/ai/schemas/flight';
import { flightSystemPrompt, flightUserPrompt } from '@/lib/ai/prompts/flight';
import type { BookingTypeHandler, Coords, GeocodeTargets, SegmentFields } from './types';

export const flightHandler: BookingTypeHandler = {
  bookingType: 'flight',
  toolName: 'record_flight_booking',
  toolDescription: 'Record flight booking details',
  classifierDescription: 'a flight booking confirmation',
  systemPrompt: flightSystemPrompt,
  userPrompt: flightUserPrompt,

  inputJsonSchema: () =>
    FlightExtractionSchema.toJSONSchema() as Anthropic.Tool['input_schema'],

  validateExtraction: (raw: unknown) => {
    const parsed = FlightExtractionSchema.safeParse(raw);
    return parsed.success ? { ok: true } : { ok: false, error: parsed.error.message };
  },

  geocodeTargets: (raw: unknown): GeocodeTargets | null => {
    const parsed = FlightExtractionSchema.safeParse(raw);
    if (!parsed.success) return null;
    return {
      start: parsed.data.departure_airport_label,
      end: parsed.data.arrival_airport_label,
    };
  },

  toSegmentFields: (raw: unknown, coords: Coords): SegmentFields | null => {
    const parsed = FlightExtractionSchema.safeParse(raw);
    if (!parsed.success) return null;
    const data = parsed.data;
    return {
      type: 'flight',
      startTime: new Date(data.departure_iso),
      startTimezone: data.departure_timezone,
      endTime: new Date(data.arrival_iso),
      endTimezone: data.arrival_timezone,
      startLocation: data.departure_airport_label,
      startLat: coords.startLat,
      startLng: coords.startLng,
      endLocation: data.arrival_airport_label,
      endLat: coords.endLat,
      endLng: coords.endLng,
      details: FlightDetailsSchema.parse(data),
    };
  },
};
