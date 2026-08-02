import { describe, it, expect } from 'vitest';
import { segmentToEvents } from '../to-ics';
import { makeSegment } from './helpers';

const flight = () =>
  makeSegment({
    id: 'seg-flight',
    type: 'flight',
    startTime: new Date('2026-03-10T12:00:00Z'),
    endTime: new Date('2026-03-11T05:00:00Z'),
    startLocation: 'Toronto Pearson (YYZ)',
    endLocation: 'Tokyo Narita (NRT)',
    startLat: '43.677700',
    startLng: '-79.624800',
    updatedAt: new Date('2026-02-01T00:00:00Z'),
    details: {
      flight_number: 'NH6',
      airline: 'ANA',
      confirmation_code: 'ABC123',
      departure_airport_code: 'YYZ',
      arrival_airport_code: 'NRT',
      departure_terminal: '1',
      arrival_terminal: null,
      seat: '32A',
      cabin_class: 'Economy',
    },
  });

const hotel = () =>
  makeSegment({
    id: 'seg-hotel',
    type: 'hotel_stay',
    startTime: new Date('2026-03-11T06:00:00Z'),
    endTime: new Date('2026-03-14T02:00:00Z'),
    startLocation: '3-7-1-2 Nishi Shinjuku, Tokyo',
    updatedAt: new Date('2026-02-01T00:00:00Z'),
    details: {
      hotel_name: 'Park Hyatt Tokyo',
      address: '3-7-1-2 Nishi Shinjuku, Tokyo',
      confirmation_code: 'HYT99',
      room_type: 'Park King',
      guests: 2,
      check_in_time: '15:00',
      check_out_time: '11:00',
      phone: '+81 3 5322 1234',
    },
  });

const reservation = (endIsEstimated: boolean) =>
  makeSegment({
    id: 'seg-dinner',
    type: 'reservation',
    startTime: new Date('2026-03-11T10:00:00Z'),
    endTime: new Date('2026-03-11T11:30:00Z'),
    startLocation: '2-6-15 Minami Aoyama, Tokyo',
    updatedAt: new Date('2026-02-01T00:00:00Z'),
    details: {
      name: 'Narisawa',
      category: 'restaurant',
      confirmation_code: null,
      party_size: 2,
      address: '2-6-15 Minami Aoyama, Tokyo',
      phone: null,
      notes: null,
      end_is_estimated: endIsEstimated,
    },
  });

const train = () =>
  makeSegment({
    id: 'seg-train',
    type: 'train_ride',
    startTime: new Date('2026-03-13T00:00:00Z'),
    endTime: new Date('2026-03-13T02:15:00Z'),
    startLocation: 'Tokyo Station, Tokyo',
    endLocation: 'Kyoto Station, Kyoto',
    updatedAt: new Date('2026-02-01T00:00:00Z'),
    details: {
      train_number: '703',
      operator: 'JR Central',
      confirmation_code: 'JR77',
      departure_station: 'Tokyo',
      arrival_station: 'Kyoto',
      coach: '8',
      seat: '11A',
      travel_class: 'Green',
    },
  });

describe('segmentToEvents', () => {
  it('maps a flight to one event spanning departure to arrival', () => {
    const [event, ...rest] = segmentToEvents(flight());
    expect(rest).toHaveLength(0);
    expect(event.summary).toBe('ANA NH6 → NRT');
    expect(event.start).toEqual(new Date('2026-03-10T12:00:00Z'));
    expect(event.end).toEqual(new Date('2026-03-11T05:00:00Z'));
    expect(event.uid).toBe('seg-flight@wayfare.app');
  });

  it('puts the confirmation code and seat in a flight description', () => {
    const [event] = segmentToEvents(flight());
    expect(event.description).toContain('ABC123');
    expect(event.description).toContain('32A');
  });

  it('omits a null detail rather than printing it', () => {
    const [event] = segmentToEvents(flight());
    // arrival_terminal is null on this fixture.
    expect(event.description).not.toContain('Arrival terminal');
  });

  it('maps a train to one event', () => {
    const [event, ...rest] = segmentToEvents(train());
    expect(rest).toHaveLength(0);
    expect(event.summary).toBe('JR Central 703 → Kyoto');
    expect(event.uid).toBe('seg-train@wayfare.app');
  });

  it('maps a hotel to two point events with distinct UIDs', () => {
    const events = segmentToEvents(hotel());
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.uid)).toEqual([
      'seg-hotel-checkin@wayfare.app',
      'seg-hotel-checkout@wayfare.app',
    ]);
    expect(events.map((e) => e.summary)).toEqual([
      'Check in: Park Hyatt Tokyo',
      'Check out: Park Hyatt Tokyo',
    ]);
  });

  it('gives hotel point events a 30 minute duration, not zero length', () => {
    const [checkIn, checkOut] = segmentToEvents(hotel());
    expect(checkIn.start).toEqual(new Date('2026-03-11T06:00:00Z'));
    expect(checkIn.end).toEqual(new Date('2026-03-11T06:30:00Z'));
    expect(checkOut.start).toEqual(new Date('2026-03-14T02:00:00Z'));
    expect(checkOut.end).toEqual(new Date('2026-03-14T02:30:00Z'));
  });

  it('maps a reservation to one event named after the venue', () => {
    const [event, ...rest] = segmentToEvents(reservation(false));
    expect(rest).toHaveLength(0);
    expect(event.summary).toBe('Narisawa');
    expect(event.description).toContain('Party of 2');
  });

  it('notes an estimated end in the reservation description', () => {
    const [event] = segmentToEvents(reservation(true));
    expect(event.description).toContain('End time is estimated');
  });

  it('says nothing about estimation when the end was explicit', () => {
    const [event] = segmentToEvents(reservation(false));
    expect(event.description ?? '').not.toContain('estimated');
  });

  it('carries GEO when both coordinates are present', () => {
    const [event] = segmentToEvents(flight());
    expect(event.geo).toEqual({ lat: 43.6777, lng: -79.6248 });
  });

  it('omits GEO when coordinates are missing', () => {
    const [event] = segmentToEvents(train());
    expect(event.geo).toBeNull();
  });

  it('uses the segment updatedAt as the stamp so exports are reproducible', () => {
    const [event] = segmentToEvents(flight());
    expect(event.stamp).toEqual(new Date('2026-02-01T00:00:00Z'));
  });

  it('falls back to the location when details cannot be parsed', () => {
    // A partially useful event beats a missing one — same principle as LodgingFooter.
    const broken = makeSegment({
      id: 'seg-broken',
      type: 'flight',
      startLocation: 'Toronto Pearson (YYZ)',
      endLocation: 'Tokyo Narita (NRT)',
      details: { unexpected: 'shape' },
    });
    const [event] = segmentToEvents(broken);
    expect(event.summary).toBe('Flight to Tokyo Narita (NRT)');
    expect(event.description).toBeNull();
  });
});
