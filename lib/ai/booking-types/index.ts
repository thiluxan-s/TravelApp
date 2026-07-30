import { flightHandler } from './flight';
import { hotelHandler } from './hotel';
import { trainHandler } from './train';
import { reservationHandler } from './reservation';
import type { BookingTypeHandler, HandledBookingType } from './types';

export type {
  BookingTypeHandler,
  HandledBookingType,
  Coords,
  GeocodeTargets,
  SegmentFields,
} from './types';

/**
 * The single place that knows which booking types can be parsed.
 * Adding a type means adding a file and one entry here — nothing else changes.
 */
export const bookingTypeHandlers: Record<HandledBookingType, BookingTypeHandler> = {
  flight: flightHandler,
  hotel: hotelHandler,
  train: trainHandler,
  reservation: reservationHandler,
};

export function getBookingTypeHandler(type: string): BookingTypeHandler | null {
  return Object.hasOwn(bookingTypeHandlers, type)
    ? bookingTypeHandlers[type as HandledBookingType]
    : null;
}

/** Built from the registry so the classifier can never fall out of sync with the handlers. */
export function buildClassifierSystemPrompt(): string {
  const options = Object.values(bookingTypeHandlers)
    .map((h) => `- "${h.bookingType}" if it is ${h.classifierDescription}`)
    .join('\n');

  return `You are a document classifier. The user will provide a booking confirmation document. Your task is to identify what kind of booking it is.

Respond with exactly one word — no punctuation, no explanation:
${options}
- "unknown" if you cannot determine the type or it is none of these`;
}

/** e.g. "flights, hotels, trains, or reservations" — built from the registry. */
export function buildSupportedTypesPhrase(): string {
  const labels = Object.values(bookingTypeHandlers).map((h) => h.pluralLabel);
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} or ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, or ${labels[labels.length - 1]}`;
}

export function buildUnidentifiedDocumentMessage(): string {
  return `We couldn't identify this document. We can read ${buildSupportedTypesPhrase()}.`;
}
