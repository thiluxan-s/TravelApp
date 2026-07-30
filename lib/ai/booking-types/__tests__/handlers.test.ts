import { describe, it, expect } from 'vitest';
import { flightHandler } from '../flight';
import { hotelHandler } from '../hotel';

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

  it('reports ok for a valid extraction', () => {
    expect(flightHandler.validateExtraction(validFlight)).toEqual({ ok: true });
  });

  it('reports the validation error for an invalid extraction', () => {
    const result = flightHandler.validateExtraction({ nonsense: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.length).toBeGreaterThan(0);
      expect(result.error).toContain('flight_number');
    }
  });
});

const validHotel = {
  hotel_name: 'Park Hotel Tokyo',
  address: '1-7-1 Higashi-Shimbashi, Minato-ku, Tokyo',
  confirmation_code: 'HTL789',
  room_type: 'Deluxe King',
  guests: 2,
  check_in_time: '15:00',
  check_out_time: '11:00',
  phone: '+81-3-6252-1111',
  check_in_iso: '2026-03-11T15:00:00+09:00',
  check_out_iso: '2026-03-14T11:00:00+09:00',
  timezone: 'Asia/Tokyo',
};

const hotelCoords = {
  startLat: '35.661900',
  startLng: '139.759400',
  endLat: '35.661900',
  endLng: '139.759400',
};

describe('hotelHandler', () => {
  it('declares its booking type, segment type, and tool name', () => {
    expect(hotelHandler.bookingType).toBe('hotel');
    expect(hotelHandler.toolName).toBe('record_hotel_booking');
  });

  it('geocodes the same address for both endpoints', () => {
    const targets = hotelHandler.geocodeTargets(validHotel);
    expect(targets).toEqual({
      start: '1-7-1 Higashi-Shimbashi, Minato-ku, Tokyo',
      end: '1-7-1 Higashi-Shimbashi, Minato-ku, Tokyo',
    });
    expect(targets!.start).toBe(targets!.end);
  });

  it('maps check-in and check-out onto segment start and end', () => {
    const fields = hotelHandler.toSegmentFields(validHotel, hotelCoords);
    expect(fields).not.toBeNull();
    expect(fields!.type).toBe('hotel_stay');
    expect(fields!.startTime).toEqual(new Date('2026-03-11T15:00:00+09:00'));
    expect(fields!.endTime).toEqual(new Date('2026-03-14T11:00:00+09:00'));
    expect(fields!.startTimezone).toBe('Asia/Tokyo');
    expect(fields!.endTimezone).toBe('Asia/Tokyo');
    expect(fields!.startLocation).toBe('1-7-1 Higashi-Shimbashi, Minato-ku, Tokyo');
    expect(fields!.endLocation).toBe('1-7-1 Higashi-Shimbashi, Minato-ku, Tokyo');
  });

  it('strips extraction-only fields out of the stored details', () => {
    const fields = hotelHandler.toSegmentFields(validHotel, hotelCoords);
    expect(fields!.details).toEqual({
      hotel_name: 'Park Hotel Tokyo',
      address: '1-7-1 Higashi-Shimbashi, Minato-ku, Tokyo',
      confirmation_code: 'HTL789',
      room_type: 'Deluxe King',
      guests: 2,
      check_in_time: '15:00',
      check_out_time: '11:00',
      phone: '+81-3-6252-1111',
    });
  });

  it('returns null for data that does not match the schema', () => {
    expect(hotelHandler.geocodeTargets({ nonsense: true })).toBeNull();
    expect(hotelHandler.toSegmentFields({ nonsense: true }, hotelCoords)).toBeNull();
  });

  it('reports ok for a valid extraction', () => {
    expect(hotelHandler.validateExtraction(validHotel)).toEqual({ ok: true });
  });

  it('reports the validation error for an invalid extraction', () => {
    const result = hotelHandler.validateExtraction({ nonsense: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('hotel_name');
    }
  });
});
