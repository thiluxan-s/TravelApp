import { z } from 'zod';

export const FlightDetailsSchema = z.object({
  flight_number: z.string(),
  airline: z.string(),
  confirmation_code: z.string().nullable(),
  departure_airport_code: z.string(),
  arrival_airport_code: z.string(),
  departure_terminal: z.string().nullable(),
  arrival_terminal: z.string().nullable(),
  seat: z.string().nullable(),
  cabin_class: z.string().nullable(),
});

export type FlightDetails = z.infer<typeof FlightDetailsSchema>;

// Full tool output — extends details with fields used in the segments row
export const FlightExtractionSchema = FlightDetailsSchema.extend({
  departure_iso: z.string(),         // ISO 8601 with UTC offset, e.g. "2024-09-01T14:30:00-04:00"
  departure_timezone: z.string(),    // IANA, e.g. "America/Toronto"
  arrival_iso: z.string(),           // ISO 8601 with UTC offset
  arrival_timezone: z.string(),      // IANA, e.g. "Asia/Tokyo"
  departure_airport_label: z.string(), // "Toronto Pearson (YYZ)"
  arrival_airport_label: z.string(),   // "Tokyo Narita (NRT)"
});

export type FlightExtraction = z.infer<typeof FlightExtractionSchema>;
