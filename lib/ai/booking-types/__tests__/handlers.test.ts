import { describe, it, expect } from 'vitest';
import { flightHandler } from '../flight';

const validFlight = {
  flight_number: 'AC001',
  airline: 'Air Canada',
  confirmation_code: 'ABC123',
  departure_airport_code: 'YYZ',
  arrival_airport_code: 'NRT',
  departure_terminal: '1',
  arrival_terminal: '2',
  seat: '14A',
  cabin_class: 'Economy',
  departure_iso: '2026-03-10T13:30:00-04:00',
  departure_timezone: 'America/Toronto',
  arrival_iso: '2026-03-11T16:20:00+09:00',
  arrival_timezone: 'Asia/Tokyo',
  departure_airport_label: 'Toronto Pearson (YYZ)',
  arrival_airport_label: 'Tokyo Narita (NRT)',
};

const coords = {
  startLat: '43.677700',
  startLng: '-79.624800',
  endLat: '35.771900',
  endLng: '140.392900',
};

describe('flightHandler', () => {
  it('declares its booking type, segment type, and tool name', () => {
    expect(flightHandler.bookingType).toBe('flight');
    expect(flightHandler.segmentType).toBe('flight');
    expect(flightHandler.toolName).toBe('record_flight_booking');
  });

  it('geocodes the departure and arrival airport labels', () => {
    expect(flightHandler.geocodeTargets(validFlight)).toEqual({
      start: 'Toronto Pearson (YYZ)',
      end: 'Tokyo Narita (NRT)',
    });
  });

  it('returns null geocode targets for data that does not match the schema', () => {
    expect(flightHandler.geocodeTargets({ nonsense: true })).toBeNull();
  });

  it('maps extraction and coordinates onto segment fields', () => {
    const fields = flightHandler.toSegmentFields(validFlight, coords);
    expect(fields).not.toBeNull();
    expect(fields!.type).toBe('flight');
    expect(fields!.startTime).toEqual(new Date('2026-03-10T13:30:00-04:00'));
    expect(fields!.endTime).toEqual(new Date('2026-03-11T16:20:00+09:00'));
    expect(fields!.startTimezone).toBe('America/Toronto');
    expect(fields!.endTimezone).toBe('Asia/Tokyo');
    expect(fields!.startLocation).toBe('Toronto Pearson (YYZ)');
    expect(fields!.endLocation).toBe('Tokyo Narita (NRT)');
    expect(fields!.startLat).toBe('43.677700');
    expect(fields!.endLng).toBe('140.392900');
  });

  it('strips extraction-only fields out of the stored details', () => {
    const fields = flightHandler.toSegmentFields(validFlight, coords);
    expect(fields!.details).toEqual({
      flight_number: 'AC001',
      airline: 'Air Canada',
      confirmation_code: 'ABC123',
      departure_airport_code: 'YYZ',
      arrival_airport_code: 'NRT',
      departure_terminal: '1',
      arrival_terminal: '2',
      seat: '14A',
      cabin_class: 'Economy',
    });
  });

  it('returns null segment fields for data that does not match the schema', () => {
    expect(flightHandler.toSegmentFields({ nonsense: true }, coords)).toBeNull();
  });

  it('validates raw tool input', () => {
    expect(flightHandler.isValidExtraction(validFlight)).toBe(true);
    expect(flightHandler.isValidExtraction({ nonsense: true })).toBe(false);
  });
});
