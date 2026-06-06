import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { eq } from 'drizzle-orm';
import {
  users,
  trips,
  bookings,
  segments,
} from '../lib/db/schema';
import * as schema from '../lib/db/schema';

const DEMO_TRIP_ID = '3a4b5c6d-7e8f-4a1b-8c2d-9e0f1a2b3c4d';
const DEMO_CLERK_ID = 'user_demo';

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

async function seed() {
  // ── 1. Upsert demo user ─────────────────────────────────────────────────────
  await db
    .insert(users)
    .values({ clerkUserId: DEMO_CLERK_ID, email: 'demo@wayfare.app' })
    .onConflictDoNothing();

  const demoUser = await db.query.users.findFirst({
    where: eq(users.clerkUserId, DEMO_CLERK_ID),
  });
  if (!demoUser) throw new Error('Failed to get/create demo user');

  // ── 2. Skip if already seeded ───────────────────────────────────────────────
  const existingTrip = await db.query.trips.findFirst({
    where: eq(trips.id, DEMO_TRIP_ID),
  });
  if (existingTrip) {
    console.log('✓ Demo data already seeded. Trip ID:', DEMO_TRIP_ID);
    process.exit(0);
  }

  // ── 3. Trip ──────────────────────────────────────────────────────────────────
  await db.insert(trips).values({
    id: DEMO_TRIP_ID,
    userId: demoUser.id,
    title: 'Tokyo · March 2026',
    destination: 'Tokyo, Japan',
  });

  // ── 4. Outbound flight YYZ → NRT ─────────────────────────────────────────────
  const [outboundBooking] = await db
    .insert(bookings)
    .values({
      tripId: DEMO_TRIP_ID,
      type: 'flight',
      status: 'parsed',
      fileKey: 'demo/outbound-flight.pdf',
      fileName: 'outbound-flight.pdf',
      fileSizeBytes: 102400,
      mimeType: 'application/pdf',
    })
    .returning();

  if (!outboundBooking) throw new Error('Failed to insert outbound flight booking');

  await db.insert(segments).values({
    bookingId: outboundBooking.id,
    tripId: DEMO_TRIP_ID,
    type: 'flight',
    startTime: new Date('2026-03-10T14:00:00-04:00'),
    startTimezone: 'America/Toronto',
    endTime: new Date('2026-03-11T18:00:00+09:00'),
    endTimezone: 'Asia/Tokyo',
    startLocation: 'Toronto Pearson (YYZ)',
    startLat: '43.677700',
    startLng: '-79.624800',
    endLocation: 'Tokyo Narita (NRT)',
    endLat: '35.772000',
    endLng: '140.392900',
    details: {
      flight_number: 'AC001',
      airline: 'Air Canada',
      confirmation_code: 'ABC123',
      departure_airport_code: 'YYZ',
      arrival_airport_code: 'NRT',
      departure_terminal: '1',
      arrival_terminal: '3',
      seat: '42A',
      cabin_class: 'Economy',
    },
  });

  // ── 5. Hotel ──────────────────────────────────────────────────────────────────
  const [hotelBooking] = await db
    .insert(bookings)
    .values({
      tripId: DEMO_TRIP_ID,
      type: 'hotel',
      status: 'parsed',
      fileKey: 'demo/hotel.pdf',
      fileName: 'hotel.pdf',
      fileSizeBytes: 89600,
      mimeType: 'application/pdf',
    })
    .returning();

  if (!hotelBooking) throw new Error('Failed to insert hotel booking');

  await db.insert(segments).values({
    bookingId: hotelBooking.id,
    tripId: DEMO_TRIP_ID,
    type: 'hotel_stay',
    startTime: new Date('2026-03-11T18:00:00+09:00'),
    startTimezone: 'Asia/Tokyo',
    endTime: new Date('2026-03-14T11:00:00+09:00'),
    endTimezone: 'Asia/Tokyo',
    startLocation: 'Park Hyatt Tokyo',
    startLat: '35.689600',
    startLng: '139.691700',
    endLocation: 'Park Hyatt Tokyo',
    endLat: '35.689600',
    endLng: '139.691700',
    details: {
      hotel_name: 'Park Hyatt Tokyo',
      address: '3-7-1-2 Nishi Shinjuku, Shinjuku-ku, Tokyo 163-1055',
      confirmation_code: 'HTL456789',
      room_type: 'Park Deluxe Room',
      guests: 1,
      check_in_time: '15:00',
      check_out_time: '12:00',
      phone: '+81-3-5322-1234',
    },
  });

  // ── 6. Return flight NRT → YYZ ────────────────────────────────────────────────
  const [returnBooking] = await db
    .insert(bookings)
    .values({
      tripId: DEMO_TRIP_ID,
      type: 'flight',
      status: 'parsed',
      fileKey: 'demo/return-flight.pdf',
      fileName: 'return-flight.pdf',
      fileSizeBytes: 98304,
      mimeType: 'application/pdf',
    })
    .returning();

  if (!returnBooking) throw new Error('Failed to insert return flight booking');

  await db.insert(segments).values({
    bookingId: returnBooking.id,
    tripId: DEMO_TRIP_ID,
    type: 'flight',
    startTime: new Date('2026-03-14T17:00:00+09:00'),
    startTimezone: 'Asia/Tokyo',
    endTime: new Date('2026-03-14T15:00:00-04:00'),
    endTimezone: 'America/Toronto',
    startLocation: 'Tokyo Narita (NRT)',
    startLat: '35.772000',
    startLng: '140.392900',
    endLocation: 'Toronto Pearson (YYZ)',
    endLat: '43.677700',
    endLng: '-79.624800',
    details: {
      flight_number: 'AC002',
      airline: 'Air Canada',
      confirmation_code: 'DEF456',
      departure_airport_code: 'NRT',
      arrival_airport_code: 'YYZ',
      departure_terminal: '1',
      arrival_terminal: '1',
      seat: '38C',
      cabin_class: 'Economy',
    },
  });

  console.log('✓ Demo data seeded successfully!');
  console.log('  Trip ID:', DEMO_TRIP_ID);
  console.log('  Set DEMO_TRIP_ID=' + DEMO_TRIP_ID + ' in .env.local and Vercel.');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
