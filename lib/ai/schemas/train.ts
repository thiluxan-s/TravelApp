import { z } from 'zod';

export const TrainDetailsSchema = z.object({
  train_number: z.string(),
  operator: z.string(),
  confirmation_code: z.string().nullable(),
  departure_station: z.string(),
  arrival_station: z.string(),
  coach: z.string().nullable(),
  seat: z.string().nullable(),
  travel_class: z.string().nullable(),
});

export type TrainDetails = z.infer<typeof TrainDetailsSchema>;

// Full tool output — extends details with fields used in the segments row
export const TrainExtractionSchema = TrainDetailsSchema.extend({
  departure_iso: z.string(),            // ISO 8601 with UTC offset
  departure_timezone: z.string(),       // IANA, e.g. "Asia/Tokyo"
  arrival_iso: z.string(),
  arrival_timezone: z.string(),
  departure_station_label: z.string(),  // geocodable, e.g. "Tokyo Station, Tokyo, Japan"
  arrival_station_label: z.string(),
});

export type TrainExtraction = z.infer<typeof TrainExtractionSchema>;
