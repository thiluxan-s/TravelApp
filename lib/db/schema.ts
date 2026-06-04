import {
  pgTable,
  uuid,
  text,
  timestamp,
  date,
  integer,
  jsonb,
  pgEnum,
  index,
  numeric,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ─── Enums ───────────────────────────────────────────────────────────────────

export const bookingTypeEnum = pgEnum('booking_type', ['flight', 'hotel', 'unknown']);
export const bookingStatusEnum = pgEnum('booking_status', [
  'uploading',
  'parsing',
  'parsed',
  'parsing_failed',
]);
export const segmentTypeEnum = pgEnum('segment_type', ['flight', 'hotel_stay']);

// ─── Tables ──────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkUserId: text('clerk_user_id').notNull().unique(),
  email: text('email').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const trips = pgTable(
  'trips',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    destination: text('destination'),
    startDate: date('start_date'),
    endDate: date('end_date'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('trips_user_id_idx').on(table.userId)],
);

export const bookings = pgTable(
  'bookings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    type: bookingTypeEnum('type').notNull().default('unknown'),
    status: bookingStatusEnum('status').notNull(),
    fileKey: text('file_key').notNull(),
    fileName: text('file_name').notNull(),
    fileSizeBytes: integer('file_size_bytes').notNull(),
    mimeType: text('mime_type').notNull(),
    parseError: text('parse_error'),
    rawAiOutput: jsonb('raw_ai_output'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('bookings_trip_id_idx').on(table.tripId)],
);

export const segments = pgTable(
  'segments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    type: segmentTypeEnum('type').notNull(),
    startTime: timestamp('start_time', { withTimezone: true }).notNull(),
    startTimezone: text('start_timezone').notNull(),
    endTime: timestamp('end_time', { withTimezone: true }).notNull(),
    endTimezone: text('end_timezone').notNull(),
    startLocation: text('start_location').notNull(),
    startLat: numeric('start_lat', { precision: 9, scale: 6 }),
    startLng: numeric('start_lng', { precision: 9, scale: 6 }),
    endLocation: text('end_location').notNull(),
    endLat: numeric('end_lat', { precision: 9, scale: 6 }),
    endLng: numeric('end_lng', { precision: 9, scale: 6 }),
    details: jsonb('details').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('segments_booking_id_idx').on(table.bookingId),
    index('segments_trip_id_idx').on(table.tripId),
    index('segments_trip_id_start_time_idx').on(table.tripId, table.startTime),
  ],
);

// ─── Relations ───────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  trips: many(trips),
}));

export const tripsRelations = relations(trips, ({ one, many }) => ({
  user: one(users, { fields: [trips.userId], references: [users.id] }),
  bookings: many(bookings),
  segments: many(segments),
}));

export const bookingsRelations = relations(bookings, ({ one, many }) => ({
  trip: one(trips, { fields: [bookings.tripId], references: [trips.id] }),
  segments: many(segments),
}));

export const segmentsRelations = relations(segments, ({ one }) => ({
  booking: one(bookings, { fields: [segments.bookingId], references: [bookings.id] }),
  trip: one(trips, { fields: [segments.tripId], references: [trips.id] }),
}));

// ─── Inferred types ──────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Trip = typeof trips.$inferSelect;
export type NewTrip = typeof trips.$inferInsert;

export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;
export type BookingStatus = Booking['status'];
export type BookingType = Booking['type'];

export type Segment = typeof segments.$inferSelect;
export type NewSegment = typeof segments.$inferInsert;
export type SegmentType = Segment['type'];
