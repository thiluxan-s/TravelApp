import type Anthropic from '@anthropic-ai/sdk';
import { TrainExtractionSchema, TrainDetailsSchema } from '@/lib/ai/schemas/train';
import { trainSystemPrompt, trainUserPrompt } from '@/lib/ai/prompts/train';
import type { BookingTypeHandler, Coords, GeocodeTargets, SegmentFields } from './types';

export const trainHandler: BookingTypeHandler = {
  bookingType: 'train',
  toolName: 'record_train_booking',
  toolDescription: 'Record train booking details',
  classifierDescription: 'a train or rail booking confirmation',
  pluralLabel: 'trains',
  systemPrompt: trainSystemPrompt,
  userPrompt: trainUserPrompt,

  inputJsonSchema: () =>
    TrainExtractionSchema.toJSONSchema() as Anthropic.Tool['input_schema'],

  validateExtraction: (raw: unknown) => {
    const parsed = TrainExtractionSchema.safeParse(raw);
    return parsed.success ? { ok: true } : { ok: false, error: parsed.error.message };
  },

  geocodeTargets: (raw: unknown): GeocodeTargets | null => {
    const parsed = TrainExtractionSchema.safeParse(raw);
    if (!parsed.success) return null;
    return {
      start: parsed.data.departure_station_label,
      end: parsed.data.arrival_station_label,
    };
  },

  toSegmentFields: (raw: unknown, coords: Coords): SegmentFields | null => {
    const parsed = TrainExtractionSchema.safeParse(raw);
    if (!parsed.success) return null;
    const data = parsed.data;
    return {
      type: 'train_ride',
      startTime: new Date(data.departure_iso),
      startTimezone: data.departure_timezone,
      endTime: new Date(data.arrival_iso),
      endTimezone: data.arrival_timezone,
      startLocation: data.departure_station_label,
      startLat: coords.startLat,
      startLng: coords.startLng,
      endLocation: data.arrival_station_label,
      endLat: coords.endLat,
      endLng: coords.endLng,
      details: TrainDetailsSchema.parse(data),
    };
  },
};
