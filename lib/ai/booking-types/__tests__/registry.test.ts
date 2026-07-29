import { describe, it, expect } from 'vitest';
import {
  bookingTypeHandlers,
  getBookingTypeHandler,
  buildClassifierSystemPrompt,
} from '../index';

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
      expect(prompt).toContain(handler.classifierDescription);
    }
  });

  it('always offers unknown as an option', () => {
    expect(buildClassifierSystemPrompt()).toContain('"unknown"');
  });
});
