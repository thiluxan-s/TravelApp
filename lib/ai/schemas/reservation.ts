import { z } from 'zod';

export const RESERVATION_CATEGORIES = [
  'restaurant',
  'activity',
  'tour',
  'attraction',
  'other',
] as const;

export const ReservationCategorySchema = z.enum(RESERVATION_CATEGORIES);
export type ReservationCategory = z.infer<typeof ReservationCategorySchema>;

/** Used when the document states no end time. See end_is_estimated. */
export const CATEGORY_DEFAULT_DURATION_MINUTES: Record<ReservationCategory, number> = {
  restaurant: 90,
  activity: 120,
  tour: 180,
  attraction: 120,
  other: 60,
};

// Fields common to what the model extracts and what we store.
const ReservationBaseSchema = z.object({
  name: z.string(),
  category: ReservationCategorySchema,
  confirmation_code: z.string().nullable(),
  party_size: z.number().nullable(),
  address: z.string(),
  phone: z.string().nullable(),
  notes: z.string().nullable(),
});

/**
 * What we store. end_is_estimated is derived by the handler, never extracted —
 * the model is not asked whether it guessed.
 */
export const ReservationDetailsSchema = ReservationBaseSchema.extend({
  end_is_estimated: z.boolean(),
});

export type ReservationDetails = z.infer<typeof ReservationDetailsSchema>;

/** What the model returns. end_iso is null when the document states no end time. */
export const ReservationExtractionSchema = ReservationBaseSchema.extend({
  start_iso: z.string(), // ISO 8601 with UTC offset
  end_iso: z.string().nullable(),
  timezone: z.string(), // IANA, e.g. "Asia/Tokyo"
});

export type ReservationExtraction = z.infer<typeof ReservationExtractionSchema>;
