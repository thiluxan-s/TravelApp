import { z } from 'zod';

export const HotelDetailsSchema = z.object({
  hotel_name: z.string(),
  address: z.string(),
  confirmation_code: z.string().nullable(),
  room_type: z.string().nullable(),
  guests: z.number().nullable(),
  check_in_time: z.string().nullable(),   // "15:00"
  check_out_time: z.string().nullable(),  // "11:00"
  phone: z.string().nullable(),
});

export type HotelDetails = z.infer<typeof HotelDetailsSchema>;

// Full tool output — extends details with fields used in the segments row
export const HotelExtractionSchema = HotelDetailsSchema.extend({
  check_in_iso: z.string(),   // ISO 8601 with UTC offset, e.g. "2024-09-02T15:00:00+09:00"
  check_out_iso: z.string(),  // ISO 8601 with UTC offset
  timezone: z.string(),       // IANA, e.g. "Asia/Tokyo"
});

export type HotelExtraction = z.infer<typeof HotelExtractionSchema>;
