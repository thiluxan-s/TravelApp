import { describe, it, expect } from 'vitest';
import { flightHandler } from '../flight';
import { hotelHandler } from '../hotel';
import { trainHandler } from '../train';
import { reservationHandler } from '../reservation';
import {
  validFlight,
  coords,
  validHotel,
  hotelCoords,
  validTrain,
  validReservation,
  resCoords,
} from './fixtures';

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

describe('trainHandler', () => {
  it('declares its booking type and tool name', () => {
    expect(trainHandler.bookingType).toBe('train');
    expect(trainHandler.toolName).toBe('record_train_booking');
  });

  it('geocodes the departure and arrival station labels', () => {
    expect(trainHandler.geocodeTargets(validTrain)).toEqual({
      start: 'Tokyo Station, Tokyo, Japan',
      end: 'Kyoto Station, Kyoto, Japan',
    });
  });

  it('maps extraction and coordinates onto segment fields', () => {
    const fields = trainHandler.toSegmentFields(validTrain, coords);
    expect(fields).not.toBeNull();
    expect(fields!.type).toBe('train_ride');
    expect(fields!.startTime).toEqual(new Date('2026-03-14T09:00:00+09:00'));
    expect(fields!.endTime).toEqual(new Date('2026-03-14T11:15:00+09:00'));
    expect(fields!.startTimezone).toBe('Asia/Tokyo');
    expect(fields!.startLocation).toBe('Tokyo Station, Tokyo, Japan');
    expect(fields!.endLocation).toBe('Kyoto Station, Kyoto, Japan');
  });

  it('strips extraction-only fields out of the stored details', () => {
    const fields = trainHandler.toSegmentFields(validTrain, coords);
    expect(fields!.details).toEqual({
      train_number: 'NZ 21',
      operator: 'JR Central',
      confirmation_code: 'TRN456',
      departure_station: 'Tokyo',
      arrival_station: 'Kyoto',
      coach: '7',
      seat: '11D',
      travel_class: 'Green Car',
    });
  });

  it('returns null for data that does not match the schema', () => {
    expect(trainHandler.geocodeTargets({ nonsense: true })).toBeNull();
    expect(trainHandler.toSegmentFields({ nonsense: true }, coords)).toBeNull();
    const validation = trainHandler.validateExtraction({ nonsense: true });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.error).toContain('train_number');
    }
  });

  it('reports ok for a valid extraction', () => {
    expect(trainHandler.validateExtraction(validTrain)).toEqual({ ok: true });
  });
});

describe('reservationHandler', () => {
  it('declares its booking type and tool name', () => {
    expect(reservationHandler.bookingType).toBe('reservation');
    expect(reservationHandler.toolName).toBe('record_reservation_booking');
  });

  it('geocodes the same address for both endpoints', () => {
    const targets = reservationHandler.geocodeTargets(validReservation);
    expect(targets!.start).toBe('2-6-15 Minami Aoyama, Minato-ku, Tokyo');
    expect(targets!.start).toBe(targets!.end);
  });

  it('uses the explicit end time when the document states one', () => {
    const withEnd = { ...validReservation, end_iso: '2026-03-12T21:30:00+09:00' };
    const fields = reservationHandler.toSegmentFields(withEnd, resCoords);
    expect(fields!.endTime).toEqual(new Date('2026-03-12T21:30:00+09:00'));
  });

  it('marks an explicit end time as not estimated', () => {
    const withEnd = { ...validReservation, end_iso: '2026-03-12T21:30:00+09:00' };
    const fields = reservationHandler.toSegmentFields(withEnd, resCoords);
    expect(fields!.details).toMatchObject({ end_is_estimated: false });
  });

  it('derives a 90 minute end for a restaurant with no stated end', () => {
    const fields = reservationHandler.toSegmentFields(validReservation, resCoords);
    expect(fields!.endTime).toEqual(new Date('2026-03-12T20:30:00+09:00'));
  });

  it('derives a 3 hour end for a tour with no stated end', () => {
    const tour = { ...validReservation, category: 'tour' };
    const fields = reservationHandler.toSegmentFields(tour, resCoords);
    expect(fields!.endTime).toEqual(new Date('2026-03-12T22:00:00+09:00'));
  });

  it('marks a derived end time as estimated', () => {
    const fields = reservationHandler.toSegmentFields(validReservation, resCoords);
    expect(fields!.details).toMatchObject({ end_is_estimated: true });
  });

  it('maps the single location onto both segment endpoints', () => {
    const fields = reservationHandler.toSegmentFields(validReservation, resCoords);
    expect(fields!.type).toBe('reservation');
    expect(fields!.startTime).toEqual(new Date('2026-03-12T19:00:00+09:00'));
    expect(fields!.startTimezone).toBe('Asia/Tokyo');
    expect(fields!.endTimezone).toBe('Asia/Tokyo');
    expect(fields!.startLocation).toBe('2-6-15 Minami Aoyama, Minato-ku, Tokyo');
    expect(fields!.endLocation).toBe('2-6-15 Minami Aoyama, Minato-ku, Tokyo');
  });

  it('keeps extraction-only fields out of the stored details', () => {
    const fields = reservationHandler.toSegmentFields(validReservation, resCoords);
    const details = fields!.details as Record<string, unknown>;
    expect(details).not.toHaveProperty('start_iso');
    expect(details).not.toHaveProperty('end_iso');
    expect(details).not.toHaveProperty('timezone');
    expect(details).toMatchObject({
      name: 'Narisawa',
      category: 'restaurant',
      party_size: 2,
    });
  });

  it('rejects a category outside the allowed set', () => {
    const bad = { ...validReservation, category: 'spaceflight' };
    expect(reservationHandler.validateExtraction(bad).ok).toBe(false);
    expect(reservationHandler.toSegmentFields(bad, resCoords)).toBeNull();
  });

  it('reports ok for a valid extraction', () => {
    expect(reservationHandler.validateExtraction(validReservation)).toEqual({ ok: true });
  });
});
