# Phase 3 — AI Parsing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Inngest background jobs that parse uploaded booking PDFs via Claude vision into structured segment data, geocode the locations via Mapbox, and write everything to the DB — so the trip page shows real parsed data instead of the "Parsing with AI…" placeholder.

**Architecture:** A 4-step Inngest function triggered by `booking/uploaded` runs classify → extract → geocode → write. Each Inngest step is independently cached/retried — a retry resumes from the failed step only. Claude Haiku classifies the document type; Claude Sonnet extracts structured data via `tool_use`; Mapbox geocodes the locations via a REST fetch. All AI output is Zod-validated before touching the DB.

**Tech Stack:** `inngest` (background job orchestration), `@anthropic-ai/sdk` (claude-haiku-4-5-20251001 for classify, claude-sonnet-4-6 for extraction), Mapbox Geocoding REST API v5 (fetch — no SDK needed), `zod-to-json-schema` (Zod → JSON schema for Anthropic tool definitions), Drizzle ORM (new `segments` table + migration)

---

## File Map

### New files
| Path | Purpose |
|------|---------|
| `lib/ai/client.ts` | Anthropic SDK singleton |
| `lib/ai/schemas/flight.ts` | `FlightExtractionSchema` (full tool output) + `FlightDetailsSchema` (JSONB subset) |
| `lib/ai/schemas/hotel.ts` | `HotelExtractionSchema` (full tool output) + `HotelDetailsSchema` (JSONB subset) |
| `lib/ai/prompts/classifier.ts` | System prompt + user template for classification |
| `lib/ai/prompts/flight.ts` | System prompt + user template for flight extraction |
| `lib/ai/prompts/hotel.ts` | System prompt + user template for hotel extraction |
| `lib/mapbox/client.ts` | `geocode(query)` → `{ lat, lng } \| null` |
| `lib/inngest/client.ts` | Inngest client singleton |
| `lib/inngest/functions/parse-booking.ts` | The 4-step parsing function |
| `app/api/inngest/route.ts` | Next.js route handler serving Inngest functions |
| `lib/db/repositories/segments.ts` | `createSegment`, `getSegmentsByBookingId`, `segmentExistsForBooking` |

### Modified files
| Path | Change |
|------|--------|
| `lib/db/schema.ts` | Add `segmentTypeEnum` + `segments` table + `bookings → segments` relation |
| `lib/env.server.ts` | Add `ANTHROPIC_API_KEY`, `MAPBOX_SECRET_TOKEN`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` |
| `lib/r2/index.ts` | Add `getPresignedGetUrl` |
| `lib/db/repositories/bookings.ts` | Add `updateBooking(id, data)` partial update helper |
| `lib/db/repositories/trips.ts` | Extend `getTripWithBookings` to include segments |
| `app/(app)/trips/[tripId]/actions.ts` | Replace placeholder comment with real `inngest.send()` call |
| `components/trips/TripDetailClient.tsx` | Pass `booking.segments[0]` to `BookingCard` |
| `components/trips/BookingCard.tsx` | Render flight/hotel segment data in `parsed` state |
| `.env.example` | Document the four new env vars |

---

### Task 1: Create branch and install packages

**Files:** none (git + npm only)

- [ ] **Step 1: Create the feature branch**

```bash
git checkout -b phase-3-ai-parsing
```

- [ ] **Step 2: Install packages**

```bash
npm install inngest @anthropic-ai/sdk zod-to-json-schema
```

`zod-to-json-schema` ships its own types — no `@types/` package needed.

- [ ] **Step 3: Verify typecheck still passes**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install inngest, @anthropic-ai/sdk, and zod-to-json-schema"
```

---

### Task 2: Add environment variables

**Files:**
- Modify: `lib/env.server.ts`
- Modify: `.env.example`

- [ ] **Step 1: Replace `lib/env.server.ts` with the updated schema**

```typescript
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  CLERK_SECRET_KEY: z.string().min(1),
  CLERK_WEBHOOK_SECRET: z.string().min(1),
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET_NAME: z.string().min(1),
  R2_PUBLIC_URL: z.string().url(),
  ANTHROPIC_API_KEY: z.string().min(1),
  MAPBOX_SECRET_TOKEN: z.string().min(1),
  INNGEST_EVENT_KEY: z.string().min(1),
  INNGEST_SIGNING_KEY: z.string().optional(),
});

export const env = envSchema.parse(process.env);
```

`INNGEST_SIGNING_KEY` is optional because the Inngest local dev server doesn't require it — production does.

- [ ] **Step 2: Append to `.env.example`**

```
# Anthropic — from console.anthropic.com
ANTHROPIC_API_KEY=sk-ant-xxxx

# Mapbox — secret token from account.mapbox.com → Access tokens (must be secret, not public)
MAPBOX_SECRET_TOKEN=sk.eyJ...

# Inngest — from app.inngest.com → Event keys / Signing keys
# Local dev: set EVENT_KEY=local, leave SIGNING_KEY empty
INNGEST_EVENT_KEY=local
INNGEST_SIGNING_KEY=signkey-xxxx
```

- [ ] **Step 3: Fill in `.env.local`**

Manually add the four new vars to `.env.local`:

```
ANTHROPIC_API_KEY=sk-ant-<your-real-key>
MAPBOX_SECRET_TOKEN=sk.eyJ<your-real-token>
INNGEST_EVENT_KEY=local
# INNGEST_SIGNING_KEY not needed for local dev
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add lib/env.server.ts .env.example
git commit -m "chore: add Anthropic, Mapbox, and Inngest env vars"
```

---

### Task 3: Add segments table — schema and migration

**Files:**
- Modify: `lib/db/schema.ts` (full replacement)

- [ ] **Step 1: Replace `lib/db/schema.ts`**

```typescript
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
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Generate migration**

```bash
npm run db:generate
```

Expected: a new `.sql` file appears in `drizzle/` that creates the `segment_type` enum and `segments` table.

- [ ] **Step 4: Apply migration**

```bash
npm run db:migrate
```

Expected: migration applied to the Neon database with no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts drizzle/
git commit -m "feat: add segments table with booking FK, trip FK, and compound trip/time index"
```

---

### Task 4: Extend bookings repository

Add a general-purpose `updateBooking` so the Inngest function can partially update `type`, `rawAiOutput`, `status`, and `parseError` across multiple steps without a separate helper per field.

**Files:**
- Modify: `lib/db/repositories/bookings.ts`

- [ ] **Step 1: Append `updateBooking` to `lib/db/repositories/bookings.ts`**

```typescript
export async function updateBooking(
  id: string,
  data: Partial<Pick<NewBooking, 'status' | 'type' | 'parseError' | 'rawAiOutput'>>,
): Promise<void> {
  await db
    .update(bookings)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(bookings.id, id));
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add lib/db/repositories/bookings.ts
git commit -m "feat: add updateBooking partial update helper to bookings repository"
```

---

### Task 5: Create segments repository

**Files:**
- Create: `lib/db/repositories/segments.ts`

- [ ] **Step 1: Create `lib/db/repositories/segments.ts`**

```typescript
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { segments, type Segment, type NewSegment } from '@/lib/db/schema';

export async function createSegment(data: NewSegment): Promise<Segment> {
  const result = await db.insert(segments).values(data).returning();
  const segment = result[0];
  if (!segment) throw new Error('INSERT into segments returned no rows');
  return segment;
}

export async function getSegmentsByBookingId(bookingId: string): Promise<Segment[]> {
  return db.query.segments.findMany({
    where: eq(segments.bookingId, bookingId),
  });
}

export async function segmentExistsForBooking(bookingId: string): Promise<boolean> {
  const result = await db.query.segments.findFirst({
    where: eq(segments.bookingId, bookingId),
    columns: { id: true },
  });
  return result !== undefined;
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add lib/db/repositories/segments.ts
git commit -m "feat: add segments repository with create, query, and existence check"
```

---

### Task 6: Create AI schemas

Two schemas per booking type:
- **Extraction schema** — what the Anthropic tool returns (includes timestamps, timezone, location labels)
- **Details schema** — a subset that goes into `segments.details` JSONB (type-specific facts only)

The extraction schema is built by extending the details schema, so there's no duplication.

**Files:**
- Create: `lib/ai/schemas/flight.ts`
- Create: `lib/ai/schemas/hotel.ts`

- [ ] **Step 1: Create `lib/ai/schemas/flight.ts`**

```typescript
import { z } from 'zod';

export const FlightDetailsSchema = z.object({
  flight_number: z.string(),
  airline: z.string(),
  confirmation_code: z.string().nullable(),
  departure_airport_code: z.string(),
  arrival_airport_code: z.string(),
  departure_terminal: z.string().nullable(),
  arrival_terminal: z.string().nullable(),
  seat: z.string().nullable(),
  cabin_class: z.string().nullable(),
});

export type FlightDetails = z.infer<typeof FlightDetailsSchema>;

// Full tool output — extends details with fields used in the segments row
export const FlightExtractionSchema = FlightDetailsSchema.extend({
  departure_iso: z.string(),         // ISO 8601 with UTC offset, e.g. "2024-09-01T14:30:00-04:00"
  departure_timezone: z.string(),    // IANA, e.g. "America/Toronto"
  arrival_iso: z.string(),           // ISO 8601 with UTC offset
  arrival_timezone: z.string(),      // IANA, e.g. "Asia/Tokyo"
  departure_airport_label: z.string(), // "Toronto Pearson (YYZ)"
  arrival_airport_label: z.string(),   // "Tokyo Narita (NRT)"
});

export type FlightExtraction = z.infer<typeof FlightExtractionSchema>;
```

- [ ] **Step 2: Create `lib/ai/schemas/hotel.ts`**

```typescript
import { z } from 'zod';

export const HotelDetailsSchema = z.object({
  hotel_name: z.string(),
  address: z.string(),
  confirmation_code: z.string().nullable(),
  room_type: z.string().nullable(),
  guests: z.number().nullable(),
  check_in_time: z.string().nullable(),   // "15:00"
  check_out_time: z.string().nullable(),  // "11:00"
  phone: z.string().nullable(),
});

export type HotelDetails = z.infer<typeof HotelDetailsSchema>;

// Full tool output — extends details with fields used in the segments row
export const HotelExtractionSchema = HotelDetailsSchema.extend({
  check_in_iso: z.string(),   // ISO 8601 with UTC offset, e.g. "2024-09-02T15:00:00+09:00"
  check_out_iso: z.string(),  // ISO 8601 with UTC offset
  timezone: z.string(),       // IANA, e.g. "Asia/Tokyo"
});

export type HotelExtraction = z.infer<typeof HotelExtractionSchema>;
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add lib/ai/schemas/
git commit -m "feat: add Zod schemas for flight and hotel AI extraction"
```

---

### Task 7: Create AI prompts

**Files:**
- Create: `lib/ai/prompts/classifier.ts`
- Create: `lib/ai/prompts/flight.ts`
- Create: `lib/ai/prompts/hotel.ts`

- [ ] **Step 1: Create `lib/ai/prompts/classifier.ts`**

```typescript
export const classifierSystemPrompt = `You are a document classifier. The user will provide a booking confirmation document. Your task is to identify whether it is a flight booking or a hotel booking.

Respond with exactly one word — no punctuation, no explanation:
- "flight" if it is a flight booking confirmation
- "hotel" if it is a hotel booking confirmation
- "unknown" if you cannot determine the type or it is neither`;

export function classifierUserPrompt(fileName: string): string {
  return `Please classify this booking document: ${fileName}`;
}
```

- [ ] **Step 2: Create `lib/ai/prompts/flight.ts`**

```typescript
export const flightSystemPrompt = `You are a data extraction assistant specializing in flight booking confirmations.

For departure_iso and arrival_iso: use ISO 8601 format with the UTC offset for the local time at that airport, e.g. "2024-09-01T14:30:00-04:00". Use the standard offset for that timezone (DST approximation is acceptable).

For departure_timezone and arrival_timezone: use IANA timezone identifiers, e.g. "America/Toronto", "Asia/Tokyo".

For departure_airport_label and arrival_airport_label: use "City Name (IATA)" format, e.g. "Toronto Pearson (YYZ)".

All nullable fields must be null (not empty string) when the information is absent.`;

export function flightUserPrompt(fileName: string): string {
  return `Extract all flight booking details from this confirmation document: ${fileName}`;
}
```

- [ ] **Step 3: Create `lib/ai/prompts/hotel.ts`**

```typescript
export const hotelSystemPrompt = `You are a data extraction assistant specializing in hotel booking confirmations.

For check_in_iso and check_out_iso: use ISO 8601 format with the UTC offset for the hotel's local timezone. Include the check-in/check-out time if shown in the document, otherwise default to 15:00 for check-in and 11:00 for check-out. Example: "2024-09-02T15:00:00+09:00".

For timezone: use the IANA timezone identifier for the hotel's location, e.g. "Asia/Tokyo", "America/New_York".

All nullable fields must be null (not empty string) when the information is absent.`;

export function hotelUserPrompt(fileName: string): string {
  return `Extract all hotel booking details from this confirmation document: ${fileName}`;
}
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add lib/ai/prompts/
git commit -m "feat: add AI prompts for booking classification and extraction"
```

---

### Task 8: Create Anthropic client

**Files:**
- Create: `lib/ai/client.ts`

- [ ] **Step 1: Create `lib/ai/client.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { env } from '@/lib/env.server';

export const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add lib/ai/client.ts
git commit -m "feat: add Anthropic client singleton"
```

---

### Task 9: Add R2 presigned GET URL

Anthropic needs to fetch the file from R2. The existing R2 helper only has a presigned PUT. Add a presigned GET.

**Files:**
- Modify: `lib/r2/index.ts`

- [ ] **Step 1: Add `GetObjectCommand` to the import and append `getPresignedGetUrl`**

Change the import line at the top of `lib/r2/index.ts` from:

```typescript
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
```

to:

```typescript
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
```

Then append to the end of the file:

```typescript
export async function getPresignedGetUrl(key: string, expiresIn = 3600): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
  });
  return getSignedUrl(r2, command, { expiresIn });
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add lib/r2/index.ts
git commit -m "feat: add getPresignedGetUrl helper for Anthropic document access"
```

---

### Task 10: Create Mapbox geocoding client

Uses the Mapbox Geocoding REST API v5 via `fetch`. No SDK needed.

**Files:**
- Create: `lib/mapbox/client.ts`

- [ ] **Step 1: Create `lib/mapbox/client.ts`**

```typescript
import { env } from '@/lib/env.server';

type GeocodingResponse = {
  features: Array<{
    geometry: { type: string; coordinates: [number, number] };
  }>;
};

export async function geocode(query: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const encoded = encodeURIComponent(query);
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${env.MAPBOX_SECRET_TOKEN}&limit=1`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = (await response.json()) as GeocodingResponse;
    const first = data.features[0];
    if (!first) return null;
    const [lng, lat] = first.geometry.coordinates;
    if (lat === undefined || lng === undefined) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}
```

Note: Mapbox returns coordinates as `[longitude, latitude]` — the destructuring order `[lng, lat]` is intentional.

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add lib/mapbox/client.ts
git commit -m "feat: add Mapbox geocoding client using REST API v5"
```

---

### Task 11: Create Inngest client and webhook route

**Files:**
- Create: `lib/inngest/client.ts`
- Create: `app/api/inngest/route.ts`

- [ ] **Step 1: Create `lib/inngest/client.ts`**

```typescript
import { Inngest } from 'inngest';

export const inngest = new Inngest({ id: 'wayfare' });
```

- [ ] **Step 2: Create `app/api/inngest/route.ts`**

Register an empty functions array for now. Task 12 updates this after the function is created.

```typescript
import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [],
});
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add lib/inngest/client.ts app/api/inngest/route.ts
git commit -m "feat: add Inngest client singleton and Next.js webhook route"
```

---

### Task 12: Create the parse-booking Inngest function

This is the core of Phase 3. All four steps live in one function.

**Design notes before reading the code:**
- Each `step.run(name, fn)` call is cached independently by Inngest — retries resume from the failed step
- Presigned R2 URLs are generated fresh inside each step that needs them, not passed between steps (presigned URLs expire in 3600s — passing across steps risks expiry on retry)
- `rawAiOutput` is stored to `bookings.rawAiOutput` after successful extraction for debugging
- The write step checks for an existing segment before inserting (idempotency guard for retries)
- The outer `try/catch` is the last resort: if Inngest exhausts all retries, mark the booking `parsing_failed`

**Files:**
- Create: `lib/inngest/functions/parse-booking.ts`
- Modify: `app/api/inngest/route.ts`

- [ ] **Step 1: Create `lib/inngest/functions/parse-booking.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import zodToJsonSchema from 'zod-to-json-schema';
import { inngest } from '@/lib/inngest/client';
import { anthropic } from '@/lib/ai/client';
import { getPresignedGetUrl } from '@/lib/r2';
import { geocode } from '@/lib/mapbox/client';
import { getBookingById, updateBooking } from '@/lib/db/repositories/bookings';
import { createSegment, segmentExistsForBooking } from '@/lib/db/repositories/segments';
import { classifierSystemPrompt, classifierUserPrompt } from '@/lib/ai/prompts/classifier';
import { flightSystemPrompt, flightUserPrompt } from '@/lib/ai/prompts/flight';
import { hotelSystemPrompt, hotelUserPrompt } from '@/lib/ai/prompts/hotel';
import {
  FlightExtractionSchema,
  FlightDetailsSchema,
  type FlightExtraction,
} from '@/lib/ai/schemas/flight';
import {
  HotelExtractionSchema,
  HotelDetailsSchema,
  type HotelExtraction,
} from '@/lib/ai/schemas/hotel';

export const parseBookingFunction = inngest.createFunction(
  { id: 'parse-booking', name: 'Parse Booking' },
  { event: 'booking/uploaded' },
  async ({ event, step }) => {
    const { bookingId } = event.data as { bookingId: string };

    try {
      // ── Step 1: Classify ────────────────────────────────────────────────────
      const { bookingType } = await step.run('classify', async () => {
        const booking = await getBookingById(bookingId);
        if (!booking) throw new Error(`Booking ${bookingId} not found`);

        const fileUrl = await getPresignedGetUrl(booking.fileKey);

        const message = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 10,
          system: classifierSystemPrompt,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'document', source: { type: 'url', url: fileUrl } },
                { type: 'text', text: classifierUserPrompt(booking.fileName) },
              ],
            },
          ],
        });

        const firstBlock = message.content[0];
        const raw =
          firstBlock?.type === 'text' ? firstBlock.text.trim().toLowerCase() : 'unknown';
        const bookingType =
          raw === 'flight' ? ('flight' as const) :
          raw === 'hotel'  ? ('hotel' as const) :
                             ('unknown' as const);

        if (bookingType === 'unknown') {
          await updateBooking(bookingId, {
            status: 'parsing_failed',
            parseError: "We couldn't identify this document as a flight or hotel booking.",
          });
          return { bookingType: 'unknown' as const };
        }

        await updateBooking(bookingId, { type: bookingType });
        return { bookingType };
      });

      if (bookingType === 'unknown') return { status: 'unknown_document' };

      // ── Step 2: Extract ─────────────────────────────────────────────────────
      const extractionResult = await step.run('extract', async () => {
        const booking = await getBookingById(bookingId);
        if (!booking) throw new Error(`Booking ${bookingId} not found`);

        // Re-generate the presigned URL — do not pass it from step 1 as it may expire on retry
        const fileUrl = await getPresignedGetUrl(booking.fileKey);

        const isHotel = bookingType === 'hotel';
        const schema = isHotel ? HotelExtractionSchema : FlightExtractionSchema;
        const toolName = isHotel ? 'record_hotel_booking' : 'record_flight_booking';
        const systemPrompt = isHotel ? hotelSystemPrompt : flightSystemPrompt;
        const userPrompt = isHotel
          ? hotelUserPrompt(booking.fileName)
          : flightUserPrompt(booking.fileName);

        const inputSchema = zodToJsonSchema(schema, {
          target: 'jsonSchema7',
        }) as Anthropic.Tool['input_schema'];

        const message = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          system: systemPrompt,
          tools: [{ name: toolName, description: `Record ${bookingType} booking details`, input_schema: inputSchema }],
          tool_choice: { type: 'tool', name: toolName },
          messages: [
            {
              role: 'user',
              content: [
                { type: 'document', source: { type: 'url', url: fileUrl } },
                { type: 'text', text: userPrompt },
              ],
            },
          ],
        });

        const toolBlock = message.content.find(
          (c): c is Anthropic.ToolUseBlock => c.type === 'tool_use',
        );
        if (!toolBlock) {
          await updateBooking(bookingId, {
            status: 'parsing_failed',
            parseError: 'The AI did not return extraction results.',
          });
          return null;
        }

        const parsed = schema.safeParse(toolBlock.input);
        if (!parsed.success) {
          await updateBooking(bookingId, {
            status: 'parsing_failed',
            parseError: 'The AI extracted data in an unexpected format.',
          });
          return null;
        }

        await updateBooking(bookingId, {
          rawAiOutput: toolBlock.input as Record<string, unknown>,
        });
        return parsed.data;
      });

      if (!extractionResult) return { status: 'extraction_failed' };

      // ── Step 3: Geocode ─────────────────────────────────────────────────────
      const coords = await step.run('geocode', async () => {
        if (bookingType === 'flight') {
          const data = extractionResult as FlightExtraction;
          const [startCoords, endCoords] = await Promise.all([
            geocode(`${data.departure_airport_code} airport`),
            geocode(`${data.arrival_airport_code} airport`),
          ]);
          return {
            startLat: startCoords ? String(startCoords.lat) : null,
            startLng: startCoords ? String(startCoords.lng) : null,
            endLat: endCoords ? String(endCoords.lat) : null,
            endLng: endCoords ? String(endCoords.lng) : null,
          };
        } else {
          const data = extractionResult as HotelExtraction;
          const hotelCoords = await geocode(data.address);
          const latStr = hotelCoords ? String(hotelCoords.lat) : null;
          const lngStr = hotelCoords ? String(hotelCoords.lng) : null;
          return { startLat: latStr, startLng: lngStr, endLat: latStr, endLng: lngStr };
        }
      });

      // ── Step 4: Write ───────────────────────────────────────────────────────
      const { segmentId } = await step.run('write', async () => {
        const booking = await getBookingById(bookingId);
        if (!booking) throw new Error(`Booking ${bookingId} not found`);

        const alreadyExists = await segmentExistsForBooking(bookingId);

        if (!alreadyExists) {
          if (bookingType === 'flight') {
            const data = extractionResult as FlightExtraction;
            const details = FlightDetailsSchema.parse(data);
            const segment = await createSegment({
              bookingId,
              tripId: booking.tripId,
              type: 'flight',
              startTime: new Date(data.departure_iso),
              startTimezone: data.departure_timezone,
              endTime: new Date(data.arrival_iso),
              endTimezone: data.arrival_timezone,
              startLocation: data.departure_airport_label,
              startLat: coords.startLat,
              startLng: coords.startLng,
              endLocation: data.arrival_airport_label,
              endLat: coords.endLat,
              endLng: coords.endLng,
              details,
            });
            await updateBooking(bookingId, { status: 'parsed' });
            return { segmentId: segment.id };
          } else {
            const data = extractionResult as HotelExtraction;
            const details = HotelDetailsSchema.parse(data);
            const segment = await createSegment({
              bookingId,
              tripId: booking.tripId,
              type: 'hotel_stay',
              startTime: new Date(data.check_in_iso),
              startTimezone: data.timezone,
              endTime: new Date(data.check_out_iso),
              endTimezone: data.timezone,
              startLocation: data.address,
              startLat: coords.startLat,
              startLng: coords.startLng,
              endLocation: data.address,
              endLat: coords.endLat,
              endLng: coords.endLng,
              details,
            });
            await updateBooking(bookingId, { status: 'parsed' });
            return { segmentId: segment.id };
          }
        }

        // Segment already exists (idempotent retry) — just ensure booking is marked parsed
        await updateBooking(bookingId, { status: 'parsed' });
        return { segmentId: null };
      });

      return { status: 'parsed', segmentId };
    } catch (err) {
      await updateBooking(bookingId, {
        status: 'parsing_failed',
        parseError: 'Something went wrong while parsing your document.',
      });
      throw err;
    }
  },
);
```

- [ ] **Step 2: Register the function in `app/api/inngest/route.ts`**

Replace the entire file:

```typescript
import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { parseBookingFunction } from '@/lib/inngest/functions/parse-booking';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [parseBookingFunction],
});
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors. The most common type error here is `input_schema` type mismatch — if it occurs, cast the `zodToJsonSchema` output as `Anthropic.Tool['input_schema']` (already shown in the code above).

- [ ] **Step 4: Commit**

```bash
git add lib/inngest/functions/parse-booking.ts app/api/inngest/route.ts
git commit -m "feat: add 4-step parse-booking Inngest function (classify, extract, geocode, write)"
```

---

### Task 13: Wire the Inngest event trigger in actions.ts

Replace the Phase 3 placeholder comment with a real `inngest.send()` call.

**Files:**
- Modify: `app/(app)/trips/[tripId]/actions.ts`

- [ ] **Step 1: Add Inngest import**

At the top of `app/(app)/trips/[tripId]/actions.ts`, add to the imports:

```typescript
import { inngest } from '@/lib/inngest/client';
```

- [ ] **Step 2: Replace the placeholder comment**

Find lines 113–114:

```typescript
    await updateBookingStatus(bookingId, 'parsing');
    // Phase 3 will add: await inngest.send({ name: 'booking/uploaded', data: { bookingId } })
```

Replace with:

```typescript
    await updateBookingStatus(bookingId, 'parsing');
    await inngest.send({ name: 'booking/uploaded', data: { bookingId } });
```

- [ ] **Step 3: Typecheck + lint**

```bash
npm run typecheck && npm run lint
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/trips/[tripId]/actions.ts"
git commit -m "feat: fire booking/uploaded Inngest event after upload confirmation"
```

---

### Task 14: Update TripWithBookings to include segments

The BookingCard will need segment data to render the `parsed` state. Update `getTripWithBookings` to eagerly load segments within each booking.

**Files:**
- Modify: `lib/db/repositories/trips.ts`

- [ ] **Step 1: Update `getTripWithBookings` to include segments**

Replace the `getTripWithBookings` function:

```typescript
export async function getTripWithBookings(id: string) {
  return db.query.trips.findFirst({
    where: eq(trips.id, id),
    with: {
      bookings: {
        orderBy: (b, { asc }) => [asc(b.createdAt)],
        with: { segments: true },
      },
    },
  });
}
```

The `TripWithBookings` type is inferred from the return type so it automatically includes segments — no other changes needed.

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add lib/db/repositories/trips.ts
git commit -m "feat: include segments in getTripWithBookings eager load"
```

---

### Task 15: Update BookingCard and TripDetailClient to display parsed data

**Files:**
- Modify: `components/trips/BookingCard.tsx`
- Modify: `components/trips/TripDetailClient.tsx`

- [ ] **Step 1: Replace `components/trips/BookingCard.tsx`**

```typescript
import type { Booking, Segment } from '@/lib/db/schema';
import type { FlightDetails } from '@/lib/ai/schemas/flight';
import type { HotelDetails } from '@/lib/ai/schemas/hotel';

type Props = {
  booking: Booking;
  segment?: Segment;
};

const typeIcon: Record<string, string> = {
  flight: '✈',
  hotel: '🏨',
  unknown: '📄',
};

function formatLocalDate(utcDate: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(utcDate);
}

function formatLocalTime(utcDate: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(utcDate);
}

export function BookingCard({ booking, segment }: Props) {
  const icon = typeIcon[booking.type] ?? '📄';

  return (
    <div className="flex items-start gap-3 bg-card border border-border rounded-md px-3 py-2.5">
      <div className="w-8 h-8 rounded bg-muted flex items-center justify-center flex-shrink-0 text-base mt-0.5">
        {booking.status === 'uploading' ? (
          <span className="block w-4 h-4 border-2 border-muted-foreground/30 border-t-foreground rounded-full animate-spin" />
        ) : (
          icon
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{booking.fileName}</p>
        <StatusLine booking={booking} segment={segment} />
      </div>
    </div>
  );
}

function StatusLine({ booking, segment }: { booking: Booking; segment?: Segment }) {
  switch (booking.status) {
    case 'uploading':
      return <p className="text-xs text-muted-foreground">Uploading…</p>;
    case 'parsing':
      return <p className="text-xs text-amber-500">Parsing with AI…</p>;
    case 'parsed':
      return <ParsedLine segment={segment} />;
    case 'parsing_failed':
      return (
        <p className="text-xs text-destructive">
          {booking.parseError ?? "Couldn't parse this file"}
        </p>
      );
    default:
      return null;
  }
}

function ParsedLine({ segment }: { segment?: Segment }) {
  if (!segment) return <p className="text-xs text-emerald-500">✓ Parsed</p>;

  if (segment.type === 'flight') {
    const details = segment.details as FlightDetails;
    const depTime = formatLocalTime(new Date(segment.startTime), segment.startTimezone);
    const arrTime = formatLocalTime(new Date(segment.endTime), segment.endTimezone);
    return (
      <div className="text-xs text-muted-foreground space-y-0.5 mt-0.5">
        <p className="font-medium text-foreground">
          {details.departure_airport_code} → {details.arrival_airport_code}
        </p>
        <p>
          {details.flight_number} · {details.airline}
        </p>
        <p>
          {depTime} → {arrTime}
        </p>
      </div>
    );
  }

  if (segment.type === 'hotel_stay') {
    const details = segment.details as HotelDetails;
    const checkIn = formatLocalDate(new Date(segment.startTime), segment.startTimezone);
    const checkOut = formatLocalDate(new Date(segment.endTime), segment.endTimezone);
    return (
      <div className="text-xs text-muted-foreground space-y-0.5 mt-0.5">
        <p className="font-medium text-foreground">{details.hotel_name}</p>
        <p>
          {checkIn} → {checkOut}
        </p>
        <p className="truncate">{details.address}</p>
      </div>
    );
  }

  return <p className="text-xs text-emerald-500">✓ Parsed</p>;
}
```

- [ ] **Step 2: Update BookingCard usage in `components/trips/TripDetailClient.tsx`**

Find the booking map (around line 90–92):

```tsx
{data.bookings.map((booking) => (
  <BookingCard key={booking.id} booking={booking} />
))}
```

Replace with:

```tsx
{data.bookings.map((booking) => (
  <BookingCard key={booking.id} booking={booking} segment={booking.segments[0]} />
))}
```

- [ ] **Step 3: Typecheck + lint**

```bash
npm run typecheck && npm run lint
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 4: Commit**

```bash
git add components/trips/BookingCard.tsx components/trips/TripDetailClient.tsx
git commit -m "feat: render parsed flight/hotel segment data in BookingCard"
```

---

### Task 16: End-to-end verification

- [ ] **Step 1: Start the dev server**

In terminal 1:

```bash
npm run dev
```

Expected: Next.js app on http://localhost:3000 with no startup errors.

- [ ] **Step 2: Start the Inngest dev server**

In terminal 2:

```bash
npx inngest-cli@latest dev
```

Expected: Inngest dev server on http://localhost:8288. Within a few seconds it should discover the `parse-booking` function by polling `http://localhost:3000/api/inngest` and show it in the UI under "Functions".

- [ ] **Step 3: Test the happy path — flight**

1. Sign in at http://localhost:3000
2. Create a trip
3. Upload a real flight confirmation PDF (or JPEG/PNG screenshot of one)
4. Watch http://localhost:8288 — a `parse-booking` run should appear
5. Click into the run to see classify → extract → geocode → write steps completing
6. Return to the trip page — the BookingCard should show the route (`YYZ → NRT`), flight number, airline, and departure/arrival times

- [ ] **Step 4: Test the happy path — hotel**

Upload a real hotel confirmation PDF. The BookingCard should show the hotel name, date range, and address.

- [ ] **Step 5: Test the failure path**

Upload a plain PDF that is not a booking (e.g. a resume). The classifier should return `unknown` and the BookingCard should show `parsing_failed` with the message "We couldn't identify this document as a flight or hotel booking."

- [ ] **Step 6: Final typecheck + lint**

```bash
npm run typecheck && npm run lint
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 7: Commit any verification fixes**

If any issues were found and fixed during verification, commit them:

```bash
git add <changed files>
git commit -m "fix: <describe what was fixed>"
```

---

## Post-phase deployment checklist

Before deploying to Vercel, add these four env vars in the Vercel project dashboard (Settings → Environment Variables):

| Variable | Where to find it |
|----------|-----------------|
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `MAPBOX_SECRET_TOKEN` | account.mapbox.com → Access tokens (secret token, not public) |
| `INNGEST_EVENT_KEY` | app.inngest.com → Event Keys |
| `INNGEST_SIGNING_KEY` | app.inngest.com → Signing Keys |

After deploy, register the Vercel URL as the Inngest app endpoint in the Inngest cloud dashboard: `https://your-app.vercel.app/api/inngest`.
