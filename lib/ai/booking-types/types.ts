import type Anthropic from '@anthropic-ai/sdk';
import type { BookingType, SegmentType, NewSegment } from '@/lib/db/schema';

/** Booking types that have a parsing handler. 'unknown' is a classification outcome, not a type we parse. */
export type HandledBookingType = Exclude<BookingType, 'unknown'>;

/** Geocoded coordinates as Drizzle numeric strings, or null when geocoding found nothing. */
export type Coords = {
  startLat: string | null;
  startLng: string | null;
  endLat: string | null;
  endLng: string | null;
};

/** Free-text locations to geocode. When start === end the caller geocodes once and reuses. */
export type GeocodeTargets = { start: string; end: string };

/** Everything needed to create a segment except its foreign keys. */
export type SegmentFields = Omit<NewSegment, 'bookingId' | 'tripId'>;

/**
 * Everything the parse job needs to know about one booking type.
 *
 * Methods take `unknown` rather than a narrowed type on purpose: their input has
 * crossed an Inngest step boundary and arrives as rehydrated JSON. Each handler
 * re-validates with its own Zod schema and narrows internally. They return null
 * rather than throwing so the job can mark the booking failed and stop cleanly.
 */
export type BookingTypeHandler = {
  bookingType: HandledBookingType;
  segmentType: SegmentType;
  /** Anthropic tool name, e.g. 'record_flight_booking'. Must be unique across handlers. */
  toolName: string;
  toolDescription: string;
  /** Phrase describing this document type, used to build the classifier prompt. */
  classifierDescription: string;
  systemPrompt: string;
  userPrompt: (fileName: string) => string;
  /** JSON Schema for the Anthropic tool's input_schema. */
  inputJsonSchema: () => Anthropic.Tool['input_schema'];
  isValidExtraction: (raw: unknown) => boolean;
  geocodeTargets: (raw: unknown) => GeocodeTargets | null;
  toSegmentFields: (raw: unknown, coords: Coords) => SegmentFields | null;
};
