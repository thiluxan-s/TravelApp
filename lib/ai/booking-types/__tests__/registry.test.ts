import { describe, it, expect } from 'vitest';
import {
  bookingTypeHandlers,
  getBookingTypeHandler,
  buildClassifierSystemPrompt,
  buildSupportedTypesPhrase,
  buildUnidentifiedDocumentMessage,
} from '../index';
import { validFlight, validHotel, validTrain, validReservation } from './fixtures';

describe('bookingTypeHandlers', () => {
  it('keys every handler by its own booking type', () => {
    for (const [key, handler] of Object.entries(bookingTypeHandlers)) {
      expect(handler.bookingType).toBe(key);
    }
  });

  it('gives every handler a unique tool name', () => {
    const toolNames = Object.values(bookingTypeHandlers).map((h) => h.toolName);
    expect(new Set(toolNames).size).toBe(toolNames.length);
  });

  it('produces a valid tool input schema for every handler', () => {
    for (const handler of Object.values(bookingTypeHandlers)) {
      expect(handler.inputJsonSchema()).toMatchObject({ type: 'object' });
    }
  });

  it('never accepts an extraction it cannot then map to segment fields', () => {
    // The parse job validates in the extract step and maps in the write step.
    // If those two ever disagree, a booking is marked failed after its raw output
    // was already stored — the write step's failure branch exists only for that.
    const samples: Record<string, unknown> = {
      flight: validFlight,
      hotel: validHotel,
      train: validTrain,
      reservation: validReservation,
    };
    const coordsAllNull = {
      startLat: null,
      startLng: null,
      endLat: null,
      endLng: null,
    };
    for (const [key, handler] of Object.entries(bookingTypeHandlers)) {
      const sample = samples[key];
      expect(sample, `no sample extraction for handler "${key}"`).toBeDefined();
      expect(handler.validateExtraction(sample)).toEqual({ ok: true });
      expect(handler.toSegmentFields(sample, coordsAllNull)).not.toBeNull();
    }
  });

  it('returns identical geocode targets exactly for single-location types', () => {
    // The parse job geocodes once when start === end. A one-location handler that
    // returned two different strings for the same place would silently double
    // Mapbox calls against a metered free tier.
    const singleLocation = new Set(['hotel', 'reservation']);
    const samples: Record<string, unknown> = {
      flight: validFlight,
      hotel: validHotel,
      train: validTrain,
      reservation: validReservation,
    };
    for (const [key, handler] of Object.entries(bookingTypeHandlers)) {
      const targets = handler.geocodeTargets(samples[key]);
      expect(targets).not.toBeNull();
      if (singleLocation.has(key)) {
        expect(targets!.start, `${key} should geocode one location`).toBe(targets!.end);
      } else {
        expect(targets!.start, `${key} should geocode two locations`).not.toBe(targets!.end);
      }
    }
  });
});

describe('getBookingTypeHandler', () => {
  it('resolves a known booking type', () => {
    expect(getBookingTypeHandler('flight')).toBe(bookingTypeHandlers.flight);
    expect(getBookingTypeHandler('hotel')).toBe(bookingTypeHandlers.hotel);
  });

  it('returns null for unknown', () => {
    expect(getBookingTypeHandler('unknown')).toBeNull();
  });

  it('returns null for a string that is not a booking type at all', () => {
    expect(getBookingTypeHandler('spaceship')).toBeNull();
  });
});

describe('buildClassifierSystemPrompt', () => {
  it('lists every registered booking type', () => {
    const prompt = buildClassifierSystemPrompt();
    for (const handler of Object.values(bookingTypeHandlers)) {
      expect(prompt).toContain(`"${handler.bookingType}"`);
      expect(handler.classifierDescription.length).toBeGreaterThan(0);
      expect(prompt).toContain(handler.classifierDescription);
    }
  });

  it('always offers unknown as an option', () => {
    expect(buildClassifierSystemPrompt()).toContain('"unknown"');
  });
});

describe('buildSupportedTypesPhrase', () => {
  it('lists every registered handler by its plural label', () => {
    const phrase = buildSupportedTypesPhrase();
    for (const handler of Object.values(bookingTypeHandlers)) {
      expect(handler.pluralLabel.length).toBeGreaterThan(0);
      expect(phrase).toContain(handler.pluralLabel);
    }
  });

  it('joins the last item with "or"', () => {
    expect(buildSupportedTypesPhrase()).toMatch(/, or |^\w+ or /);
  });
});

describe('buildUnidentifiedDocumentMessage', () => {
  it('names the supported types', () => {
    const message = buildUnidentifiedDocumentMessage();
    expect(message).toContain(buildSupportedTypesPhrase());
  });

  it('does not hardcode a type list', () => {
    expect(buildUnidentifiedDocumentMessage()).not.toContain('flight or hotel');
  });
});
