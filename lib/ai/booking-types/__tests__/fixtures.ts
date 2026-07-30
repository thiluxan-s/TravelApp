// Shared sample extractions and geocoded coordinates for booking-type handler tests.
// Keep values byte-identical across handlers.test.ts and registry.test.ts — both
// assert against these same fixtures.

export const validFlight = {
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

export const coords = {
  startLat: '43.677700',
  startLng: '-79.624800',
  endLat: '35.771900',
  endLng: '140.392900',
};

export const validHotel = {
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

export const hotelCoords = {
  startLat: '35.661900',
  startLng: '139.759400',
  endLat: '35.661900',
  endLng: '139.759400',
};

export const validTrain = {
  train_number: 'NZ 21',
  operator: 'JR Central',
  confirmation_code: 'TRN456',
  departure_station: 'Tokyo',
  arrival_station: 'Kyoto',
  coach: '7',
  seat: '11D',
  travel_class: 'Green Car',
  departure_iso: '2026-03-14T09:00:00+09:00',
  departure_timezone: 'Asia/Tokyo',
  arrival_iso: '2026-03-14T11:15:00+09:00',
  arrival_timezone: 'Asia/Tokyo',
  departure_station_label: 'Tokyo Station, Tokyo, Japan',
  arrival_station_label: 'Kyoto Station, Kyoto, Japan',
};

export const validReservation = {
  name: 'Narisawa',
  category: 'restaurant',
  confirmation_code: 'RES999',
  party_size: 2,
  address: '2-6-15 Minami Aoyama, Minato-ku, Tokyo',
  phone: '+81-3-5785-0799',
  notes: 'Counter seating',
  start_iso: '2026-03-12T19:00:00+09:00',
  end_iso: null,
  timezone: 'Asia/Tokyo',
};

export const resCoords = {
  startLat: '35.665500',
  startLng: '139.712400',
  endLat: '35.665500',
  endLng: '139.712400',
};
