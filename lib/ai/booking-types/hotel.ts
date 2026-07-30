import type Anthropic from '@anthropic-ai/sdk';
import { HotelExtractionSchema, HotelDetailsSchema } from '@/lib/ai/schemas/hotel';
import { hotelSystemPrompt, hotelUserPrompt } from '@/lib/ai/prompts/hotel';
import type { BookingTypeHandler, Coords, GeocodeTargets, SegmentFields } from './types';

export const hotelHandler: BookingTypeHandler = {
  bookingType: 'hotel',
  toolName: 'record_hotel_booking',
  toolDescription: 'Record hotel booking details',
  classifierDescription: 'a hotel booking confirmation',
  systemPrompt: hotelSystemPrompt,
  userPrompt: hotelUserPrompt,

  inputJsonSchema: () =>
    HotelExtractionSchema.toJSONSchema() as Anthropic.Tool['input_schema'],

  validateExtraction: (raw: unknown) => {
    const parsed = HotelExtractionSchema.safeParse(raw);
    return parsed.success ? { ok: true } : { ok: false, error: parsed.error.message };
  },

  // A hotel stay has one location. The job geocodes once when start === end.
  geocodeTargets: (raw: unknown): GeocodeTargets | null => {
    const parsed = HotelExtractionSchema.safeParse(raw);
    if (!parsed.success) return null;
    return { start: parsed.data.address, end: parsed.data.address };
  },

  toSegmentFields: (raw: unknown, coords: Coords): SegmentFields | null => {
    const parsed = HotelExtractionSchema.safeParse(raw);
    if (!parsed.success) return null;
    const data = parsed.data;
    return {
      type: 'hotel_stay',
      startTime: new Date(data.check_in_iso),
      startTimezone: data.timezone,
      endTime: new Date(data.check_out_iso),
      endTimezone: data.timezone,
      startLocation: data.address,
      startLat: coords.startLat,
      startLng: coords.startLng,
      endLocation: data.address,
      endLat: coords.endLat,
      endLng: coords.endLng,
      details: HotelDetailsSchema.parse(data),
    };
  },
};
